import Stripe from "stripe";
import { db } from "./db";
import { wallets, walletTransactions, serverBilling, serverCancellations, plans } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

const log = (message: string, context = "billing") => {
  console.log(`${new Date().toLocaleTimeString()} [${context}] ${message}`);
};

const BILLING_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour
const OVERDUE_GRACE_PERIOD_DAYS = 7;

export async function startBillingProcessor(stripe: Stripe | null) {
  log("Starting billing processor (checking every hour)");
  
  const runBillingCycle = async () => {
    try {
      await processDueBilling();
      await processAutoTopups(stripe);
      await processOverdueServers();
    } catch (err: any) {
      log(`Error in billing cycle: ${err.message}`, "billing-error");
    }
  };

  setTimeout(runBillingCycle, 5 * 60 * 1000);
  setInterval(runBillingCycle, BILLING_CHECK_INTERVAL);
}

async function processDueBilling() {
  const serversDue = await db
    .select()
    .from(serverBilling)
    .where(
      and(
        eq(serverBilling.status, 'active'),
        sql`${serverBilling.nextBillingAt} <= NOW()`
      )
    );
  
  for (const server of serversDue) {
    try {
      const [plan] = await db.select().from(plans).where(eq(plans.id, server.planId));
      if (!plan) {
        log(`No plan found for server ${server.virtfusionServerId}`, "billing-error");
        continue;
      }

      const dailyRate = Math.ceil(plan.priceMonthly / 30);
      const [wallet] = await db.select().from(wallets).where(eq(wallets.auth0UserId, server.auth0UserId));
      
      if (!wallet) {
        log(`No wallet found for user ${server.auth0UserId}`, "billing-error");
        continue;
      }
      
      // Skip frozen wallets (Stripe customer deleted)
      if (wallet.deletedAt) {
        log(`Skipping billing for server ${server.virtfusionServerId} - wallet is frozen`, "billing");
        continue;
      }

      if (wallet.balanceCents >= dailyRate) {
        const [updated] = await db
          .update(wallets)
          .set({
            balanceCents: sql`${wallets.balanceCents} - ${dailyRate}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(wallets.auth0UserId, server.auth0UserId),
              sql`${wallets.balanceCents} >= ${dailyRate}`
            )
          )
          .returning();

        if (updated) {
          await db.insert(walletTransactions).values({
            auth0UserId: server.auth0UserId,
            type: 'server_billing',
            amountCents: -dailyRate,
            metadata: { serverId: server.virtfusionServerId, planId: server.planId },
          });

          const nextBilling = new Date();
          nextBilling.setDate(nextBilling.getDate() + 1);
          await db
            .update(serverBilling)
            .set({ lastBilledAt: new Date(), nextBillingAt: nextBilling, status: 'active', overdueSince: null, updatedAt: new Date() })
            .where(eq(serverBilling.virtfusionServerId, server.virtfusionServerId));
          log(`Billed server ${server.virtfusionServerId}: $${(dailyRate / 100).toFixed(2)}`);
        }
      } else {
        if (server.status !== 'overdue') {
          await db
            .update(serverBilling)
            .set({ status: 'overdue', overdueSince: new Date(), updatedAt: new Date() })
            .where(eq(serverBilling.virtfusionServerId, server.virtfusionServerId));
          log(`Server ${server.virtfusionServerId} marked as overdue (insufficient funds)`);
        }
      }
    } catch (err: any) {
      log(`Error billing server ${server.virtfusionServerId}: ${err.message}`, "billing-error");
    }
  }
}

async function processAutoTopups(stripe: Stripe | null) {
  if (!stripe) return;

  const walletsNeedingTopup = await db
    .select()
    .from(wallets)
    .where(
      and(
        eq(wallets.autoTopupEnabled, true),
        sql`${wallets.balanceCents} <= ${wallets.autoTopupThresholdCents}`,
        sql`${wallets.autoTopupPaymentMethodId} IS NOT NULL`,
        sql`${wallets.deletedAt} IS NULL`
      )
    );
  
  for (const wallet of walletsNeedingTopup) {
    try {
      if (!wallet.stripeCustomerId || !wallet.autoTopupPaymentMethodId || !wallet.autoTopupAmountCents) {
        continue;
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: wallet.autoTopupAmountCents,
        currency: 'aud',
        customer: wallet.stripeCustomerId,
        payment_method: wallet.autoTopupPaymentMethodId,
        off_session: true,
        confirm: true,
        description: 'Auto top-up',
        metadata: {
          auto_topup: 'true',
          auth0_user_id: wallet.auth0UserId,
        },
      });

      if (paymentIntent.status === 'succeeded') {
        await db
          .update(wallets)
          .set({
            balanceCents: sql`${wallets.balanceCents} + ${wallet.autoTopupAmountCents}`,
            updatedAt: new Date(),
          })
          .where(eq(wallets.auth0UserId, wallet.auth0UserId));

        await db.insert(walletTransactions).values({
          auth0UserId: wallet.auth0UserId,
          type: 'auto_topup',
          amountCents: wallet.autoTopupAmountCents,
          stripePaymentIntentId: paymentIntent.id,
          metadata: { auto_topup: true },
        });
        log(`Auto top-up successful for ${wallet.auth0UserId}: $${(wallet.autoTopupAmountCents / 100).toFixed(2)}`);
      }
    } catch (err: any) {
      log(`Auto top-up failed for ${wallet.auth0UserId}: ${err.message}`, "billing-error");
    }
  }
}

async function processOverdueServers() {
  const overdueServers = await db
    .select()
    .from(serverBilling)
    .where(
      and(
        eq(serverBilling.status, 'overdue'),
        sql`${serverBilling.overdueSince} <= NOW() - INTERVAL '${OVERDUE_GRACE_PERIOD_DAYS} days'`
      )
    );
  
  for (const server of overdueServers) {
    try {
      const [wallet] = await db.select().from(wallets).where(eq(wallets.auth0UserId, server.auth0UserId));
      const [plan] = await db.select().from(plans).where(eq(plans.id, server.planId));
      
      if (!plan) continue;
      
      const dailyRate = Math.ceil(plan.priceMonthly / 30);
      
      if (wallet && wallet.balanceCents >= dailyRate) {
        const [updated] = await db
          .update(wallets)
          .set({
            balanceCents: sql`${wallets.balanceCents} - ${dailyRate}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(wallets.auth0UserId, server.auth0UserId),
              sql`${wallets.balanceCents} >= ${dailyRate}`
            )
          )
          .returning();

        if (updated) {
          await db.insert(walletTransactions).values({
            auth0UserId: server.auth0UserId,
            type: 'server_billing',
            amountCents: -dailyRate,
            metadata: { serverId: server.virtfusionServerId, planId: server.planId },
          });

          const nextBilling = new Date();
          nextBilling.setDate(nextBilling.getDate() + 1);
          await db
            .update(serverBilling)
            .set({ lastBilledAt: new Date(), nextBillingAt: nextBilling, status: 'active', overdueSince: null, updatedAt: new Date() })
            .where(eq(serverBilling.virtfusionServerId, server.virtfusionServerId));
          log(`Overdue server ${server.virtfusionServerId} payment recovered`);
          continue;
        }
      }

      const [existingCancellation] = await db
        .select()
        .from(serverCancellations)
        .where(
          and(
            eq(serverCancellations.virtfusionServerId, server.virtfusionServerId),
            sql`${serverCancellations.status} IN ('pending', 'processing')`
          )
        );
      
      if (existingCancellation) {
        log(`Server ${server.virtfusionServerId} already has pending cancellation`);
        continue;
      }

      log(`Server ${server.virtfusionServerId} overdue for ${OVERDUE_GRACE_PERIOD_DAYS}+ days - scheduling cancellation`);
      
      await db
        .update(serverBilling)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(serverBilling.virtfusionServerId, server.virtfusionServerId));
      
      const scheduledDeletionAt = new Date();
      scheduledDeletionAt.setMinutes(scheduledDeletionAt.getMinutes() + 5);
      
      await db.insert(serverCancellations).values({
        auth0UserId: server.auth0UserId,
        virtfusionServerId: server.virtfusionServerId,
        serverName: 'Server (overdue)',
        reason: 'Automatically cancelled due to non-payment',
        mode: 'immediate',
        status: 'pending',
        scheduledDeletionAt,
      });
      
      log(`Created cancellation request for overdue server ${server.virtfusionServerId}`);
    } catch (err: any) {
      log(`Error processing overdue server ${server.virtfusionServerId}: ${err.message}`, "billing-error");
    }
  }
}
