import Stripe from "stripe";
import { db } from "./db";
import { wallets, walletTransactions, serverBilling, serverCancellations, plans } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { runBillingJob, retryUnpaidServers } from "./billing";
import { dbStorage } from "./storage";

const log = (message: string, context = "billing") => {
  console.log(`${new Date().toLocaleTimeString()} [${context}] ${message}`);
};

// Billing runs daily at 6pm AEST (8am UTC / 18:00 AEST)
// AEST is UTC+10, so 6pm AEST = 8am UTC
const BILLING_HOUR_UTC = 8; // 8am UTC = 6pm AEST

// Calculate milliseconds until next 6pm AEST
function getMillisecondsUntilBillingTime(): number {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(BILLING_HOUR_UTC, 0, 0, 0);

  // If we've already passed 6pm AEST today, schedule for tomorrow
  if (now >= target) {
    target.setUTCDate(target.getUTCDate() + 1);
  }

  return target.getTime() - now.getTime();
}

export async function startBillingProcessor(stripe: Stripe | null) {
  const scheduleNextBillingRun = () => {
    const msUntilNextRun = getMillisecondsUntilBillingTime();
    const nextRunDate = new Date(Date.now() + msUntilNextRun);
    log(`Next billing run scheduled for ${nextRunDate.toISOString()} (6pm AEST)`);

    setTimeout(async () => {
      try {
        log("Starting daily billing run (6pm AEST)...");
        await runBillingJob();
        await processAutoTopups(stripe);
        log("Daily billing run completed");
      } catch (err: any) {
        log(`Error in billing cycle: ${err.message}`, "billing-error");
      }

      // Schedule the next run
      scheduleNextBillingRun();
    }, msUntilNextRun);
  };

  // Also run a quick check every 30 minutes for urgent tasks (auto top-ups, reactivations)
  // This ensures users who top up get their servers reactivated promptly
  const runQuickCheck = async () => {
    try {
      await processAutoTopups(stripe);
    } catch (err: any) {
      log(`Error in quick billing check: ${err.message}`, "billing-error");
    }
  };

  log("Starting billing processor - daily run at 6pm AEST, quick checks every 30 minutes");
  scheduleNextBillingRun();

  // Run quick check on startup, then every 30 minutes
  setTimeout(runQuickCheck, 2 * 60 * 1000); // 2 minutes after startup
  setInterval(runQuickCheck, 30 * 60 * 1000); // Every 30 minutes
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
        // Fetch payment method details for card info display
        let cardBrand: string | undefined;
        let cardLast4: string | undefined;
        try {
          const paymentMethod = await stripe.paymentMethods.retrieve(wallet.autoTopupPaymentMethodId);
          if (paymentMethod.card?.brand) {
            cardBrand = paymentMethod.card.brand.charAt(0).toUpperCase() + paymentMethod.card.brand.slice(1);
          }
          cardLast4 = paymentMethod.card?.last4;
        } catch (pmError) {
          // Ignore - card info is optional for display
        }

        // SECURITY: Use creditWallet with idempotency check on stripePaymentIntentId
        // This prevents double-crediting if the job runs twice after a successful charge
        await dbStorage.creditWallet(wallet.auth0UserId, wallet.autoTopupAmountCents, {
          type: 'auto_topup',
          stripePaymentIntentId: paymentIntent.id,
          metadata: {
            source: 'auto_topup',
            cardBrand,
            cardLast4,
            reason: 'Automatic wallet top-up',
          },
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
