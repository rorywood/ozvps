import Stripe from "stripe";
import { db } from "./db";
import { wallets, walletTransactions, serverBilling, serverCancellations, plans } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { runBillingJob, retryUnpaidServers } from "./billing";

const log = (message: string, context = "billing") => {
  console.log(`${new Date().toLocaleTimeString()} [${context}] ${message}`);
};

const BILLING_CHECK_INTERVAL = 10 * 60 * 1000; // 10 minutes (for monthly billing system)
const OVERDUE_GRACE_PERIOD_DAYS = 7;

export async function startBillingProcessor(stripe: Stripe | null) {
  log("Starting monthly billing processor (checking every 10 minutes)");

  const runBillingCycle = async () => {
    try {
      // Run new monthly billing system
      await runBillingJob();
      await processAutoTopups(stripe);
    } catch (err: any) {
      log(`Error in billing cycle: ${err.message}`, "billing-error");
    }
  };

  // Start after 5 minutes, then run every 10 minutes
  setTimeout(runBillingCycle, 5 * 60 * 1000);
  setInterval(runBillingCycle, BILLING_CHECK_INTERVAL);
}

// Old daily billing function removed - now using monthly billing system via runBillingJob()

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

        // Try to reactivate any unpaid/suspended servers after successful top-up
        await retryUnpaidServers(wallet.auth0UserId);
      }
    } catch (err: any) {
      log(`Auto top-up failed for ${wallet.auth0UserId}: ${err.message}`, "billing-error");
    }
  }
}

// Old overdue server processing removed - now using monthly billing system with suspend/unsuspend
