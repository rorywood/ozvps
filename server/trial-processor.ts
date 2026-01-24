import { db } from "./db";
import { serverBilling, serverCancellations, userMappings } from "../shared/schema";
import { eq, and, lte, isNull, isNotNull, sql } from "drizzle-orm";
import { virtfusionClient } from "./virtfusion";
import { log } from './log';
import { sendTrialEndedEmail } from './email';

/**
 * Trial Processor - handles expiration of trial servers
 *
 * Phase 1: End expired trials
 * - Find trials where trialExpiresAt <= now and trialEndedAt IS NULL
 * - Power off expired servers
 * - Set trialEndedAt to now, status to 'trial_ended'
 * - Send trial ended email
 *
 * Phase 2: Delete old ended trials
 * - Find trials where trialEndedAt is 7+ days ago
 * - Create cancellation request (immediate mode) to delete server
 * - This uses the existing cancellation flow for clean deletion
 */

// Phase 1: End expired trials
async function endExpiredTrials(): Promise<{ ended: number; errors: number }> {
  let ended = 0;
  let errors = 0;
  const now = new Date();

  try {
    // Find active trials that have expired
    const expiredTrials = await db
      .select()
      .from(serverBilling)
      .where(
        and(
          eq(serverBilling.isTrial, true),
          isNull(serverBilling.trialEndedAt),
          isNotNull(serverBilling.trialExpiresAt),
          lte(serverBilling.trialExpiresAt, now)
        )
      );

    for (const trial of expiredTrials) {
      try {
        const serverId = trial.virtfusionServerId;
        log(`Ending expired trial for server ${serverId}`, 'trial');

        // Power off the server
        try {
          await virtfusionClient.powerAction(serverId, 'poweroff');
          log(`Powered off trial server ${serverId}`, 'trial');
        } catch (powerErr: any) {
          // Server might already be off or deleted
          log(`Warning: Could not power off trial server ${serverId}: ${powerErr.message}`, 'trial');
        }

        // Update billing record
        await db
          .update(serverBilling)
          .set({
            trialEndedAt: now,
            status: "trial_ended",
            updatedAt: now,
          })
          .where(eq(serverBilling.id, trial.id));

        // Send trial ended email to user
        try {
          const [userMapping] = await db
            .select()
            .from(userMappings)
            .where(eq(userMappings.auth0UserId, trial.auth0UserId));

          if (userMapping) {
            // Get server name from VirtFusion
            let serverName = `Server ${serverId}`;
            try {
              const serverData = await virtfusionClient.getServer(serverId);
              if (serverData?.name) {
                serverName = serverData.name;
              }
            } catch {
              // Use default name if can't fetch
            }

            await sendTrialEndedEmail(userMapping.email, serverName);
            log(`Sent trial ended email to ${userMapping.email} for server ${serverId}`, 'trial');
          }
        } catch (emailErr: any) {
          log(`Warning: Could not send trial ended email for server ${serverId}: ${emailErr.message}`, 'trial');
        }

        log(`Trial ended for server ${serverId}`, 'trial');
        ended++;
      } catch (trialErr: any) {
        log(`Error ending trial for server ${trial.virtfusionServerId}: ${trialErr.message}`, 'trial');
        errors++;
      }
    }
  } catch (error: any) {
    log(`Error in endExpiredTrials: ${error.message}`, 'trial');
    errors++;
  }

  return { ended, errors };
}

// Phase 2: Delete old ended trials (7+ days after trial ended)
async function deleteOldEndedTrials(): Promise<{ queued: number; errors: number }> {
  let queued = 0;
  let errors = 0;
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  try {
    // Find trials that ended 7+ days ago
    const oldEndedTrials = await db
      .select()
      .from(serverBilling)
      .where(
        and(
          eq(serverBilling.isTrial, true),
          isNotNull(serverBilling.trialEndedAt),
          lte(serverBilling.trialEndedAt, sevenDaysAgo),
          // Don't process if already cancelled/deleted
          sql`${serverBilling.status} NOT IN ('cancelled', 'deleted')`
        )
      );

    for (const trial of oldEndedTrials) {
      try {
        const serverId = trial.virtfusionServerId;

        // Check if there's already a pending cancellation for this server
        const [existingCancellation] = await db
          .select()
          .from(serverCancellations)
          .where(
            and(
              eq(serverCancellations.virtfusionServerId, serverId),
              eq(serverCancellations.status, "pending")
            )
          );

        if (existingCancellation) {
          log(`Server ${serverId} already has a pending cancellation, skipping`, 'trial');
          continue;
        }

        // Create immediate cancellation request
        const scheduledDeletionAt = new Date(now);
        scheduledDeletionAt.setMinutes(scheduledDeletionAt.getMinutes() + 5); // 5 minute delay

        await db
          .insert(serverCancellations)
          .values({
            auth0UserId: trial.auth0UserId,
            virtfusionServerId: serverId,
            serverName: null,
            reason: "Trial period ended - automatic deletion after 7 days",
            mode: "immediate",
            status: "pending",
            scheduledDeletionAt,
          });

        // Update billing status
        await db
          .update(serverBilling)
          .set({
            status: "cancelled",
            updatedAt: now,
          })
          .where(eq(serverBilling.id, trial.id));

        log(`Queued deletion for old trial server ${serverId}`, 'trial');
        queued++;
      } catch (deleteErr: any) {
        log(`Error queuing deletion for trial server ${trial.virtfusionServerId}: ${deleteErr.message}`, 'trial');
        errors++;
      }
    }
  } catch (error: any) {
    log(`Error in deleteOldEndedTrials: ${error.message}`, 'trial');
    errors++;
  }

  return { queued, errors };
}

/**
 * Main trial processing function - called by billing processor
 */
export async function processTrials(): Promise<{ ended: number; queued: number; errors: number }> {
  let totalEnded = 0;
  let totalQueued = 0;
  let totalErrors = 0;

  try {
    // Phase 1: End expired trials
    const { ended, errors: endErrors } = await endExpiredTrials();
    totalEnded = ended;
    totalErrors += endErrors;

    // Phase 2: Delete old ended trials
    const { queued, errors: deleteErrors } = await deleteOldEndedTrials();
    totalQueued = queued;
    totalErrors += deleteErrors;

    if (totalEnded > 0 || totalQueued > 0) {
      log(`Trial processor: ${totalEnded} ended, ${totalQueued} queued for deletion`, 'trial');
    }
  } catch (error: any) {
    log(`Error in trial processor: ${error.message}`, 'trial');
    totalErrors++;
  }

  return { ended: totalEnded, queued: totalQueued, errors: totalErrors };
}
