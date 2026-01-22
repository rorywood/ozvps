import { Router, Request, Response } from "express";
import { db } from "../../server/db";
import { serverBilling, serverCancellations, userMappings } from "../../shared/schema";
import { eq, desc, and, like, or, isNull } from "drizzle-orm";
import { virtfusionClient } from "../../server/virtfusion";
import { auditSuccess, auditFailure } from "../utils/audit-log";

export function registerServersRoutes(router: Router) {
  // List all servers (from VirtFusion)
  router.get("/servers", async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const perPage = Math.min(parseInt(req.query.perPage as string) || 50, 100);
      const search = req.query.search as string;

      // listServers returns an array directly, not paginated response
      const allServers = await virtfusionClient.listServers();

      // Filter by search if provided
      let filteredServers = allServers || [];
      if (search) {
        const searchLower = search.toLowerCase();
        filteredServers = filteredServers.filter((s: any) =>
          s.name?.toLowerCase().includes(searchLower) ||
          s.hostname?.toLowerCase().includes(searchLower) ||
          s.primaryIpAddress?.includes(search)
        );
      }

      // Simple pagination on filtered results
      const total = filteredServers.length;
      const startIndex = (page - 1) * perPage;
      const paginatedServers = filteredServers.slice(startIndex, startIndex + perPage);

      // Enrich with billing data
      const enrichedServers = await Promise.all(
        paginatedServers.map(async (server: any) => {
          const [billing] = await db
            .select()
            .from(serverBilling)
            .where(eq(serverBilling.virtfusionServerId, String(server.id)));

          const [cancellation] = await db
            .select()
            .from(serverCancellations)
            .where(
              and(
                eq(serverCancellations.virtfusionServerId, String(server.id)),
                eq(serverCancellations.status, "pending")
              )
            );

          return {
            ...server,
            billing: billing || null,
            pendingCancellation: cancellation || null,
          };
        })
      );

      res.json({
        servers: enrichedServers,
        pagination: {
          currentPage: page,
          perPage,
          total,
          totalPages: Math.ceil(total / perPage),
        },
        meta: { total },
      });
    } catch (error: any) {
      console.log(`[admin-servers] List servers error: ${error.message}`);
      res.status(500).json({ error: "Failed to list servers" });
    }
  });

  // Get server details
  router.get("/servers/:serverId", async (req: Request, res: Response) => {
    try {
      const serverId = parseInt(req.params.serverId, 10);
      if (isNaN(serverId)) {
        return res.status(400).json({ error: "Invalid server ID" });
      }

      const server = await virtfusionClient.getServer(serverId);

      // Get billing info
      const [billing] = await db
        .select()
        .from(serverBilling)
        .where(eq(serverBilling.virtfusionServerId, String(serverId)));

      // Get owner info - try multiple sources
      let owner: { email: string; name: string | null; auth0UserId?: string } | null = null;

      // First try userMappings if we have billing
      if (billing) {
        const [ownerMapping] = await db
          .select()
          .from(userMappings)
          .where(eq(userMappings.auth0UserId, billing.auth0UserId));
        if (ownerMapping) {
          owner = {
            email: ownerMapping.email,
            name: ownerMapping.name,
            auth0UserId: ownerMapping.auth0UserId,
          };
        }
      }

      // If no owner found, try to get from VirtFusion directly
      if (!owner) {
        try {
          const vfOwner = await virtfusionClient.getServerOwner(String(serverId));
          if (vfOwner) {
            owner = {
              email: vfOwner.email,
              name: vfOwner.name,
              auth0UserId: vfOwner.extRelationId || undefined,
            };
          }
        } catch (err) {
          // VirtFusion owner lookup failed, continue without
        }
      }

      // Get cancellation status
      const [cancellation] = await db
        .select()
        .from(serverCancellations)
        .where(
          and(
            eq(serverCancellations.virtfusionServerId, String(serverId)),
            eq(serverCancellations.status, "pending")
          )
        );

      res.json({
        server,
        billing: billing || null,
        owner,
        pendingCancellation: cancellation || null,
      });
    } catch (error: any) {
      console.log(`[admin-servers] Get server error: ${error.message}`);
      res.status(500).json({ error: "Failed to get server details" });
    }
  });

  // Get server live stats (CPU, RAM, disk usage)
  router.get("/servers/:serverId/stats", async (req: Request, res: Response) => {
    try {
      const serverId = parseInt(req.params.serverId, 10);
      if (isNaN(serverId)) {
        return res.status(400).json({ error: "Invalid server ID" });
      }

      const stats = await virtfusionClient.getServerLiveStats(String(serverId));

      res.json({ stats });
    } catch (error: any) {
      console.log(`[admin-servers] Get server stats error: ${error.message}`);
      res.status(500).json({ error: "Failed to get server stats" });
    }
  });

  // Power actions (start, stop, restart, kill)
  router.post("/servers/:serverId/power/:action", async (req: Request, res: Response) => {
    try {
      const serverId = parseInt(req.params.serverId, 10);
      const action = req.params.action;
      const session = req.adminSession!;

      if (isNaN(serverId)) {
        return res.status(400).json({ error: "Invalid server ID" });
      }

      const validActions = ["start", "stop", "restart", "poweroff"];
      if (!validActions.includes(action)) {
        return res.status(400).json({ error: `Invalid action. Must be one of: ${validActions.join(", ")}` });
      }

      const result = await virtfusionClient.powerAction(String(serverId), action as 'start' | 'stop' | 'restart' | 'poweroff');

      console.log(`[admin-servers] Power action ${action} on server ${serverId} by ${session.email}`);

      res.json({ success: true, result });
    } catch (error: any) {
      console.log(`[admin-servers] Power action error: ${error.message}`);
      res.status(500).json({ error: "Failed to perform power action" });
    }
  });

  // Suspend server (VirtFusion)
  router.post("/servers/:serverId/suspend", async (req: Request, res: Response) => {
    try {
      const serverId = parseInt(req.params.serverId, 10);
      const { reason } = req.body;
      const session = req.adminSession!;

      if (isNaN(serverId)) {
        return res.status(400).json({ error: "Invalid server ID" });
      }

      await virtfusionClient.suspendServer(String(serverId));

      console.log(`[admin-servers] Server ${serverId} suspended by ${session.email}: ${reason || "No reason"}`);

      res.json({ success: true });
    } catch (error: any) {
      console.log(`[admin-servers] Suspend error: ${error.message}`);
      res.status(500).json({ error: "Failed to suspend server" });
    }
  });

  // Unsuspend server (VirtFusion)
  router.post("/servers/:serverId/unsuspend", async (req: Request, res: Response) => {
    try {
      const serverId = parseInt(req.params.serverId, 10);
      const session = req.adminSession!;

      if (isNaN(serverId)) {
        return res.status(400).json({ error: "Invalid server ID" });
      }

      await virtfusionClient.unsuspendServer(String(serverId));

      console.log(`[admin-servers] Server ${serverId} unsuspended by ${session.email}`);

      res.json({ success: true });
    } catch (error: any) {
      console.log(`[admin-servers] Unsuspend error: ${error.message}`);
      res.status(500).json({ error: "Failed to unsuspend server" });
    }
  });

  // Admin suspend (with custom message)
  router.post("/servers/:serverId/admin-suspend", async (req: Request, res: Response) => {
    try {
      const serverId = parseInt(req.params.serverId, 10);
      const { reason } = req.body;
      const session = req.adminSession!;

      if (isNaN(serverId)) {
        return res.status(400).json({ error: "Invalid server ID" });
      }

      if (!reason) {
        return res.status(400).json({ error: "Suspension reason is required" });
      }

      // Update billing record - set both adminSuspended and status
      await db
        .update(serverBilling)
        .set({
          status: "suspended",
          adminSuspended: true,
          adminSuspendedAt: new Date(),
          adminSuspendedReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(serverBilling.virtfusionServerId, String(serverId)));

      // Suspend in VirtFusion
      await virtfusionClient.suspendServer(String(serverId));

      // Audit log
      await auditSuccess(req, "server.admin-suspend", "server", String(serverId), undefined, { reason });

      console.log(`[admin-servers] Server ${serverId} admin-suspended by ${session.email}: ${reason}`);

      res.json({ success: true });
    } catch (error: any) {
      await auditFailure(req, "server.admin-suspend", "server", error.message, req.params.serverId);
      console.log(`[admin-servers] Admin suspend error: ${error.message}`);
      res.status(500).json({ error: "Failed to suspend server" });
    }
  });

  // Admin unsuspend (works for any suspension - admin or VirtFusion direct)
  router.post("/servers/:serverId/admin-unsuspend", async (req: Request, res: Response) => {
    try {
      const serverId = parseInt(req.params.serverId, 10);
      const session = req.adminSession!;

      if (isNaN(serverId)) {
        return res.status(400).json({ error: "Invalid server ID" });
      }

      // Unsuspend in VirtFusion first (this also boots the server automatically)
      await virtfusionClient.unsuspendServer(String(serverId));

      // Update billing record if it exists - clear adminSuspended and restore status to active
      await db
        .update(serverBilling)
        .set({
          status: "active",
          adminSuspended: false,
          adminSuspendedAt: null,
          adminSuspendedReason: null,
          updatedAt: new Date(),
        })
        .where(eq(serverBilling.virtfusionServerId, String(serverId)));

      // Audit log
      await auditSuccess(req, "server.admin-unsuspend", "server", String(serverId));

      console.log(`[admin-servers] Server ${serverId} unsuspended by ${session.email}`);

      res.json({ success: true });
    } catch (error: any) {
      await auditFailure(req, "server.admin-unsuspend", "server", error.message, req.params.serverId);
      console.log(`[admin-servers] Unsuspend error: ${error.message}`);
      res.status(500).json({ error: "Failed to unsuspend server" });
    }
  });

  // Delete server
  router.delete("/servers/:serverId", async (req: Request, res: Response) => {
    try {
      const serverId = parseInt(req.params.serverId, 10);
      const { reason, confirm } = req.body;
      const session = req.adminSession!;

      if (isNaN(serverId)) {
        return res.status(400).json({ error: "Invalid server ID" });
      }

      if (confirm !== "DELETE") {
        return res.status(400).json({ error: "Must confirm deletion by setting confirm: 'DELETE'" });
      }

      // Delete from VirtFusion
      await virtfusionClient.deleteServer(serverId);

      // Update billing record
      await db
        .update(serverBilling)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(serverBilling.virtfusionServerId, String(serverId)));

      // Update any pending cancellation
      await db
        .update(serverCancellations)
        .set({ status: "completed", completedAt: new Date() })
        .where(
          and(
            eq(serverCancellations.virtfusionServerId, String(serverId)),
            eq(serverCancellations.status, "pending")
          )
        );

      // Audit log
      await auditSuccess(req, "server.delete", "server", String(serverId), undefined, { reason });

      console.log(`[admin-servers] Server ${serverId} deleted by ${session.email}: ${reason || "No reason"}`);

      res.json({ success: true });
    } catch (error: any) {
      await auditFailure(req, "server.delete", "server", error.message, req.params.serverId);
      console.log(`[admin-servers] Delete error: ${error.message}`);
      res.status(500).json({ error: "Failed to delete server" });
    }
  });

  // Transfer server to another user
  router.post("/servers/:serverId/transfer", async (req: Request, res: Response) => {
    try {
      const serverId = parseInt(req.params.serverId, 10);
      const { newAuth0UserId } = req.body;
      const session = req.adminSession!;

      if (isNaN(serverId)) {
        return res.status(400).json({ error: "Invalid server ID" });
      }

      if (!newAuth0UserId) {
        return res.status(400).json({ error: "newAuth0UserId is required" });
      }

      // Check new owner exists
      const [newOwner] = await db
        .select()
        .from(userMappings)
        .where(eq(userMappings.auth0UserId, newAuth0UserId));

      if (!newOwner) {
        return res.status(404).json({ error: "New owner not found" });
      }

      // Update in VirtFusion
      await virtfusionClient.transferServerOwnership(serverId, newOwner.virtFusionUserId!);

      // Update billing record
      await db
        .update(serverBilling)
        .set({ auth0UserId: newAuth0UserId, updatedAt: new Date() })
        .where(eq(serverBilling.virtfusionServerId, String(serverId)));

      // Audit log
      await auditSuccess(req, "server.transfer", "server", String(serverId), undefined, {
        newOwnerEmail: newOwner.email,
        newAuth0UserId,
      });

      console.log(`[admin-servers] Server ${serverId} transferred to ${newOwner.email} by ${session.email}`);

      res.json({ success: true, newOwner: { email: newOwner.email, name: newOwner.name } });
    } catch (error: any) {
      await auditFailure(req, "server.transfer", "server", error.message, req.params.serverId);
      console.log(`[admin-servers] Transfer error: ${error.message}`);
      res.status(500).json({ error: "Failed to transfer server" });
    }
  });

  // List pending cancellations
  router.get("/cancellations", async (req: Request, res: Response) => {
    try {
      const cancellations = await db
        .select()
        .from(serverCancellations)
        .where(eq(serverCancellations.status, "pending"))
        .orderBy(serverCancellations.scheduledDeletionAt);

      res.json({ cancellations });
    } catch (error: any) {
      console.log(`[admin-servers] List cancellations error: ${error.message}`);
      res.status(500).json({ error: "Failed to list cancellations" });
    }
  });

  // Cancel a pending cancellation (revert)
  router.post("/cancellations/:id/revoke", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const session = req.adminSession!;

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }

      const [cancellation] = await db
        .update(serverCancellations)
        .set({ status: "revoked", revokedAt: new Date() })
        .where(
          and(
            eq(serverCancellations.id, id),
            eq(serverCancellations.status, "pending")
          )
        )
        .returning();

      if (!cancellation) {
        return res.status(404).json({ error: "Cancellation not found or already processed" });
      }

      console.log(`[admin-servers] Cancellation ${id} revoked by ${session.email}`);

      res.json({ success: true, cancellation });
    } catch (error: any) {
      console.log(`[admin-servers] Revoke cancellation error: ${error.message}`);
      res.status(500).json({ error: "Failed to revoke cancellation" });
    }
  });
}
