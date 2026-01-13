import Stripe from "stripe";
import { db } from "./db";
import { wallets, walletTransactions, serverBilling, serverCancellations, plans } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { runBillingJob, retryUnpaidServers } from "./billing";
import { dbStorage } from "./storage";

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

      // SECURITY: Generate a unique idempotency key based on wallet and current day
      // This prevents duplicate charges if the billing job runs multiple times
      // The key resets daily to allow a new auto-topup the next day if needed
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const idempotencyKey = `auto_topup_${wallet.auth0UserId}_${today}`;

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
      }, {
        idempotencyKey, // Stripe will return the same response for duplicate requests
      });

      if (paymentIntent.status === 'succeeded') {
        // SECURITY: Use creditWallet with idempotency check on stripePaymentIntentId
        // This prevents double-crediting if the job runs twice after a successful charge
        await dbStorage.creditWallet(wallet.auth0UserId, wallet.autoTopupAmountCents, {
          type: 'auto_topup',
          stripePaymentIntentId: paymentIntent.id,
          metadata: { source: 'auto_topup' },
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
