import { Router, Request, Response } from "express";
import { db } from "../../server/db";
import { serverBilling, billingLedger, wallets, walletTransactions, userMappings, plans } from "../../shared/schema";
import { eq, desc, and, gte, lte, sql, or, isNull } from "drizzle-orm";
import { virtfusionClient } from "../../server/virtfusion";
import { runBillingJob } from "../../server/billing";
import { auth0Client } from "../../server/auth0";
import { auditSuccess, auditFailure } from "../utils/audit-log";

// SECURITY: Validate and sanitize reason strings
const MAX_REASON_LENGTH = 500;
function sanitizeReason(reason: unknown): string | undefined {
  if (reason === undefined || reason === null || reason === '') return undefined;
  if (typeof reason !== 'string') return undefined;
  return reason.trim().slice(0, MAX_REASON_LENGTH);
}

export function registerBillingRoutes(router: Router) {
  // List all billing records
  router.get("/billing/records", async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;
      const status = req.query.status as string;

      let query = db
        .select({
          billing: serverBilling,
          user: {
            email: userMappings.email,
            name: userMappings.name,
          },
          plan: {
            name: plans.name,
            code: plans.code,
          },
        })
        .from(serverBilling)
        .leftJoin(userMappings, eq(serverBilling.auth0UserId, userMappings.auth0UserId))
        .leftJoin(plans, eq(serverBilling.planId, plans.id))
        .orderBy(desc(serverBilling.updatedAt))
        .limit(limit)
        .offset(offset);

      if (status) {
        // @ts-ignore
        query = query.where(eq(serverBilling.status, status));
      }

      const records = await query;

      // Enrich records with Auth0 user data and VirtFusion server info
      const enrichedRecords = await Promise.all(
        records.map(async (record) => {
          let enrichedRecord = { ...record, serverName: undefined as string | undefined, serverUuid: undefined as string | undefined };

          // Try to get server name/UUID from VirtFusion
          try {
            const server = await virtfusionClient.getServer(record.billing.virtfusionServerId);
            if (server) {
              enrichedRecord.serverName = server.name;
              enrichedRecord.serverUuid = server.uuid;
            }
          } catch (err) {
            // Server may not exist anymore, use stored UUID if available
            enrichedRecord.serverUuid = record.billing.virtfusionServerUuid || undefined;
          }

          // If user info is already available from userMappings, use it
          if (record.user?.email) {
            return enrichedRecord;
          }

          // Otherwise, fetch from Auth0
          if (record.billing.auth0UserId) {
            try {
              const auth0User = await auth0Client.getUserById(record.billing.auth0UserId);
              if (auth0User) {
                return {
                  ...enrichedRecord,
                  user: {
                    email: auth0User.email,
                    name: auth0User.name || null,
                  },
                };
              }
            } catch (err) {
              // Auth0 lookup failed, keep original record
            }
          }

          return enrichedRecord;
        })
      );

      res.json({ records: enrichedRecords });
    } catch (error: any) {
      console.log(`[admin-billing] List records error: ${error.message}`);
      res.status(500).json({ error: "Failed to list billing records" });
    }
  });

  // Get billing record details
  router.get("/billing/records/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }

      const [record] = await db
        .select({
          billing: serverBilling,
          user: {
            email: userMappings.email,
            name: userMappings.name,
            auth0UserId: userMappings.auth0UserId,
          },
          plan: plans,
        })
        .from(serverBilling)
        .leftJoin(userMappings, eq(serverBilling.auth0UserId, userMappings.auth0UserId))
        .leftJoin(plans, eq(serverBilling.planId, plans.id))
        .where(eq(serverBilling.id, id));

      if (!record) {
        return res.status(404).json({ error: "Billing record not found" });
      }

      // Enrich with Auth0 user data if local mapping is missing
      let enrichedRecord = record;
      if (!record.user?.email && record.billing.auth0UserId) {
        try {
          const auth0User = await auth0Client.getUserById(record.billing.auth0UserId);
          if (auth0User) {
            enrichedRecord = {
              ...record,
              user: {
                email: auth0User.email,
                name: auth0User.name || null,
                auth0UserId: record.billing.auth0UserId,
              },
            };
          }
        } catch (err) {
          // Auth0 lookup failed, keep original record
        }
      }

      // Get ledger entries for this server
      const ledgerEntries = await db
        .select()
        .from(billingLedger)
        .where(eq(billingLedger.virtfusionServerId, record.billing.virtfusionServerId))
        .orderBy(desc(billingLedger.createdAt))
        .limit(50);

      res.json({ record: enrichedRecord, ledgerEntries });
    } catch (error: any) {
      console.log(`[admin-billing] Get record error: ${error.message}`);
      res.status(500).json({ error: "Failed to get billing record" });
    }
  });

  // Update billing record
  router.put("/billing/records/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const session = req.adminSession!;

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }

      // Get the current billing record first
      const [currentBilling] = await db.select().from(serverBilling).where(eq(serverBilling.id, id));
      if (!currentBilling) {
        return res.status(404).json({ error: "Billing record not found" });
      }

      const { status, monthlyPriceCents, autoRenew, freeServer, nextBillAt, suspendAt } = req.body;

      // Validate monthlyPriceCents is a non-negative integer (max $10,000/month)
      if (monthlyPriceCents !== undefined) {
        const price = Number(monthlyPriceCents);
        if (!Number.isInteger(price) || price < 0 || price > 1_000_000) {
          return res.status(400).json({ error: 'monthlyPriceCents must be an integer between 0 and 1000000' });
        }
      }

      const updateData: Record<string, any> = { updatedAt: new Date() };

      if (status !== undefined) updateData.status = status;
      if (monthlyPriceCents !== undefined) updateData.monthlyPriceCents = Number(monthlyPriceCents);
      if (autoRenew !== undefined) updateData.autoRenew = autoRenew;
      if (freeServer !== undefined) updateData.freeServer = freeServer;
      if (nextBillAt !== undefined) {
        const newNextBillAt = nextBillAt ? new Date(nextBillAt) : null;
        updateData.nextBillAt = newNextBillAt;

        // If setting a future date and no explicit status provided, reset to active
        // This allows admins to effectively "skip" the current billing cycle
        if (newNextBillAt && newNextBillAt > new Date() && status === undefined) {
          updateData.status = "active";
          updateData.suspendAt = null; // Clear any pending suspension
        }
      }
      if (suspendAt !== undefined) updateData.suspendAt = suspendAt ? new Date(suspendAt) : null;

      // If status is being changed to 'suspended', actually suspend in VirtFusion
      if (status === 'suspended' && currentBilling.status !== 'suspended') {
        try {
          await virtfusionClient.suspendServer(currentBilling.virtfusionServerId);
          updateData.adminSuspended = true;
          updateData.adminSuspendedAt = new Date();
          updateData.adminSuspendedReason = 'Admin manual suspension';
          console.log(`[admin-billing] Server ${currentBilling.virtfusionServerId} suspended in VirtFusion by ${session.email}`);
        } catch (vfError: any) {
          console.log(`[admin-billing] Failed to suspend server ${currentBilling.virtfusionServerId} in VirtFusion: ${vfError.message}`);
          // SECURITY: Don't expose internal error details to client
          return res.status(500).json({ error: 'Failed to suspend server. Please check server logs for details.' });
        }
      }

      const [updated] = await db
        .update(serverBilling)
        .set(updateData)
        .where(eq(serverBilling.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Billing record not found" });
      }

      // Audit log
      await auditSuccess(req, "billing.update", "billing", String(id), currentBilling.virtfusionServerId, updateData);

      console.log(`[admin-billing] Billing record ${id} updated by ${session.email}: ${JSON.stringify(updateData)}`);

      res.json({ record: updated });
    } catch (error: any) {
      await auditFailure(req, "billing.update", "billing", error.message, req.params.id);
      console.log(`[admin-billing] Update record error: ${error.message}`);
      res.status(500).json({ error: "Failed to update billing record" });
    }
  });

  // Suspend a server (admin)
  router.post("/billing/records/:id/suspend", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const session = req.adminSession!;
      const reason = sanitizeReason(req.body.reason);

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }

      const [billing] = await db.select().from(serverBilling).where(eq(serverBilling.id, id));

      if (!billing) {
        return res.status(404).json({ error: "Billing record not found" });
      }

      if (billing.status === 'suspended') {
        return res.status(400).json({ error: "Server is already suspended" });
      }

      // Suspend in VirtFusion
      await virtfusionClient.suspendServer(billing.virtfusionServerId);

      // Update billing status
      await db
        .update(serverBilling)
        .set({
          status: "suspended",
          adminSuspended: true,
          adminSuspendedAt: new Date(),
          adminSuspendedReason: reason || 'Admin suspension',
          updatedAt: new Date(),
        })
        .where(eq(serverBilling.id, id));

      // Audit log
      await auditSuccess(req, "billing.suspend", "billing", String(id), billing.virtfusionServerId, { reason });

      console.log(`[admin-billing] Server ${billing.virtfusionServerId} suspended by ${session.email}: ${reason || 'No reason'}`);

      res.json({ success: true });
    } catch (error: any) {
      await auditFailure(req, "billing.suspend", "billing", error.message, req.params.id);
      console.log(`[admin-billing] Suspend error: ${error.message}`);
      // SECURITY: Don't expose internal error details
      res.status(500).json({ error: 'Failed to suspend server. Please check server logs for details.' });
    }
  });

  // Unsuspend a server (billing)
  router.post("/billing/records/:id/unsuspend", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const session = req.adminSession!;

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }

      const [billing] = await db.select().from(serverBilling).where(eq(serverBilling.id, id));

      if (!billing) {
        return res.status(404).json({ error: "Billing record not found" });
      }

      // Unsuspend in VirtFusion FIRST (before updating database)
      // This ensures we don't mark as active if VirtFusion fails
      console.log(`[admin-billing] Calling VirtFusion unsuspend for server ${billing.virtfusionServerId}`);
      await virtfusionClient.unsuspendServer(billing.virtfusionServerId);
      console.log(`[admin-billing] VirtFusion unsuspend completed for server ${billing.virtfusionServerId}`);

      // Set next bill date to 1 month from now
      const nextBillAt = new Date();
      nextBillAt.setMonth(nextBillAt.getMonth() + 1);

      // Update billing status - also clear admin suspension flags
      await db
        .update(serverBilling)
        .set({
          status: "active",
          suspendAt: null,
          nextBillAt,
          adminSuspended: false,
          adminSuspendedAt: null,
          adminSuspendedReason: null,
          updatedAt: new Date(),
        })
        .where(eq(serverBilling.id, id));

      // Audit log
      await auditSuccess(req, "billing.unsuspend", "billing", String(id), billing.virtfusionServerId, { nextBillAt });

      console.log(`[admin-billing] Server ${billing.virtfusionServerId} unsuspended (billing) by ${session.email}`);

      res.json({ success: true, nextBillAt });
    } catch (error: any) {
      await auditFailure(req, "billing.unsuspend", "billing", error.message, req.params.id);
      console.log(`[admin-billing] Unsuspend error: ${error.message}`);
      res.status(500).json({ error: error.message || "Failed to unsuspend server" });
    }
  });

  // Clean up orphaned billing records
  router.post("/billing/cleanup-orphaned", async (req: Request, res: Response) => {
    try {
      const session = req.adminSession!;

      console.log(`[admin-billing] Cleanup orphaned records triggered by ${session.email}`);

      // Get all billing records
      const allBillingRecords = await db.select().from(serverBilling);

      let cleaned = 0;
      const errors: string[] = [];

      for (const record of allBillingRecords) {
        try {
          // Check if server exists in VirtFusion
          await virtfusionClient.getServer(record.virtfusionServerId);
        } catch (error: any) {
          if (error.message?.includes("404") || error.message?.includes("not found")) {
            // Server doesn't exist, delete the billing record
            await db.delete(serverBilling).where(eq(serverBilling.id, record.id));
            console.log(`[admin-billing] Deleted orphaned billing record ${record.id} for server ${record.virtfusionServerId}`);
            cleaned++;
          } else {
            errors.push(`Server ${record.virtfusionServerId}: ${error.message}`);
          }
        }
      }

      // Audit log
      await auditSuccess(req, "billing.cleanup-orphaned", "billing", undefined, undefined, { cleaned, total: allBillingRecords.length });

      res.json({
        success: true,
        cleaned,
        total: allBillingRecords.length,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      await auditFailure(req, "billing.cleanup-orphaned", "billing", error.message);
      console.log(`[admin-billing] Cleanup error: ${error.message}`);
      res.status(500).json({ error: "Failed to cleanup orphaned records" });
    }
  });

  // Run billing job manually
  router.post("/billing/run-job", async (req: Request, res: Response) => {
    try {
      const session = req.adminSession!;

      console.log(`[admin-billing] Manual billing job triggered by ${session.email}`);

      // Run billing job synchronously so we can return results
      const result = await runBillingJob();

      console.log(`[admin-billing] Manual billing job completed. Charged: ${result.charged.length}, No funds: ${result.skippedInsufficientFunds.length}, Already charged: ${result.skippedAlreadyCharged.length}, Errors: ${result.errors.length}`);

      // Audit log
      await auditSuccess(req, "billing.run-job", "billing");

      res.json({ success: true, result });
    } catch (error: any) {
      await auditFailure(req, "billing.run-job", "billing", error.message);
      console.log(`[admin-billing] Run job error: ${error.message}`);
      res.status(500).json({ error: `Billing job failed: ${error.message}` });
    }
  });

  // Get billing ledger
  router.get("/billing/ledger", async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = parseInt(req.query.offset as string) || 0;
      const auth0UserId = req.query.auth0UserId as string;
      const serverId = req.query.serverId as string;

      let whereClause = undefined;
      if (auth0UserId) {
        whereClause = eq(billingLedger.auth0UserId, auth0UserId);
      } else if (serverId) {
        whereClause = eq(billingLedger.virtfusionServerId, serverId);
      }

      const entries = await db
        .select({
          ledger: billingLedger,
          user: {
            email: userMappings.email,
            name: userMappings.name,
          },
        })
        .from(billingLedger)
        .leftJoin(userMappings, eq(billingLedger.auth0UserId, userMappings.auth0UserId))
        .where(whereClause)
        .orderBy(desc(billingLedger.createdAt))
        .limit(limit)
        .offset(offset);

      // Enrich entries with Auth0 user data if local mapping is missing
      const enrichedEntries = await Promise.all(
        entries.map(async (entry) => {
          if (entry.user?.email) {
            return entry;
          }

          if (entry.ledger.auth0UserId) {
            try {
              const auth0User = await auth0Client.getUserById(entry.ledger.auth0UserId);
              if (auth0User) {
                return {
                  ...entry,
                  user: {
                    email: auth0User.email,
                    name: auth0User.name || null,
                  },
                };
              }
            } catch (err) {
              // Auth0 lookup failed, keep original entry
            }
          }

          return entry;
        })
      );

      res.json({ entries: enrichedEntries });
    } catch (error: any) {
      console.log(`[admin-billing] Get ledger error: ${error.message}`);
      res.status(500).json({ error: "Failed to get billing ledger" });
    }
  });

  // Get billing stats
  router.get("/billing/stats", async (req: Request, res: Response) => {
    try {
      // Get counts by status
      const statusCounts = await db
        .select({
          status: serverBilling.status,
          count: sql<number>`count(*)::int`,
        })
        .from(serverBilling)
        .groupBy(serverBilling.status);

      // Get total MRR (Monthly Recurring Revenue)
      const mrrResult = await db
        .select({
          total: sql<number>`sum(monthly_price_cents)::int`,
        })
        .from(serverBilling)
        .where(
          and(
            eq(serverBilling.status, "active"),
            eq(serverBilling.freeServer, false)
          )
        );

      // Get free server count
      const freeCountResult = await db
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(serverBilling)
        .where(eq(serverBilling.freeServer, true));

      // Get servers due for billing in next 24 hours (excluding free servers)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const dueSoonResult = await db
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(serverBilling)
        .where(
          and(
            eq(serverBilling.status, "active"),
            eq(serverBilling.freeServer, false),
            lte(serverBilling.nextBillAt, tomorrow)
          )
        );

      res.json({
        statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s.count])),
        mrr: mrrResult[0]?.total || 0,
        freeServerCount: freeCountResult[0]?.count || 0,
        dueSoonCount: dueSoonResult[0]?.count || 0,
      });
    } catch (error: any) {
      console.log(`[admin-billing] Get stats error: ${error.message}`);
      res.status(500).json({ error: "Failed to get billing stats" });
    }
  });
}
