import Stripe from "stripe";
import { db } from "./db";
import { wallets, walletTransactions, serverBilling, serverCancellations, plans } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAutoTopupIdempotencyKey, runBillingJob, retryUnpaidServers } from "./billing";
import { dbStorage } from "./storage";
import { log } from "./logger";
import { processTrials } from "./trial-processor";
import {
  markProcessorFailed,
  markProcessorStarted,
  markProcessorSucceeded,
  scheduleProcessorRun,
} from "./processor-health";

// Billing runs daily at 6pm AEST (8am UTC / 18:00 AEST)
// AEST is UTC+10, so 6pm AEST = 8am UTC
const BILLING_HOUR_UTC = 8; // 8am UTC = 6pm AEST
const BILLING_DAILY_PROCESSOR = "billing-daily";
const BILLING_QUICK_CHECK_PROCESSOR = "billing-quick-check";
const QUICK_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const QUICK_CHECK_STARTUP_DELAY_MS = 2 * 60 * 1000;

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
    log(`Next billing run scheduled for ${nextRunDate.toISOString()} (6pm AEST)`, 'billing');
    void scheduleProcessorRun(BILLING_DAILY_PROCESSOR, { nextRunAt: nextRunDate });

    setTimeout(async () => {
      const startedAtMs = await markProcessorStarted(BILLING_DAILY_PROCESSOR);
      try {
        log('Starting daily billing run (6pm AEST)...', 'billing');
        const jobResult = await runBillingJob();
        log(`Daily billing run result: charged=${jobResult.charged.length}, noFunds=${jobResult.skippedInsufficientFunds.length}`, 'billing');
        await processAutoTopups(stripe);
        log('Daily billing run completed', 'billing');
        await markProcessorSucceeded(BILLING_DAILY_PROCESSOR, startedAtMs);
      } catch (err: any) {
        log(`Error in billing cycle: ${err.message}`, 'billing', { level: 'error' });
        await markProcessorFailed(BILLING_DAILY_PROCESSOR, err, startedAtMs);
      }

      // Schedule the next run
      scheduleNextBillingRun();
    }, msUntilNextRun);
  };

  // Also run a quick check every 30 minutes for urgent tasks (auto top-ups, reactivations, trials)
  // This ensures users who top up get their servers reactivated promptly
  const runQuickCheck = async () => {
    const startedAtMs = await markProcessorStarted(BILLING_QUICK_CHECK_PROCESSOR, {
      nextRunAt: new Date(Date.now() + QUICK_CHECK_INTERVAL_MS),
    });

    try {
      await processAutoTopups(stripe);
      // Process trial expirations
      const trialResult = await processTrials();
      await markProcessorSucceeded(BILLING_QUICK_CHECK_PROCESSOR, startedAtMs, {
        nextRunAt: new Date(Date.now() + QUICK_CHECK_INTERVAL_MS),
        lastResult: {
          trialsEnded: trialResult.ended,
          trialsQueued: trialResult.queued,
          trialErrors: trialResult.errors,
        },
      });
    } catch (err: any) {
      log(`Error in quick billing check: ${err.message}`, 'billing', { level: 'error' });
      await markProcessorFailed(BILLING_QUICK_CHECK_PROCESSOR, err, startedAtMs, {
        nextRunAt: new Date(Date.now() + QUICK_CHECK_INTERVAL_MS),
      });
    }
  };

  log('Starting billing processor - daily run at 6pm AEST, quick checks every 30 minutes', 'billing');
  scheduleNextBillingRun();
  await scheduleProcessorRun(BILLING_QUICK_CHECK_PROCESSOR, {
    nextRunAt: new Date(Date.now() + QUICK_CHECK_STARTUP_DELAY_MS),
  });

  // Run quick check on startup, then every 30 minutes
  setTimeout(runQuickCheck, QUICK_CHECK_STARTUP_DELAY_MS); // 2 minutes after startup
  setInterval(runQuickCheck, QUICK_CHECK_INTERVAL_MS); // Every 30 minutes
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

      // Key off the wallet state so retries of the same charge dedupe cleanly,
      // but a later legitimate top-up the same day can still proceed.
      const idempotencyKey = getAutoTopupIdempotencyKey(wallet);

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
        log(`Auto top-up successful for ${wallet.auth0UserId}: $${(wallet.autoTopupAmountCents / 100).toFixed(2)}`, 'billing');

        // Try to reactivate any unpaid/suspended servers after successful top-up
        await retryUnpaidServers(wallet.auth0UserId);
      }
    } catch (err: any) {
      log(`Auto top-up failed for ${wallet.auth0UserId}: ${err.message}`, 'billing', { level: 'error' });
    }
  }
}

// Old overdue server processing removed - now using monthly billing system with suspend/unsuspend
