import { db } from './db';
import { serverBilling, billingLedger, wallets, walletTransactions, userFlags } from '../shared/schema';
import { eq, and, lte, isNull, or, not, gte, gt, lt, sql } from 'drizzle-orm';
import { log } from './log';
import { virtfusionClient } from './virtfusion';
import { auth0Client } from './auth0';
import { sendPaymentFailedEmail, sendServerSuspendedEmail, sendBillingReminderEmail, sendAutoTopupSuccessEmail, sendAutoTopupFailedEmail, sendBillingReceiptEmail } from './email';
import { getUncachableStripeClient } from './stripeClient';

export function getAutoTopupIdempotencyKey(wallet: {
  auth0UserId: string;
  balanceCents: number;
  updatedAt: Date | null;
  autoTopupAmountCents?: number | null;
  autoTopupPaymentMethodId?: string | null;
}): string {
  const updatedAtKey = wallet.updatedAt ? wallet.updatedAt.toISOString() : 'none';
  return [
    'auto_topup',
    wallet.auth0UserId,
    wallet.balanceCents,
    wallet.autoTopupAmountCents ?? 0,
    wallet.autoTopupPaymentMethodId ?? 'none',
    updatedAtKey,
  ].join('_');
}

// Check if a user's account is suspended
async function isUserAccountSuspended(auth0UserId: string): Promise<boolean> {
  const [flags] = await db.select().from(userFlags).where(eq(userFlags.auth0UserId, auth0UserId));
  return flags?.suspended ?? false;
}

// Helper to get user email from Auth0
async function getUserEmail(auth0UserId: string): Promise<string | null> {
  try {
    const user = await auth0Client.getUserById(auth0UserId);
    return user?.email || null;
  } catch (error) {
    log(`Failed to get email for user ${auth0UserId}: ${error}`, 'billing');
    return null;
  }
}

// Helper to get server name from VirtFusion
async function getServerName(serverId: string): Promise<string> {
  try {
    const server = await virtfusionClient.getServer(serverId);
    return server?.name || `Server #${serverId}`;
  } catch (error) {
    return `Server #${serverId}`;
  }
}

// Format date for email display
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-AU', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// Format currency
function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)} AUD`;
}

// Add 1 calendar month to a date (handles month-end cases)
function addMonth(date: Date): Date {
  const result = new Date(date);
  const currentMonth = result.getMonth();
  result.setMonth(currentMonth + 1);

  // If we overflow (e.g., Jan 31 + 1 month = Mar 3), go to last day of target month
  if (result.getMonth() !== (currentMonth + 1) % 12) {
    result.setDate(0); // Go to last day of previous month
  }

  return result;
}

// Create billing record for a new server
export async function createServerBilling(params: {
  auth0UserId: string;
  virtfusionServerId: string;
  virtfusionServerUuid?: string; // Immutable UUID for reliable lookup
  planId: number;
  monthlyPriceCents: number;
  deployedAt?: Date; // Optional - use server's actual creation date if available
}): Promise<void> {
  const deployedAt = params.deployedAt || new Date();
  const nextBillAt = addMonth(deployedAt);
  // Normalize to midnight UTC so billing job (8am UTC) always picks it up on the correct day
  nextBillAt.setUTCHours(0, 0, 0, 0);

  await db.insert(serverBilling).values({
    auth0UserId: params.auth0UserId,
    virtfusionServerId: params.virtfusionServerId,
    virtfusionServerUuid: params.virtfusionServerUuid || null,
    planId: params.planId,
    deployedAt,
    monthlyPriceCents: params.monthlyPriceCents,
    status: 'active',
    autoRenew: true,
    nextBillAt,
    suspendAt: null,
  });
  log(`Created billing record for server ${params.virtfusionServerId} (UUID: ${params.virtfusionServerUuid || 'N/A'}), next bill: ${nextBillAt.toISOString()}`, 'billing');
}

// Charge a server's monthly fee
// If reactivation=true, the next bill date is set to 1 month from now (for unsuspending)
// If reactivation=false (default), the next bill date is set to 1 month from the previous due date
type ChargeServerResult = {
  success: boolean;
  chargedFresh: boolean;
  currentBilling: typeof serverBilling.$inferSelect;
  idempotencyKey?: string;
  serverName?: string;
};

async function chargeServer(billing: typeof serverBilling.$inferSelect, reactivation: boolean = false): Promise<ChargeServerResult> {
  // Skip complimentary servers - they don't get charged
  if (billing.freeServer) {
    log(`Skipping charge for complimentary server ${billing.virtfusionServerId}`, 'billing');
    return {
      success: true,
      chargedFresh: false,
      currentBilling: billing,
    };
  }

  // Get server name for transaction description
  const serverName = await getServerName(billing.virtfusionServerId);

  return await db.transaction(async (tx) => {
    // Lock wallet row FIRST to prevent concurrent charges
    const walletRows = await tx.select().from(wallets)
      .where(eq(wallets.auth0UserId, billing.auth0UserId))
      .for('update')
      .limit(1);

    if (walletRows.length === 0) {
      log(`No wallet found for user ${billing.auth0UserId}`, 'billing');
      return {
        success: false,
        chargedFresh: false,
        currentBilling: billing,
      };
    }

    // Re-read and lock the live billing row so stale callers can't undo a
    // payment or reactivation that already completed in another request.
    const currentBillingRows = await tx.select().from(serverBilling)
      .where(eq(serverBilling.id, billing.id))
      .for('update')
      .limit(1);

    if (currentBillingRows.length === 0) {
      log(`Billing record ${billing.id} disappeared before charge for server ${billing.virtfusionServerId}`, 'billing');
      return {
        success: false,
        chargedFresh: false,
        currentBilling: billing,
      };
    }

    const currentBilling = currentBillingRows[0];

    if (currentBilling.freeServer) {
      log(`Skipping charge for complimentary server ${currentBilling.virtfusionServerId}`, 'billing');
      return {
        success: true,
        chargedFresh: false,
        currentBilling,
      };
    }

    const billingWasUpdated =
      currentBilling.nextBillAt.getTime() !== billing.nextBillAt.getTime() ||
      currentBilling.status !== billing.status;

    if (
      billingWasUpdated &&
      currentBilling.status === 'paid' &&
      currentBilling.suspendAt === null &&
      currentBilling.nextBillAt.getTime() > billing.nextBillAt.getTime()
    ) {
      log(`Server ${currentBilling.virtfusionServerId} was already settled by another process; skipping stale charge request`, 'billing');
      return {
        success: true,
        chargedFresh: false,
        currentBilling,
      };
    }

    const idempotencyKey = `bill:${currentBilling.virtfusionServerId}:${currentBilling.nextBillAt.toISOString()}`;

    // Check idempotency AFTER acquiring wallet lock to prevent duplicate charges
    const existing = await tx.select().from(billingLedger)
      .where(eq(billingLedger.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing.length > 0) {
      if (currentBilling.status === 'paid') {
        // Server is already paid for this period — skip to avoid double-charging
        log(`Server ${billing.virtfusionServerId} already paid for ${billing.nextBillAt.toISOString()} — skipping`, 'billing');
        return {
          success: true,
          chargedFresh: false,
          currentBilling,
          idempotencyKey,
          serverName,
        };
      }
      // Ledger entry exists but status is not 'paid' — stale entry (DB was reset or admin changed status).
      // Delete the stale entry and charge fresh so the wallet is correctly debited.
      await tx.delete(billingLedger).where(eq(billingLedger.idempotencyKey, idempotencyKey));
      log(`Server ${billing.virtfusionServerId}: stale ledger entry cleared (status=${billing.status}), charging fresh`, 'billing');
      // Fall through to charge fresh below
    }

    const wallet = walletRows[0];

    if (wallet.balanceCents < currentBilling.monthlyPriceCents) {
      log(`Insufficient balance for server ${currentBilling.virtfusionServerId}: need ${currentBilling.monthlyPriceCents}, have ${wallet.balanceCents}`, 'billing');
      return {
        success: false,
        chargedFresh: false,
        currentBilling,
        idempotencyKey,
        serverName,
      };
    }

    // Deduct from wallet
    await tx.update(wallets)
      .set({
        balanceCents: wallet.balanceCents - currentBilling.monthlyPriceCents,
        updatedAt: new Date(),
      })
      .where(eq(wallets.auth0UserId, currentBilling.auth0UserId));

    // Record in ledger (for idempotency)
    await tx.insert(billingLedger).values({
      auth0UserId: currentBilling.auth0UserId,
      virtfusionServerId: currentBilling.virtfusionServerId,
      amountCents: currentBilling.monthlyPriceCents,
      description: `Server renewal - ${serverName}`,
      idempotencyKey,
    });

    // Record in wallet transactions (for user visibility)
    // Only call it "reactivation" if the server was actually suspended — unpaid-but-running
    // servers that get auto-charged after a top-up should just show as "Monthly billing"
    const transactionDescription = (reactivation && currentBilling.status === 'suspended')
      ? 'Server reactivation'
      : 'Monthly billing';

    await tx.insert(walletTransactions).values({
      auth0UserId: currentBilling.auth0UserId,
      type: 'debit',
      amountCents: -currentBilling.monthlyPriceCents, // Negative for debits
      metadata: {
        serverId: currentBilling.virtfusionServerId,
        serverName,
        description: transactionDescription,
        ...(reactivation && {
          reactivation: true,
          previousStatus: currentBilling.status,
          previousDueDate: currentBilling.nextBillAt.toISOString(),
        }),
      },
    });

    // Update billing record
    // For reactivation (unsuspending), set next bill to 1 month from now
    // For regular billing, set next bill to 1 month from the previous due date
    const newNextBillAt = reactivation ? addMonth(new Date()) : addMonth(currentBilling.nextBillAt);
    newNextBillAt.setUTCHours(0, 0, 0, 0); // Normalize to midnight UTC
    await tx.update(serverBilling)
      .set({
        status: 'paid',
        nextBillAt: newNextBillAt,
        suspendAt: null,
        updatedAt: new Date(),
      })
      .where(eq(serverBilling.id, currentBilling.id));

    log(`Charged server ${currentBilling.virtfusionServerId}: $${currentBilling.monthlyPriceCents / 100}`, 'billing');

    // Send billing receipt email (non-blocking)
    getUserEmail(currentBilling.auth0UserId).then(email => {
      if (email) {
        const amountDollars = `$${(currentBilling.monthlyPriceCents / 100).toFixed(2)}`;
        sendBillingReceiptEmail(email, serverName, amountDollars, newNextBillAt.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })).catch(err => {
          log(`Failed to send billing receipt email to ${email}: ${err.message}`, 'billing');
        });
      }
    }).catch(() => {});

    return {
      success: true,
      chargedFresh: true,
      currentBilling: {
        ...currentBilling,
        status: 'paid',
        nextBillAt: newNextBillAt,
        suspendAt: null,
        updatedAt: new Date(),
      },
      idempotencyKey,
      serverName,
    };
  });
}

async function refundFailedUnsuspendCharge(
  billing: typeof serverBilling.$inferSelect,
  idempotencyKey: string,
  serverName: string
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(wallets)
      .set({
        balanceCents: sql`${wallets.balanceCents} + ${billing.monthlyPriceCents}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.auth0UserId, billing.auth0UserId));

    await tx.insert(walletTransactions).values({
      auth0UserId: billing.auth0UserId,
      type: 'refund',
      amountCents: billing.monthlyPriceCents,
      metadata: {
        serverId: billing.virtfusionServerId,
        serverName,
        reason: 'Server unsuspend failed after payment - auto refund',
      },
    });

    await tx.delete(billingLedger).where(eq(billingLedger.idempotencyKey, idempotencyKey));
    await tx.update(serverBilling)
      .set({ status: 'suspended', updatedAt: new Date() })
      .where(eq(serverBilling.id, billing.id));
  });
}

// Attempt to automatically charge the user's saved payment method to top up their wallet.
// Returns true if the top-up succeeded and the wallet now has enough to cover neededCents.
async function attemptAutoTopup(auth0UserId: string, neededCents: number): Promise<boolean> {
  try {
    const [wallet] = await db.select().from(wallets)
      .where(eq(wallets.auth0UserId, auth0UserId))
      .limit(1);

    if (!wallet?.autoTopupEnabled || !wallet.autoTopupPaymentMethodId || !wallet.stripeCustomerId) {
      return false;
    }

    const topupAmount = wallet.autoTopupAmountCents || 2000;

    // Only proceed if topping up will actually cover the charge
    if (wallet.balanceCents + topupAmount < neededCents) {
      log(`Auto top-up amount (${formatCurrency(topupAmount)}) insufficient to cover charge (${formatCurrency(neededCents)}) for ${auth0UserId}`, 'billing');
      return false;
    }

    const stripe = await getUncachableStripeClient();

    let paymentMethod;
    try {
      paymentMethod = await stripe.paymentMethods.retrieve(wallet.autoTopupPaymentMethodId);
    } catch {
      log(`Auto top-up: failed to retrieve payment method for ${auth0UserId}`, 'billing');
      return false;
    }

    if (paymentMethod.customer !== wallet.stripeCustomerId) {
      log(`Auto top-up: payment method doesn't belong to customer for ${auth0UserId}`, 'billing');
      return false;
    }

    // Reject expired cards
    const now = new Date();
    const expYear = paymentMethod.card?.exp_year || 0;
    const expMonth = paymentMethod.card?.exp_month || 0;
    if (expYear < now.getFullYear() || (expYear === now.getFullYear() && expMonth < now.getMonth() + 1)) {
      log(`Auto top-up: card expired for ${auth0UserId}`, 'billing');
      return false;
    }

    // Key off the wallet state so retries of the same charge dedupe cleanly,
    // but a later legitimate top-up the same day can still proceed.
    const idempotencyKey = getAutoTopupIdempotencyKey(wallet);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: topupAmount,
      currency: 'aud',
      customer: wallet.stripeCustomerId,
      payment_method: wallet.autoTopupPaymentMethodId,
      off_session: true,
      confirm: true,
      description: 'Auto wallet top-up',
      metadata: { auth0_user_id: auth0UserId, type: 'wallet_topup', source: 'auto_topup' },
    }, { idempotencyKey });

    if (paymentIntent.status !== 'succeeded') {
      log(`Auto top-up payment declined for ${auth0UserId}: ${paymentIntent.status}`, 'billing');
      const email = await getUserEmail(auth0UserId);
      if (email) {
        await sendAutoTopupFailedEmail(email, formatCurrency(topupAmount), 'Payment was declined').catch(() => {});
      }
      return false;
    }

    // Credit wallet — inside a transaction with idempotency check
    const cardBrand = paymentMethod.card?.brand
      ? paymentMethod.card.brand.charAt(0).toUpperCase() + paymentMethod.card.brand.slice(1)
      : undefined;

    await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(walletTransactions)
        .where(eq(walletTransactions.stripePaymentIntentId, paymentIntent.id));
      if (existing) {
        log(`Auto top-up: payment ${paymentIntent.id} already credited, skipping duplicate`, 'billing');
        return;
      }
      await tx.update(wallets)
        .set({ balanceCents: sql`${wallets.balanceCents} + ${topupAmount}`, updatedAt: new Date() })
        .where(eq(wallets.auth0UserId, auth0UserId));
      await tx.insert(walletTransactions).values({
        auth0UserId,
        type: 'credit',
        amountCents: topupAmount,
        stripePaymentIntentId: paymentIntent.id,
        metadata: { source: 'auto_topup', cardBrand, cardLast4: paymentMethod.card?.last4, reason: 'Auto wallet top-up' },
      });
    });

    log(`Auto top-up successful for ${auth0UserId}: ${formatCurrency(topupAmount)}`, 'billing');

    const email = await getUserEmail(auth0UserId);
    if (email) {
      const [updatedWallet] = await db.select().from(wallets).where(eq(wallets.auth0UserId, auth0UserId)).limit(1);
      await sendAutoTopupSuccessEmail(email, formatCurrency(topupAmount), formatCurrency(updatedWallet?.balanceCents ?? 0)).catch(() => {});
    }

    return true;
  } catch (error: any) {
    log(`Auto top-up error for ${auth0UserId}: ${error.message}`, 'billing');
    return false;
  }
}

export interface BillingJobResult {
  serversFound: number;
  charged: string[];
  skippedSuspendedUser: string[];
  skippedInsufficientFunds: string[];
  skippedAlreadyCharged: string[];
  errors: string[];
  nextBillDates: Record<string, string>; // serverId -> nextBillAt ISO
}

// Main billing job - runs every 10 minutes
export async function runBillingJob(): Promise<BillingJobResult> {
  const result: BillingJobResult = {
    serversFound: 0,
    charged: [],
    skippedSuspendedUser: [],
    skippedInsufficientFunds: [],
    skippedAlreadyCharged: [],
    errors: [],
    nextBillDates: {},
  };

  const now = new Date();

  log('Starting billing job...', 'billing');

  // Compare against end of today (UTC) so servers due any time today are charged,
  // regardless of the exact time-of-day stored in nextBillAt.
  const endOfToday = new Date(now);
  endOfToday.setUTCHours(23, 59, 59, 999);

  // Step A: Charge due servers
  // Include 'active' status - new servers start as 'active' and need to be billed
  // Skip complimentary (free) servers - they don't get charged
  const dueServers = await db.select().from(serverBilling)
    .where(
      and(
        or(
          eq(serverBilling.status, 'active'),
          eq(serverBilling.status, 'paid'),
          eq(serverBilling.status, 'unpaid')
        ),
        eq(serverBilling.autoRenew, true),
        eq(serverBilling.freeServer, false), // Skip complimentary servers
        lte(serverBilling.nextBillAt, endOfToday)
      )
    );

  result.serversFound = dueServers.length;
  log(`Found ${dueServers.length} servers due for billing (endOfToday=${endOfToday.toISOString()})`, 'billing');

  // Log all found servers for debugging
  for (const s of dueServers) {
    result.nextBillDates[s.virtfusionServerId] = s.nextBillAt.toISOString();
    log(`Due server: ${s.virtfusionServerId}, status=${s.status}, nextBillAt=${s.nextBillAt.toISOString()}, price=${s.monthlyPriceCents}`, 'billing');
  }

  for (const billing of dueServers) {
    try {
      // Skip billing for users with suspended accounts
      if (await isUserAccountSuspended(billing.auth0UserId)) {
        log(`Skipping billing for server ${billing.virtfusionServerId} - user account is suspended`, 'billing');
        result.skippedSuspendedUser.push(billing.virtfusionServerId);
        continue;
      }

      let chargeResult = await chargeServer(billing);

      // If charge failed due to insufficient balance, try auto top-up then retry once
      if (!chargeResult.success) {
        const autoTopupOk = await attemptAutoTopup(billing.auth0UserId, billing.monthlyPriceCents);
        if (autoTopupOk) {
          chargeResult = await chargeServer(billing);
          if (chargeResult.success) {
            log(`Auto top-up enabled charge of server ${billing.virtfusionServerId}`, 'billing');
            result.charged.push(billing.virtfusionServerId + ' (auto-topup)');
            continue;
          }
        }
      }

      if (chargeResult.success) {
        result.charged.push(billing.virtfusionServerId);
      } else {
        result.skippedInsufficientFunds.push(billing.virtfusionServerId);
        // Payment failed (and auto top-up couldn't cover it) - mark as unpaid and set suspension date
        if (billing.status !== 'unpaid') {
          const suspendAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

          await db.update(serverBilling)
            .set({
              status: 'unpaid',
              suspendAt,
              lastReminderSentAt: null,
              updatedAt: new Date(),
            })
            .where(eq(serverBilling.id, billing.id));

          log(`Server ${billing.virtfusionServerId} marked unpaid, will suspend at ${suspendAt.toISOString()}`, 'billing');

          // Send payment failed email
          try {
            const email = await getUserEmail(billing.auth0UserId);
            if (email) {
              const serverName = await getServerName(billing.virtfusionServerId);
              await sendPaymentFailedEmail(
                email,
                serverName,
                formatCurrency(billing.monthlyPriceCents),
                formatDate(suspendAt),
                7 // days until suspension
              );
            }
          } catch (emailError: any) {
            log(`Failed to send payment failed email: ${emailError.message}`, 'billing');
          }
        }
      }
    } catch (error: any) {
      log(`Error charging server ${billing.virtfusionServerId}: ${error.message}`, 'billing');
      result.errors.push(`${billing.virtfusionServerId}: ${error.message}`);
    }
  }

  // Step B: Suspend overdue servers (skip complimentary servers)
  // B1: Servers with suspendAt date that has passed
  const overdueServers = await db.select().from(serverBilling)
    .where(
      and(
        eq(serverBilling.status, 'unpaid'),
        eq(serverBilling.freeServer, false), // Skip complimentary servers
        not(isNull(serverBilling.suspendAt)),
        lte(serverBilling.suspendAt, now)
      )
    );

  // B2: Safety net — catch servers 7+ days overdue that Step A may have missed
  // (e.g. due to a transient error). Excludes 'paid' to prevent double-charging
  // servers that Step A already handled this run. Requires autoRenew=true so
  // servers that opted out are never caught here.
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  log(`B2 check: looking for servers with nextBillAt <= ${sevenDaysAgo.toISOString()}`, 'billing');

  const longOverdueServers = await db.select().from(serverBilling)
    .where(
      and(
        or(
          eq(serverBilling.status, 'unpaid'),
          eq(serverBilling.status, 'active')
        ),
        eq(serverBilling.autoRenew, true),
        eq(serverBilling.freeServer, false),
        lte(serverBilling.nextBillAt, sevenDaysAgo) // 7+ days overdue
      )
    );

  // Log details of what we found
  for (const s of longOverdueServers) {
    log(`B2 found: server ${s.virtfusionServerId}, status=${s.status}, nextBillAt=${s.nextBillAt?.toISOString()}, freeServer=${s.freeServer}`, 'billing');
  }

  // Combine and dedupe the lists
  const allOverdueServers = [...overdueServers];
  const existingIds = new Set(overdueServers.map(s => s.id));
  for (const server of longOverdueServers) {
    if (!existingIds.has(server.id)) {
      allOverdueServers.push(server);
    }
  }

  log(`Found ${allOverdueServers.length} servers ready for suspension (${overdueServers.length} by suspendAt, ${longOverdueServers.length} by 7+ days overdue)`, 'billing');

  for (const billing of allOverdueServers) {
    try {
      // Skip suspension for users with suspended accounts - their servers are already powered off
      if (await isUserAccountSuspended(billing.auth0UserId)) {
        log(`Skipping suspension for server ${billing.virtfusionServerId} - user account is suspended`, 'billing');
        continue;
      }

      log(`Processing overdue server ${billing.virtfusionServerId}: status=${billing.status}, nextBillAt=${billing.nextBillAt?.toISOString()}`, 'billing');

      // ALWAYS attempt to charge before suspending — wallet may have been topped up since
      // the server was first marked unpaid or since the last billing attempt.
      // This covers both B1 (suspendAt overdue) and B2 (long overdue) servers.
      const chargeAttempt = await chargeServer(billing);
      if (chargeAttempt.success) {
        // Charge succeeded (new charge or idempotency — either way, money was collected).
        // Never suspend when a charge returns true.
        log(`Server ${billing.virtfusionServerId} charge succeeded, skipping suspension`, 'billing');
        // If server was suspended in VirtFusion, unsuspend it now that payment is confirmed
        if (billing.status === 'suspended') {
          try {
            await virtfusionClient.unsuspendServer(billing.virtfusionServerId);
            log(`Unsuspended server ${billing.virtfusionServerId} after successful charge`, 'billing');

            await db.update(serverBilling)
              .set({ status: 'paid', suspendAt: null, updatedAt: new Date() })
              .where(eq(serverBilling.id, billing.id));
          } catch (unsuspendErr: any) {
            log(`Could not unsuspend server ${billing.virtfusionServerId} after charge: ${unsuspendErr.message}`, 'billing');
            if (chargeAttempt.chargedFresh && chargeAttempt.idempotencyKey && chargeAttempt.serverName) {
              await refundFailedUnsuspendCharge(billing, chargeAttempt.idempotencyKey, chargeAttempt.serverName);
              log(`Refunded ${billing.monthlyPriceCents} cents for server ${billing.virtfusionServerId} due to background unsuspend failure`, 'billing');
            }
          }
        }
        continue;
      } else {
        log(`Server ${billing.virtfusionServerId} charge failed (insufficient balance), proceeding to suspend`, 'billing');
      }

      const latestBillingRows = await db.select().from(serverBilling)
        .where(eq(serverBilling.id, billing.id))
        .limit(1);

      if (latestBillingRows.length === 0) {
        log(`Billing record ${billing.id} disappeared before suspension for server ${billing.virtfusionServerId}`, 'billing');
        continue;
      }

      const latestBilling = latestBillingRows[0];

      if (
        latestBilling.freeServer ||
        !latestBilling.autoRenew ||
        (
          latestBilling.status === 'paid' &&
          latestBilling.suspendAt === null &&
          latestBilling.nextBillAt.getTime() > billing.nextBillAt.getTime()
        )
      ) {
        log(`Skipping stale suspension request for server ${latestBilling.virtfusionServerId}; billing was already updated`, 'billing');
        continue;
      }

      // Mark as unpaid before suspending (covers active/paid/unpaid statuses)
      if (latestBilling.status !== 'unpaid' && latestBilling.status !== 'suspended') {
        await db.update(serverBilling)
          .set({ status: 'unpaid', updatedAt: new Date() })
          .where(eq(serverBilling.id, latestBilling.id));
        log(`Server ${latestBilling.virtfusionServerId} marked as unpaid`, 'billing');
      }

      log(`Calling VirtFusion suspendServer for ${latestBilling.virtfusionServerId}`, 'billing');
      await virtfusionClient.suspendServer(latestBilling.virtfusionServerId);
      log(`VirtFusion suspend completed for ${latestBilling.virtfusionServerId}`, 'billing');

      await db.update(serverBilling)
        .set({
          status: 'suspended',
          updatedAt: new Date(),
        })
        .where(eq(serverBilling.id, latestBilling.id));

      log(`Suspended server ${latestBilling.virtfusionServerId} - database updated to status=suspended`, 'billing');

      // Send server suspended email
      try {
        const email = await getUserEmail(latestBilling.auth0UserId);
        if (email) {
          const serverName = await getServerName(latestBilling.virtfusionServerId);
          await sendServerSuspendedEmail(
            email,
            serverName,
            formatCurrency(latestBilling.monthlyPriceCents)
          );
        }
      } catch (emailError: any) {
        log(`Failed to send server suspended email: ${emailError.message}`, 'billing');
      }
    } catch (error: any) {
      log(`Error suspending server ${billing.virtfusionServerId}: ${error.message}`, 'billing');
    }
  }

  // Step C: Cleanup orphaned billing records (servers deleted from VirtFusion)
  await cleanupOrphanedBillingRecords();

  // Step D: Send reminders for servers due tomorrow and overdue warnings
  await sendBillingReminders();

  log(`Billing job completed. Charged: ${result.charged.length}, Skipped (no funds): ${result.skippedInsufficientFunds.length}, Skipped (already charged): ${result.skippedAlreadyCharged.length}, Skipped (user suspended): ${result.skippedSuspendedUser.length}, Errors: ${result.errors.length}`, 'billing');
  return result;
}

// Force charge a specific server — always deletes any existing ledger entry and
// charges fresh. Use this when billing is stuck due to a stale idempotency key.
export async function forceChargeServer(virtfusionServerId: string): Promise<{ success: boolean; message: string }> {
  const [billing] = await db.select().from(serverBilling)
    .where(eq(serverBilling.virtfusionServerId, virtfusionServerId))
    .limit(1);

  if (!billing) {
    return { success: false, message: `No billing record found for server ${virtfusionServerId}` };
  }

  if (billing.freeServer) {
    return { success: false, message: `Server ${virtfusionServerId} is a free server — nothing to charge` };
  }

  const idempotencyKey = `bill:${billing.virtfusionServerId}:${billing.nextBillAt.toISOString()}`;

  // Delete any existing ledger entry for this billing period so we can charge fresh
  const deleted = await db.delete(billingLedger)
    .where(eq(billingLedger.idempotencyKey, idempotencyKey))
    .returning();

  if (deleted.length > 0) {
    log(`Force charge: deleted stale ledger entry for server ${virtfusionServerId} (key: ${idempotencyKey})`, 'billing');
  }

  // Now charge fresh — this will deduct the wallet
  const charged = await chargeServer(billing);
  if (charged.success) {
    log(`Force charge: server ${virtfusionServerId} charged successfully`, 'billing');
    return { success: true, message: `Charged — $${(billing.monthlyPriceCents / 100).toFixed(2)} deducted from wallet` };
  } else {
    return { success: false, message: `Charge failed — insufficient wallet balance ($${(billing.monthlyPriceCents / 100).toFixed(2)} required)` };
  }
}

// Cleanup billing records for servers that no longer exist in VirtFusion
async function cleanupOrphanedBillingRecords(): Promise<void> {
  // Only check active/paid/unpaid records - cancelled ones are already handled
  const activeRecords = await db.select().from(serverBilling)
    .where(
      or(
        eq(serverBilling.status, 'active'),
        eq(serverBilling.status, 'paid'),
        eq(serverBilling.status, 'unpaid'),
        eq(serverBilling.status, 'suspended')
      )
    );

  let cleaned = 0;

  for (const record of activeRecords) {
    try {
      // Try to get the server from VirtFusion
      await virtfusionClient.getServer(record.virtfusionServerId);
    } catch (error: any) {
      // If 404 or not found, the server has been deleted
      if (error.message?.includes('404') || error.message?.includes('not found') || error.message?.includes('Not Found')) {
        // Delete the billing record
        await db.delete(serverBilling).where(eq(serverBilling.id, record.id));
        log(`Cleaned up orphaned billing record ${record.id} for deleted server ${record.virtfusionServerId}`, 'billing');
        cleaned++;
      }
      // For other errors (network issues, etc), skip this record
    }
  }

  if (cleaned > 0) {
    log(`Cleaned up ${cleaned} orphaned billing records`, 'billing');
  }
}

// Send billing reminders for servers due in the next 24 hours and overdue
// suspension warnings for servers that have been unpaid for 2+ days.
export async function sendBillingReminders(): Promise<void> {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  // Only send one reminder per server per day — billing job runs every 10 minutes
  // so without this guard each server would get ~144 emails per day
  const twentyHoursAgo = new Date(now.getTime() - 20 * 60 * 60 * 1000);

  const serversDueSoon = await db.select().from(serverBilling)
    .where(
      and(
        or(
          eq(serverBilling.status, 'active'),
          eq(serverBilling.status, 'paid')
        ),
        eq(serverBilling.autoRenew, true),
        eq(serverBilling.freeServer, false),
        gte(serverBilling.nextBillAt, now),
        lt(serverBilling.nextBillAt, tomorrow),
        // Skip if we already sent a reminder in the last 20 hours
        or(
          isNull(serverBilling.lastReminderSentAt),
          lt(serverBilling.lastReminderSentAt, twentyHoursAgo)
        )
      )
    );

  log(`Found ${serversDueSoon.length} servers due in the next 24 hours for reminders`, 'billing');

  for (const billing of serversDueSoon) {
    try {
      const email = await getUserEmail(billing.auth0UserId);
      if (!email) continue;

      // Get wallet balance
      const walletRows = await db.select().from(wallets)
        .where(eq(wallets.auth0UserId, billing.auth0UserId))
        .limit(1);
      const walletBalance = walletRows.length > 0 ? walletRows[0].balanceCents : 0;

      const serverName = await getServerName(billing.virtfusionServerId);
      await sendBillingReminderEmail(
        email,
        serverName,
        formatCurrency(billing.monthlyPriceCents),
        formatDate(billing.nextBillAt),
        formatCurrency(walletBalance)
      );

      // Mark reminder sent so we don't spam on the next billing job run
      await db.update(serverBilling)
        .set({ lastReminderSentAt: new Date(), updatedAt: new Date() })
        .where(eq(serverBilling.id, billing.id));

      log(`Sent billing reminder for server ${billing.virtfusionServerId}`, 'billing');
    } catch (error: any) {
      log(`Failed to send billing reminder for server ${billing.virtfusionServerId}: ${error.message}`, 'billing');
    }
  }

  const overdueWarningServers = await db.select().from(serverBilling)
    .where(
      and(
        eq(serverBilling.status, 'unpaid'),
        eq(serverBilling.autoRenew, true),
        eq(serverBilling.freeServer, false),
        not(isNull(serverBilling.suspendAt)),
        gt(serverBilling.suspendAt, now),
        lte(serverBilling.nextBillAt, twoDaysAgo),
        gt(serverBilling.nextBillAt, threeDaysAgo),
        or(
          isNull(serverBilling.lastReminderSentAt),
          lt(serverBilling.lastReminderSentAt, serverBilling.nextBillAt)
        )
      )
    );

  log(`Found ${overdueWarningServers.length} unpaid servers ready for 2-day suspension warnings`, 'billing');

  for (const billing of overdueWarningServers) {
    try {
      if (!billing.suspendAt) {
        continue;
      }

      const email = await getUserEmail(billing.auth0UserId);
      if (!email) continue;

      const serverName = await getServerName(billing.virtfusionServerId);
      const daysUntilSuspension = Math.max(
        1,
        Math.ceil((billing.suspendAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      );

      await sendPaymentFailedEmail(
        email,
        serverName,
        formatCurrency(billing.monthlyPriceCents),
        formatDate(billing.suspendAt),
        daysUntilSuspension
      );

      await db.update(serverBilling)
        .set({ lastReminderSentAt: new Date(), updatedAt: new Date() })
        .where(eq(serverBilling.id, billing.id));

      log(`Sent 2-day overdue suspension warning for server ${billing.virtfusionServerId}`, 'billing');
    } catch (error: any) {
      log(`Failed to send 2-day overdue suspension warning for server ${billing.virtfusionServerId}: ${error.message}`, 'billing');
    }
  }
}

// Reactivation - retry billing for unpaid/suspended servers after top-up
export async function retryUnpaidServers(auth0UserId: string): Promise<void> {
  const now = new Date();
  const unpaidServers = await db.select().from(serverBilling)
    .where(
      and(
        eq(serverBilling.auth0UserId, auth0UserId),
        eq(serverBilling.freeServer, false), // Skip complimentary servers
        or(
          eq(serverBilling.status, 'unpaid'),
          eq(serverBilling.status, 'suspended'),
          // Also catch active/paid servers whose nextBillAt has passed (billing job hasn't run yet)
          and(
            or(eq(serverBilling.status, 'active'), eq(serverBilling.status, 'paid')),
            lte(serverBilling.nextBillAt, now)
          )
        )
      )
    );

  log(`Found ${unpaidServers.length} unpaid/suspended/overdue servers for user ${auth0UserId}`, 'billing');

  for (const billing of unpaidServers) {
    try {
      // For suspended/unpaid servers, use reactivation mode (next bill = 1 month from now)
      const chargeResult = await chargeServer(billing, true);

      if (chargeResult.success) {
        // Always advance nextBillAt to 1 month from now on reactivation, even if
        // another process already settled the billing period.
        const newNextBillAt = addMonth(new Date());
        newNextBillAt.setUTCHours(0, 0, 0, 0); // Normalize to midnight UTC
        await db.update(serverBilling)
          .set({ status: 'paid', nextBillAt: newNextBillAt, suspendAt: null, updatedAt: new Date() })
          .where(eq(serverBilling.id, billing.id));
        log(`Server ${billing.virtfusionServerId} billing reset: status=paid, nextBillAt=${newNextBillAt.toISOString()}`, 'billing');

        if (billing.status === 'suspended') {
          // Unsuspend the server in VirtFusion with retry logic
          let unsuspendSuccess = false;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              await virtfusionClient.unsuspendServer(billing.virtfusionServerId);
              log(`Reactivated server ${billing.virtfusionServerId} (attempt ${attempt})`, 'billing');
              unsuspendSuccess = true;
              break;
            } catch (unsuspendError: any) {
              log(`Unsuspend attempt ${attempt}/3 failed for server ${billing.virtfusionServerId}: ${unsuspendError.message}`, 'billing');
              if (attempt < 3) {
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            }
          }

          if (!unsuspendSuccess) {
            if (chargeResult.chargedFresh && chargeResult.idempotencyKey && chargeResult.serverName) {
              log(`All unsuspend attempts failed for server ${billing.virtfusionServerId}. Refunding charge and reverting status.`, 'billing');
              await refundFailedUnsuspendCharge(billing, chargeResult.idempotencyKey, chargeResult.serverName);
              log(`Refunded ${billing.monthlyPriceCents} cents for server ${billing.virtfusionServerId} due to unsuspend failure`, 'billing');
            } else {
              log(`All unsuspend attempts failed for server ${billing.virtfusionServerId}, but no fresh charge was created so no refund was issued`, 'billing');
            }
          }
        }
      }
    } catch (error: any) {
      log(`Error reactivating server ${billing.virtfusionServerId}: ${error.message}`, 'billing');
    }
  }
}

export async function retryServerBilling(auth0UserId: string, virtfusionServerId: string): Promise<void> {
  const [billing] = await db.select().from(serverBilling)
    .where(
      and(
        eq(serverBilling.auth0UserId, auth0UserId),
        eq(serverBilling.virtfusionServerId, virtfusionServerId),
        eq(serverBilling.freeServer, false)
      )
    )
    .limit(1);

  if (!billing) {
    return;
  }

  const now = new Date();
  const needsRetry =
    billing.status === 'unpaid' ||
    billing.status === 'suspended' ||
    (
      (billing.status === 'active' || billing.status === 'paid') &&
      billing.nextBillAt <= now
    );

  if (!needsRetry) {
    return;
  }

  try {
    const chargeResult = await chargeServer(billing, true);

    if (chargeResult.success) {
      const newNextBillAt = addMonth(new Date());
      newNextBillAt.setUTCHours(0, 0, 0, 0);
      await db.update(serverBilling)
        .set({ status: 'paid', nextBillAt: newNextBillAt, suspendAt: null, updatedAt: new Date() })
        .where(eq(serverBilling.id, billing.id));
      log(`Server ${billing.virtfusionServerId} billing reset: status=paid, nextBillAt=${newNextBillAt.toISOString()}`, 'billing');

      if (billing.status === 'suspended') {
        let unsuspendSuccess = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await virtfusionClient.unsuspendServer(billing.virtfusionServerId);
            log(`Reactivated server ${billing.virtfusionServerId} (attempt ${attempt})`, 'billing');
            unsuspendSuccess = true;
            break;
          } catch (unsuspendError: any) {
            log(`Unsuspend attempt ${attempt}/3 failed for server ${billing.virtfusionServerId}: ${unsuspendError.message}`, 'billing');
            if (attempt < 3) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        }

        if (!unsuspendSuccess) {
          if (chargeResult.chargedFresh && chargeResult.idempotencyKey && chargeResult.serverName) {
            log(`All unsuspend attempts failed for server ${billing.virtfusionServerId}. Refunding charge and reverting status.`, 'billing');
            await refundFailedUnsuspendCharge(billing, chargeResult.idempotencyKey, chargeResult.serverName);
            log(`Refunded ${billing.monthlyPriceCents} cents for server ${billing.virtfusionServerId} due to unsuspend failure`, 'billing');
          } else {
            log(`All unsuspend attempts failed for server ${billing.virtfusionServerId}, but no fresh charge was created so no refund was issued`, 'billing');
          }
        }
      }
    }
  } catch (error: any) {
    log(`Error reactivating server ${billing.virtfusionServerId}: ${error.message}`, 'billing');
  }
}

// Get billing status for a server
// Optionally pass auth0UserId and serverUuid for robust fallback lookup
export async function getServerBillingStatus(
  virtfusionServerId: string | number,
  auth0UserId?: string,
  serverUuid?: string
) {
  // Ensure consistent string type for database query
  const serverId = String(virtfusionServerId);
  const numericId = parseInt(serverId, 10);

  // Try exact match by server ID first (fastest)
  let billing = await db.select().from(serverBilling)
    .where(eq(serverBilling.virtfusionServerId, serverId))
    .limit(1);

  // If not found and the ID is numeric, try without leading zeros
  if (billing.length === 0 && !isNaN(numericId)) {
    const trimmedId = String(numericId);
    if (trimmedId !== serverId) {
      billing = await db.select().from(serverBilling)
        .where(eq(serverBilling.virtfusionServerId, trimmedId))
        .limit(1);
    }
  }

  // If not found but we have UUID, try lookup by UUID (most reliable)
  if (billing.length === 0 && serverUuid) {
    billing = await db.select().from(serverBilling)
      .where(eq(serverBilling.virtfusionServerUuid, serverUuid))
      .limit(1);

    if (billing.length > 0) {
      // Found via UUID - update the server ID to current value (self-healing)
      const record = billing[0];
      if (record.virtfusionServerId !== serverId) {
        await db.update(serverBilling)
          .set({ virtfusionServerId: serverId, updatedAt: new Date() })
          .where(eq(serverBilling.id, record.id));
        log(`Self-healed billing record via UUID: server ID ${record.virtfusionServerId} -> ${serverId}`, 'billing');
        return { ...record, virtfusionServerId: serverId };
      }
      return record;
    }
  }

  // Legacy fallback: search user's billing records for numeric ID match
  if (billing.length === 0 && auth0UserId) {
    const userBillings = await db.select().from(serverBilling)
      .where(eq(serverBilling.auth0UserId, auth0UserId));

    for (const b of userBillings) {
      const storedNumericId = parseInt(b.virtfusionServerId, 10);
      if (!isNaN(storedNumericId) && storedNumericId === numericId) {
        // Found a match - update the record with correct ID and UUID if available
        const updates: any = { virtfusionServerId: serverId, updatedAt: new Date() };
        if (serverUuid && !b.virtfusionServerUuid) {
          updates.virtfusionServerUuid = serverUuid;
        }
        await db.update(serverBilling)
          .set(updates)
          .where(eq(serverBilling.id, b.id));
        log(`Fixed billing record ID mismatch: ${b.virtfusionServerId} -> ${serverId}${serverUuid ? ` (added UUID: ${serverUuid})` : ''}`, 'billing');
        return { ...b, virtfusionServerId: serverId, virtfusionServerUuid: serverUuid || b.virtfusionServerUuid };
      }
    }
  }

  // If found but missing UUID, update with UUID for future reliability
  if (billing.length > 0 && serverUuid && !billing[0].virtfusionServerUuid) {
    await db.update(serverBilling)
      .set({ virtfusionServerUuid: serverUuid, updatedAt: new Date() })
      .where(eq(serverBilling.id, billing[0].id));
    log(`Added UUID to existing billing record for server ${serverId}: ${serverUuid}`, 'billing');
    return { ...billing[0], virtfusionServerUuid: serverUuid };
  }

  return billing.length > 0 ? billing[0] : null;
}

// Get upcoming charges for a user
export async function getUpcomingCharges(auth0UserId: string) {
  const upcoming = await db.select().from(serverBilling)
    .where(
      and(
        eq(serverBilling.auth0UserId, auth0UserId),
        // Show active, paid, unpaid, and suspended servers (so users can reactivate)
        or(
          eq(serverBilling.status, 'active'),
          eq(serverBilling.status, 'paid'),
          eq(serverBilling.status, 'unpaid'),
          eq(serverBilling.status, 'suspended')
        )
      )
    )
    .orderBy(serverBilling.nextBillAt);

  return upcoming;
}

// Get billing ledger for a user
export async function getBillingLedger(auth0UserId: string) {
  const ledger = await db.select().from(billingLedger)
    .where(eq(billingLedger.auth0UserId, auth0UserId))
    .orderBy(billingLedger.createdAt);

  return ledger;
}
