import { db } from './db';
import { serverBilling, billingLedger, wallets, walletTransactions, userFlags } from '../shared/schema';
import { eq, and, lte, isNull, or, not, gte, lt, sql } from 'drizzle-orm';
import { log } from './log';
import { virtfusionClient } from './virtfusion';
import { auth0Client } from './auth0';
import { sendPaymentFailedEmail, sendServerSuspendedEmail, sendBillingReminderEmail, sendAutoTopupSuccessEmail, sendAutoTopupFailedEmail, sendBillingReceiptEmail } from './email';
import { getUncachableStripeClient } from './stripeClient';

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
async function chargeServer(billing: typeof serverBilling.$inferSelect, reactivation: boolean = false): Promise<boolean> {
  // Skip complimentary servers - they don't get charged
  if (billing.freeServer) {
    log(`Skipping charge for complimentary server ${billing.virtfusionServerId}`, 'billing');
    return true; // Return true so it doesn't get marked as failed
  }

  // Get server name for transaction description
  const serverName = await getServerName(billing.virtfusionServerId);

  const idempotencyKey = `bill:${billing.virtfusionServerId}:${billing.nextBillAt.toISOString()}`;

  return await db.transaction(async (tx) => {
    // Lock wallet row FIRST to prevent concurrent charges
    const walletRows = await tx.select().from(wallets)
      .where(eq(wallets.auth0UserId, billing.auth0UserId))
      .for('update')
      .limit(1);

    if (walletRows.length === 0) {
      log(`No wallet found for user ${billing.auth0UserId}`, 'billing');
      return false;
    }

    // Check idempotency AFTER acquiring wallet lock to prevent duplicate charges
    const existing = await tx.select().from(billingLedger)
      .where(eq(billingLedger.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing.length > 0) {
      log(`Server ${billing.virtfusionServerId} already charged for ${billing.nextBillAt.toISOString()}`, 'billing');
      return true; // Already charged
    }

    const wallet = walletRows[0];

    if (wallet.balanceCents < billing.monthlyPriceCents) {
      log(`Insufficient balance for server ${billing.virtfusionServerId}: need ${billing.monthlyPriceCents}, have ${wallet.balanceCents}`, 'billing');
      return false; // Insufficient balance
    }

    // Deduct from wallet
    await tx.update(wallets)
      .set({
        balanceCents: wallet.balanceCents - billing.monthlyPriceCents,
        updatedAt: new Date(),
      })
      .where(eq(wallets.auth0UserId, billing.auth0UserId));

    // Record in ledger (for idempotency)
    await tx.insert(billingLedger).values({
      auth0UserId: billing.auth0UserId,
      virtfusionServerId: billing.virtfusionServerId,
      amountCents: billing.monthlyPriceCents,
      description: `Server renewal - ${serverName}`,
      idempotencyKey,
    });

    // Record in wallet transactions (for user visibility)
    // Only call it "reactivation" if the server was actually suspended — unpaid-but-running
    // servers that get auto-charged after a top-up should just show as "Monthly billing"
    const transactionDescription = (reactivation && billing.status === 'suspended')
      ? 'Server reactivation'
      : 'Monthly billing';

    await tx.insert(walletTransactions).values({
      auth0UserId: billing.auth0UserId,
      type: 'debit',
      amountCents: -billing.monthlyPriceCents, // Negative for debits
      metadata: {
        serverId: billing.virtfusionServerId,
        serverName,
        description: transactionDescription,
        ...(reactivation && {
          reactivation: true,
          previousStatus: billing.status,
          previousDueDate: billing.nextBillAt.toISOString(),
        }),
      },
    });

    // Update billing record
    // For reactivation (unsuspending), set next bill to 1 month from now
    // For regular billing, set next bill to 1 month from the previous due date
    const newNextBillAt = reactivation ? addMonth(new Date()) : addMonth(billing.nextBillAt);
    newNextBillAt.setUTCHours(0, 0, 0, 0); // Normalize to midnight UTC
    await tx.update(serverBilling)
      .set({
        status: 'paid',
        nextBillAt: newNextBillAt,
        suspendAt: null,
        updatedAt: new Date(),
      })
      .where(eq(serverBilling.id, billing.id));

    log(`Charged server ${billing.virtfusionServerId}: $${billing.monthlyPriceCents / 100}`, 'billing');

    // Send billing receipt email (non-blocking)
    getUserEmail(billing.auth0UserId).then(email => {
      if (email) {
        const amountDollars = `$${(billing.monthlyPriceCents / 100).toFixed(2)}`;
        sendBillingReceiptEmail(email, serverName, amountDollars, newNextBillAt.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })).catch(err => {
          log(`Failed to send billing receipt email to ${email}: ${err.message}`, 'billing');
        });
      }
    }).catch(() => {});

    return true;
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

    // Daily idempotency key — matches billing-processor.ts so both systems deduplicate
    // against the same Stripe key and can't double-charge on the same day
    const today = new Date().toISOString().split('T')[0];
    const idempotencyKey = `auto_topup_${auth0UserId}_${today}`;

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

// Main billing job - runs every 10 minutes
export async function runBillingJob(): Promise<void> {
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

  log(`Found ${dueServers.length} servers due for billing`, 'billing');

  for (const billing of dueServers) {
    try {
      // Skip billing for users with suspended accounts
      if (await isUserAccountSuspended(billing.auth0UserId)) {
        log(`Skipping billing for server ${billing.virtfusionServerId} - user account is suspended`, 'billing');
        continue;
      }

      let charged = await chargeServer(billing);

      // If charge failed due to insufficient balance, try auto top-up then retry once
      if (!charged) {
        const autoTopupOk = await attemptAutoTopup(billing.auth0UserId, billing.monthlyPriceCents);
        if (autoTopupOk) {
          charged = await chargeServer(billing);
          if (charged) {
            log(`Auto top-up enabled charge of server ${billing.virtfusionServerId}`, 'billing');
            continue;
          }
        }
      }

      if (!charged) {
        // Payment failed (and auto top-up couldn't cover it) - mark as unpaid and set suspension date
        if (billing.status !== 'unpaid') {
          const suspendAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

          await db.update(serverBilling)
            .set({
              status: 'unpaid',
              suspendAt,
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
      if (chargeAttempt) {
        // Charge succeeded (new charge or idempotency — either way, money was collected).
        // Never suspend when a charge returns true.
        log(`Server ${billing.virtfusionServerId} charge succeeded, skipping suspension`, 'billing');
        // If server was suspended in VirtFusion, unsuspend it now that payment is confirmed
        if (billing.status === 'suspended') {
          try {
            await virtfusionClient.unsuspendServer(billing.virtfusionServerId);
            log(`Unsuspended server ${billing.virtfusionServerId} after successful charge`, 'billing');
          } catch (unsuspendErr: any) {
            log(`Could not unsuspend server ${billing.virtfusionServerId} after charge: ${unsuspendErr.message}`, 'billing');
          }
          // Ensure billing status reflects payment regardless of whether chargeServer
          // updated it (idempotency path skips the DB update inside chargeServer)
          await db.update(serverBilling)
            .set({ status: 'paid', suspendAt: null, updatedAt: new Date() })
            .where(eq(serverBilling.id, billing.id));
        }
        continue;
      } else {
        log(`Server ${billing.virtfusionServerId} charge failed (insufficient balance), proceeding to suspend`, 'billing');
      }

      // Mark as unpaid before suspending (covers active/paid/unpaid statuses)
      if (billing.status !== 'unpaid' && billing.status !== 'suspended') {
        await db.update(serverBilling)
          .set({ status: 'unpaid', updatedAt: new Date() })
          .where(eq(serverBilling.id, billing.id));
        log(`Server ${billing.virtfusionServerId} marked as unpaid`, 'billing');
      }

      log(`Calling VirtFusion suspendServer for ${billing.virtfusionServerId}`, 'billing');
      await virtfusionClient.suspendServer(billing.virtfusionServerId);
      log(`VirtFusion suspend completed for ${billing.virtfusionServerId}`, 'billing');

      await db.update(serverBilling)
        .set({
          status: 'suspended',
          updatedAt: new Date(),
        })
        .where(eq(serverBilling.id, billing.id));

      log(`Suspended server ${billing.virtfusionServerId} - database updated to status=suspended`, 'billing');

      // Send server suspended email
      try {
        const email = await getUserEmail(billing.auth0UserId);
        if (email) {
          const serverName = await getServerName(billing.virtfusionServerId);
          await sendServerSuspendedEmail(
            email,
            serverName,
            formatCurrency(billing.monthlyPriceCents)
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

  // Step D: Send reminders for servers due tomorrow
  await sendBillingReminders();

  log('Billing job completed', 'billing');
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

// Send billing reminders for servers due in the next 24 hours
export async function sendBillingReminders(): Promise<void> {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
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
      const charged = await chargeServer(billing, true);

      if (charged) {
        // Always advance nextBillAt to 1 month from now on reactivation.
        // chargeServer(billing, true) does this on a real charge, but the idempotency
        // path returns true early without updating the DB. Force-update here so the
        // billing date is always reset and the billing job doesn't keep finding this
        // server on every run.
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
            // All retries failed — refund the charge and revert billing status
            log(`All unsuspend attempts failed for server ${billing.virtfusionServerId}. Refunding charge and reverting status.`, 'billing');

            const serverName = await getServerName(billing.virtfusionServerId);
            const idempotencyKey = `bill:${billing.virtfusionServerId}:${billing.nextBillAt.toISOString()}`;

            // Wrap all revert operations in a transaction so a partial failure
            // cannot leave the ledger entry without the refund, or vice versa
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
                  reason: 'Server unsuspend failed after 3 attempts - auto refund',
                },
              });

              // Remove the ledger entry so future retries can charge again with a fresh key
              await tx.delete(billingLedger).where(eq(billingLedger.idempotencyKey, idempotencyKey));

              // Revert to suspended — nextBillAt stays at newNextBillAt so the next
              // retry uses a fresh idempotency key and charges correctly
              await tx.update(serverBilling)
                .set({ status: 'suspended', updatedAt: new Date() })
                .where(eq(serverBilling.id, billing.id));
            });

            log(`Refunded ${billing.monthlyPriceCents} cents for server ${billing.virtfusionServerId} due to unsuspend failure`, 'billing');
          }
        }
      }
    } catch (error: any) {
      log(`Error reactivating server ${billing.virtfusionServerId}: ${error.message}`, 'billing');
    }
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
