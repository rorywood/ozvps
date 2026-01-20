import { Router, Request, Response } from "express";
import { db } from "../../server/db";
import { serverBilling, billingLedger, wallets, walletTransactions, userMappings, plans } from "../../shared/schema";
import { eq, desc, and, gte, lte, sql, or, isNull } from "drizzle-orm";
import { virtfusionClient } from "../../server/virtfusion";
import { runBillingJob } from "../../server/billing";

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

      res.json({ records });
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

      // Get ledger entries for this server
      const ledgerEntries = await db
        .select()
        .from(billingLedger)
        .where(eq(billingLedger.virtfusionServerId, record.billing.virtfusionServerId))
        .orderBy(desc(billingLedger.createdAt))
        .limit(50);

      res.json({ record, ledgerEntries });
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

      const { status, monthlyPriceCents, autoRenew, freeServer, nextBillAt, suspendAt } = req.body;

      const updateData: Record<string, any> = { updatedAt: new Date() };

      if (status !== undefined) updateData.status = status;
      if (monthlyPriceCents !== undefined) updateData.monthlyPriceCents = monthlyPriceCents;
      if (autoRenew !== undefined) updateData.autoRenew = autoRenew;
      if (freeServer !== undefined) updateData.freeServer = freeServer;
      if (nextBillAt !== undefined) updateData.nextBillAt = nextBillAt ? new Date(nextBillAt) : null;
      if (suspendAt !== undefined) updateData.suspendAt = suspendAt ? new Date(suspendAt) : null;

      const [updated] = await db
        .update(serverBilling)
        .set(updateData)
        .where(eq(serverBilling.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Billing record not found" });
      }

      console.log(`[admin-billing] Billing record ${id} updated by ${session.email}: ${JSON.stringify(updateData)}`);

      res.json({ record: updated });
    } catch (error: any) {
      console.log(`[admin-billing] Update record error: ${error.message}`);
      res.status(500).json({ error: "Failed to update billing record" });
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

      // Set next bill date to 1 month from now
      const nextBillAt = new Date();
      nextBillAt.setMonth(nextBillAt.getMonth() + 1);

      // Update billing status
      await db
        .update(serverBilling)
        .set({
          status: "active",
          suspendAt: null,
          nextBillAt,
          updatedAt: new Date(),
        })
        .where(eq(serverBilling.id, id));

      // Unsuspend in VirtFusion (this also boots the server automatically)
      await virtfusionClient.unsuspendServer(billing.virtfusionServerId);

      console.log(`[admin-billing] Server ${billing.virtfusionServerId} unsuspended (billing) by ${session.email}`);

      res.json({ success: true, nextBillAt });
    } catch (error: any) {
      console.log(`[admin-billing] Unsuspend error: ${error.message}`);
      res.status(500).json({ error: "Failed to unsuspend server" });
    }
  });

  // Delete billing record (for orphaned records)
  router.delete("/billing/records/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const session = req.adminSession!;
      const { confirm } = req.body;

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }

      if (confirm !== "DELETE") {
        return res.status(400).json({ error: "Confirmation required" });
      }

      const [billing] = await db.select().from(serverBilling).where(eq(serverBilling.id, id));

      if (!billing) {
        return res.status(404).json({ error: "Billing record not found" });
      }

      // Delete the billing record
      await db.delete(serverBilling).where(eq(serverBilling.id, id));

      console.log(`[admin-billing] Billing record ${id} (server ${billing.virtfusionServerId}) deleted by ${session.email}`);

      res.json({ success: true });
    } catch (error: any) {
      console.log(`[admin-billing] Delete record error: ${error.message}`);
      res.status(500).json({ error: "Failed to delete billing record" });
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

      res.json({
        success: true,
        cleaned,
        total: allBillingRecords.length,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      console.log(`[admin-billing] Cleanup error: ${error.message}`);
      res.status(500).json({ error: "Failed to cleanup orphaned records" });
    }
  });

  // Run billing job manually
  router.post("/billing/run-job", async (req: Request, res: Response) => {
    try {
      const session = req.adminSession!;

      console.log(`[admin-billing] Manual billing job triggered by ${session.email}`);

      // Run billing job (non-blocking)
      runBillingJob()
        .then(() => console.log(`[admin-billing] Manual billing job completed`))
        .catch((err) => console.log(`[admin-billing] Manual billing job error: ${err.message}`));

      res.json({ success: true, message: "Billing job started" });
    } catch (error: any) {
      console.log(`[admin-billing] Run job error: ${error.message}`);
      res.status(500).json({ error: "Failed to start billing job" });
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

      res.json({ entries });
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

      // Get servers due for billing in next 24 hours
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
