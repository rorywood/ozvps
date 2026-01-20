import { db } from './db';
import { serverBilling, billingLedger, wallets, walletTransactions } from '../shared/schema';
import { eq, and, lte, isNull, or, not, gte, lt } from 'drizzle-orm';
import { log } from './log';
import { virtfusionClient } from './virtfusion';
import { auth0Client } from './auth0';
import { sendPaymentFailedEmail, sendServerSuspendedEmail, sendBillingReminderEmail } from './email';

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
    // Check if already charged
    const existing = await tx.select().from(billingLedger)
      .where(eq(billingLedger.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing.length > 0) {
      log(`Server ${billing.virtfusionServerId} already charged for ${billing.nextBillAt.toISOString()}`, 'billing');
      return true; // Already charged
    }

    // Lock wallet row and check balance
    const walletRows = await tx.select().from(wallets)
      .where(eq(wallets.auth0UserId, billing.auth0UserId))
      .for('update')
      .limit(1);

    if (walletRows.length === 0) {
      log(`No wallet found for user ${billing.auth0UserId}`, 'billing');
      return false;
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
    const transactionDescription = reactivation
      ? 'Server reactivation'
      : 'Server renewal';

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
    await tx.update(serverBilling)
      .set({
        status: 'paid',
        nextBillAt: newNextBillAt,
        suspendAt: null,
        updatedAt: new Date(),
      })
      .where(eq(serverBilling.id, billing.id));

    log(`Charged server ${billing.virtfusionServerId}: $${billing.monthlyPriceCents / 100}`, 'billing');
    return true;
  });
}

// Main billing job - runs every 10 minutes
export async function runBillingJob(): Promise<void> {
  const now = new Date();

  log('Starting billing job...', 'billing');

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
        lte(serverBilling.nextBillAt, now)
      )
    );

  log(`Found ${dueServers.length} servers due for billing`, 'billing');

  for (const billing of dueServers) {
    try {
      const charged = await chargeServer(billing);

      if (!charged) {
        // Payment failed - mark as unpaid and set suspension date
        if (billing.status !== 'unpaid') {
          const suspendAt = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 days

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
                5 // days until suspension
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
  const overdueServers = await db.select().from(serverBilling)
    .where(
      and(
        eq(serverBilling.status, 'unpaid'),
        eq(serverBilling.freeServer, false), // Skip complimentary servers
        not(isNull(serverBilling.suspendAt)),
        lte(serverBilling.suspendAt, now)
      )
    );

  log(`Found ${overdueServers.length} servers ready for suspension`, 'billing');

  for (const billing of overdueServers) {
    try {
      await virtfusionClient.suspendServer(billing.virtfusionServerId);

      await db.update(serverBilling)
        .set({
          status: 'suspended',
          updatedAt: new Date(),
        })
        .where(eq(serverBilling.id, billing.id));

      log(`Suspended server ${billing.virtfusionServerId}`, 'billing');

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

  // Find servers due in the next 24 hours that haven't been reminded yet today
  // We use a simple approach: only remind for servers that are 'active' or 'paid' status
  // Skip complimentary servers - they don't need payment reminders
  const serversDueSoon = await db.select().from(serverBilling)
    .where(
      and(
        or(
          eq(serverBilling.status, 'active'),
          eq(serverBilling.status, 'paid')
        ),
        eq(serverBilling.autoRenew, true),
        eq(serverBilling.freeServer, false), // Skip complimentary servers
        gte(serverBilling.nextBillAt, now),
        lt(serverBilling.nextBillAt, tomorrow)
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

      log(`Sent billing reminder for server ${billing.virtfusionServerId}`, 'billing');
    } catch (error: any) {
      log(`Failed to send billing reminder for server ${billing.virtfusionServerId}: ${error.message}`, 'billing');
    }
  }
}

// Reactivation - retry billing for unpaid/suspended servers after top-up
export async function retryUnpaidServers(auth0UserId: string): Promise<void> {
  const unpaidServers = await db.select().from(serverBilling)
    .where(
      and(
        eq(serverBilling.auth0UserId, auth0UserId),
        eq(serverBilling.freeServer, false), // Skip complimentary servers
        or(eq(serverBilling.status, 'unpaid'), eq(serverBilling.status, 'suspended'))
      )
    );

  log(`Found ${unpaidServers.length} unpaid/suspended servers for user ${auth0UserId}`, 'billing');

  for (const billing of unpaidServers) {
    try {
      // For suspended/unpaid servers, use reactivation mode (next bill = 1 month from now)
      const charged = await chargeServer(billing, true);

      if (charged && billing.status === 'suspended') {
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
              // Wait 2 seconds before retry
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        }

        if (!unsuspendSuccess) {
          // All retries failed - revert billing status so it can be retried later
          // Note: chargeServer already set status to 'paid', so we need to revert it
          log(`All unsuspend attempts failed for server ${billing.virtfusionServerId}. Reverting billing status for retry.`, 'billing');

          await db.update(serverBilling)
            .set({
              status: 'suspended',
              updatedAt: new Date(),
            })
            .where(eq(serverBilling.id, billing.id));

          // Note: The charge has already been processed, but the server stays suspended.
          // This allows the billing job to retry unsuspend on the next run.
          // If unsuspend keeps failing, manual intervention will be needed.
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
