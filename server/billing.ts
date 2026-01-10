import { db } from './db';
import { serverBilling, billingLedger, wallets, type InsertServerBilling, type InsertBillingLedger } from '../shared/schema';
import { eq, and, lte, isNull, or } from 'drizzle-orm';
import { log } from './index';
import { virtfusionClient } from './virtfusion';

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
  planId: number;
  monthlyPriceCents: number;
}): Promise<void> {
  const now = new Date();
  const nextBillAt = addMonth(now);

  const billingRecord: InsertServerBilling = {
    auth0UserId: params.auth0UserId,
    virtfusionServerId: params.virtfusionServerId,
    planId: params.planId,
    deployedAt: now,
    monthlyPriceCents: params.monthlyPriceCents,
    status: 'active',
    autoRenew: true,
    nextBillAt,
    suspendAt: null,
  };

  await db.insert(serverBilling).values(billingRecord);
  log(`Created billing record for server ${params.virtfusionServerId}`, 'billing');
}

// Charge a server's monthly fee
async function chargeServer(billing: typeof serverBilling.$inferSelect): Promise<boolean> {
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

    // Record in ledger
    const ledgerEntry: InsertBillingLedger = {
      auth0UserId: billing.auth0UserId,
      virtfusionServerId: billing.virtfusionServerId,
      amountCents: billing.monthlyPriceCents,
      description: `Monthly server billing for ${billing.virtfusionServerId}`,
      idempotencyKey,
    };

    await tx.insert(billingLedger).values(ledgerEntry);

    // Update billing record
    const newNextBillAt = addMonth(billing.nextBillAt);
    await tx.update(serverBilling)
      .set({
        status: 'paid',
        nextBillAt: newNextBillAt,
        suspendAt: null,
        lastBilledAt: new Date(),
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
  const dueServers = await db.select().from(serverBilling)
    .where(
      and(
        or(eq(serverBilling.status, 'paid'), eq(serverBilling.status, 'unpaid')),
        eq(serverBilling.autoRenew, true),
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
        }
      }
    } catch (error: any) {
      log(`Error charging server ${billing.virtfusionServerId}: ${error.message}`, 'billing');
    }
  }

  // Step B: Suspend overdue servers
  const overdueServers = await db.select().from(serverBilling)
    .where(
      and(
        eq(serverBilling.status, 'unpaid'),
        lte(serverBilling.suspendAt, now),
        isNull(serverBilling.suspendAt).not()
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
    } catch (error: any) {
      log(`Error suspending server ${billing.virtfusionServerId}: ${error.message}`, 'billing');
    }
  }

  log('Billing job completed', 'billing');
}

// Reactivation - retry billing for unpaid/suspended servers after top-up
export async function retryUnpaidServers(auth0UserId: string): Promise<void> {
  const unpaidServers = await db.select().from(serverBilling)
    .where(
      and(
        eq(serverBilling.auth0UserId, auth0UserId),
        or(eq(serverBilling.status, 'unpaid'), eq(serverBilling.status, 'suspended'))
      )
    );

  log(`Found ${unpaidServers.length} unpaid/suspended servers for user ${auth0UserId}`, 'billing');

  for (const billing of unpaidServers) {
    try {
      const charged = await chargeServer(billing);

      if (charged && billing.status === 'suspended') {
        // Unsuspend the server
        await virtfusionClient.unsuspendServer(billing.virtfusionServerId);

        await db.update(serverBilling)
          .set({
            status: 'paid',
            suspendAt: null,
            updatedAt: new Date(),
          })
          .where(eq(serverBilling.id, billing.id));

        log(`Reactivated server ${billing.virtfusionServerId}`, 'billing');
      }
    } catch (error: any) {
      log(`Error reactivating server ${billing.virtfusionServerId}: ${error.message}`, 'billing');
    }
  }
}

// Get billing status for a server
export async function getServerBillingStatus(virtfusionServerId: string) {
  const billing = await db.select().from(serverBilling)
    .where(eq(serverBilling.virtfusionServerId, virtfusionServerId))
    .limit(1);

  return billing.length > 0 ? billing[0] : null;
}

// Get upcoming charges for a user
export async function getUpcomingCharges(auth0UserId: string) {
  const upcoming = await db.select().from(serverBilling)
    .where(
      and(
        eq(serverBilling.auth0UserId, auth0UserId),
        // Show active, paid, and unpaid servers (exclude only suspended)
        or(
          eq(serverBilling.status, 'active'),
          eq(serverBilling.status, 'paid'),
          eq(serverBilling.status, 'unpaid')
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
