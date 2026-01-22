import { Router, Request, Response } from "express";
import { db } from "../../server/db";
import { serverBilling, serverCancellations, userMappings, plans, wallets } from "../../shared/schema";
import { eq, desc, and, like, or, isNull } from "drizzle-orm";
import { virtfusionClient } from "../../server/virtfusion";
import { auth0Client } from "../../server/auth0";
import { auditSuccess, auditFailure } from "../utils/audit-log";
import { sendServerCredentialsEmail } from "../../server/email";

export function registerServersRoutes(router: Router) {
  // List all plans (for provisioning)
  router.get("/plans", async (req: Request, res: Response) => {
    try {
      const allPlans = await db
        .select()
        .from(plans)
        .orderBy(plans.priceMonthly);

      res.json({ plans: allPlans });
    } catch (error: any) {
      console.log(`[admin-servers] List plans error: ${error.message}`);
      res.status(500).json({ error: "Failed to list plans" });
    }
  });

  // Get OS templates for a plan (for provisioning)
  router.get("/plans/:id/templates", async (req: Request, res: Response) => {
    try {
      const planId = parseInt(req.params.id, 10);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }

      const [plan] = await db
        .select()
        .from(plans)
        .where(eq(plans.id, planId));

      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      if (!plan.virtfusionPackageId) {
        return res.json({ templates: [] });
      }

      const templatesData = await virtfusionClient.getOsTemplatesForPackage(plan.virtfusionPackageId);

      // Return grouped templates with full data (like the client API does)
      // Also flatten for convenience
      const groups: any[] = [];
      const flatTemplates: any[] = [];

      if (templatesData && Array.isArray(templatesData)) {
        for (const group of templatesData) {
          const groupTemplates: any[] = [];
          if (group.templates && Array.isArray(group.templates)) {
            for (const t of group.templates) {
              const template = {
                id: t.id,
                name: t.name,
                version: t.version || null,
                description: t.description || null,
                distro: t.distro || group.name,
                slug: t.slug || null,
                group: group.name,
              };
              groupTemplates.push(template);
              flatTemplates.push(template);
            }
          }
          if (groupTemplates.length > 0) {
            groups.push({
              name: group.name,
              templates: groupTemplates,
            });
          }
        }
      }

      console.log(`[admin-servers] Found ${flatTemplates.length} templates in ${groups.length} groups for plan ${planId}`);
      res.json({ templates: flatTemplates, groups });
    } catch (error: any) {
      console.log(`[admin-servers] Get plan templates error: ${error.message}`);
      res.status(500).json({ error: "Failed to get templates" });
    }
  });

  // Location to hypervisor GROUP mapping (must match main server config)
  const LOCATION_CONFIG: Record<string, { name: string; country: string; countryCode: string; hypervisorGroupId: number; enabled: boolean }> = {
    'BNE': { name: 'Brisbane', country: 'Australia', countryCode: 'AU', hypervisorGroupId: 2, enabled: true },
    'SYD': { name: 'Sydney', country: 'Australia', countryCode: 'AU', hypervisorGroupId: 2, enabled: false },
  };

  // Get available locations
  router.get("/locations", async (req: Request, res: Response) => {
    res.json({
      locations: Object.entries(LOCATION_CONFIG).map(([code, config]) => ({
        code,
        ...config,
      })),
    });
  });

  // Sync a user to VirtFusion (create VirtFusion account if needed)
  router.post("/users/:auth0UserId/sync-virtfusion", async (req: Request, res: Response) => {
    try {
      const { auth0UserId } = req.params;
      const session = req.adminSession!;

      // Check if user exists in our system
      const [wallet] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.auth0UserId, auth0UserId));

      if (!wallet) {
        return res.status(404).json({ error: "User not found in system" });
      }

      // Check if already synced
      const [existingMapping] = await db
        .select()
        .from(userMappings)
        .where(eq(userMappings.auth0UserId, auth0UserId));

      if (existingMapping) {
        return res.json({
          success: true,
          message: "User already synced to VirtFusion",
          virtFusionUserId: existingMapping.virtFusionUserId
        });
      }

      // Create VirtFusion user
      const userEmail = auth0UserId;
      const userName = userEmail.split('@')[0];

      const vfUser = await virtfusionClient.findOrCreateUser(userEmail, userName);
      if (!vfUser) {
        return res.status(500).json({ error: "Failed to create VirtFusion user" });
      }

      // Create the mapping
      await db
        .insert(userMappings)
        .values({
          auth0UserId,
          email: userEmail,
          virtFusionUserId: vfUser.id,
        });

      // Update wallet with VirtFusion user ID
      await db
        .update(wallets)
        .set({ virtFusionUserId: vfUser.id })
        .where(eq(wallets.auth0UserId, auth0UserId));

      console.log(`[admin-servers] ${session.email} synced user ${auth0UserId} to VirtFusion (ID: ${vfUser.id})`);

      res.json({
        success: true,
        message: "User synced to VirtFusion successfully",
        virtFusionUserId: vfUser.id
      });
    } catch (error: any) {
      console.log(`[admin-servers] Sync to VirtFusion error: ${error.message}`);
      res.status(500).json({ error: "Failed to sync user to VirtFusion" });
    }
  });

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

        // If name is not set, try to get from Auth0
        if (owner && !owner.name) {
          try {
            const auth0User = await auth0Client.getUserById(billing.auth0UserId);
            if (auth0User?.name) {
              owner.name = auth0User.name;
            }
          } catch (err) {
            // Auth0 lookup failed, continue with null name
          }
        }

        // If no mapping found but we have auth0UserId, try Auth0 directly
        if (!owner) {
          try {
            const auth0User = await auth0Client.getUserById(billing.auth0UserId);
            if (auth0User) {
              owner = {
                email: auth0User.email,
                name: auth0User.name || null,
                auth0UserId: billing.auth0UserId,
              };
            }
          } catch (err) {
            // Auth0 lookup failed
          }
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

  // Install/Reinstall OS on server
  router.post("/servers/:serverId/install-os", async (req: Request, res: Response) => {
    try {
      const serverId = parseInt(req.params.serverId, 10);
      const { osId, hostname, sendCredentials = true } = req.body;
      const session = req.adminSession!;

      if (isNaN(serverId)) {
        return res.status(400).json({ error: "Invalid server ID" });
      }

      if (!osId || typeof osId !== "number") {
        return res.status(400).json({ error: "osId is required" });
      }

      console.log(`[admin-servers] Installing OS ${osId} on server ${serverId} by ${session.email}`);

      // Get server details first to find the owner
      const server = await virtfusionClient.getServer(String(serverId));
      if (!server) {
        return res.status(404).json({ error: "Server not found" });
      }

      // Reinstall the OS
      const result = await virtfusionClient.reinstallServer(String(serverId), osId, hostname);

      console.log(`[admin-servers] OS installation initiated: ${JSON.stringify(result)}`);

      // Try to get owner email for credentials
      if (sendCredentials && result.password) {
        // Look up the billing record to get the user
        const [billing] = await db
          .select()
          .from(serverBilling)
          .where(eq(serverBilling.virtfusionServerId, String(serverId)));

        if (billing) {
          const [userMapping] = await db
            .select()
            .from(userMappings)
            .where(eq(userMappings.auth0UserId, billing.auth0UserId));

          if (userMapping) {
            try {
              await sendServerCredentialsEmail(
                userMapping.email,
                hostname || server.name || `Server ${serverId}`,
                server.primaryIpAddress || result.primaryIp || "Same IP",
                "root",
                result.password,
                result.osName
              );
              console.log(`[admin-servers] Credentials email sent to ${userMapping.email}`);
            } catch (emailErr: any) {
              console.log(`[admin-servers] Failed to send credentials email: ${emailErr.message}`);
            }
          }
        }
      }

      await auditSuccess(req, "server.install-os", "server", String(serverId), { osId, hostname });

      res.json({
        success: true,
        password: result.password,
        osName: result.osName,
      });
    } catch (error: any) {
      console.log(`[admin-servers] Install OS error: ${error.message}`);
      await auditFailure(req, "server.install-os", "server", error.message, req.params.serverId);
      res.status(500).json({ error: error.message || "Failed to install OS" });
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

  // Delete server (creates cancellation request like client does)
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

      // Get server info from billing record
      const [billingRecord] = await db
        .select()
        .from(serverBilling)
        .where(eq(serverBilling.virtfusionServerId, String(serverId)));

      if (!billingRecord) {
        return res.status(404).json({ error: "Server not found in billing records" });
      }

      // Check for existing pending cancellation
      const [existingCancellation] = await db
        .select()
        .from(serverCancellations)
        .where(
          and(
            eq(serverCancellations.virtfusionServerId, String(serverId)),
            eq(serverCancellations.status, "pending")
          )
        );

      if (existingCancellation) {
        return res.status(400).json({ error: "Server already has a pending cancellation" });
      }

      // Get server name from VirtFusion
      let serverName = `Server ${serverId}`;
      try {
        const server = await virtfusionClient.getServer(String(serverId), false);
        if (server) {
          serverName = server.name;
        }
      } catch (e) {
        // Use default name if we can't fetch
      }

      // Create immediate cancellation (5 minutes from now)
      const scheduledDeletionAt = new Date();
      scheduledDeletionAt.setMinutes(scheduledDeletionAt.getMinutes() + 5);

      const [cancellation] = await db
        .insert(serverCancellations)
        .values({
          auth0UserId: billingRecord.auth0UserId,
          virtfusionServerId: String(serverId),
          serverName,
          reason: reason ? `Admin: ${reason}` : `Admin deletion by ${session.email}`,
          status: "pending",
          scheduledDeletionAt,
          mode: "immediate",
        })
        .returning();

      // Audit log
      await auditSuccess(req, "server.delete", "server", String(serverId), undefined, { reason });

      console.log(`[admin-servers] Cancellation created for server ${serverId} by ${session.email}, scheduled for ${scheduledDeletionAt.toISOString()}`);

      res.json({
        success: true,
        cancellation: {
          id: cancellation.id,
          scheduledDeletionAt: cancellation.scheduledDeletionAt,
          mode: cancellation.mode,
        }
      });
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

  // Admin provision server for a user
  router.post("/servers/provision", async (req: Request, res: Response) => {
    try {
      const session = req.adminSession!;
      const {
        auth0UserId,
        email,
        planId,
        hostname,
        osId,
        locationCode = "BNE",
        freeServer = false,
        sendCredentials = true,
        notes
      } = req.body;

      // Validate required fields
      if (!auth0UserId || typeof auth0UserId !== "string") {
        return res.status(400).json({ error: "auth0UserId is required" });
      }
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "email is required" });
      }
      if (!planId || typeof planId !== "number") {
        return res.status(400).json({ error: "planId is required" });
      }
      if (!hostname || typeof hostname !== "string" || hostname.length < 3) {
        return res.status(400).json({ error: "hostname must be at least 3 characters" });
      }

      // Validate hostname format
      const hostnameRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;
      if (!hostnameRegex.test(hostname)) {
        return res.status(400).json({ error: "Invalid hostname format" });
      }

      console.log(`[admin-servers] Provisioning server for ${auth0UserId}, plan ${planId}, hostname: ${hostname}`);

      // Look up user mapping
      let [userMapping] = await db
        .select()
        .from(userMappings)
        .where(eq(userMappings.auth0UserId, auth0UserId));

      // Auto-create VirtFusion user if mapping doesn't exist
      if (!userMapping) {
        console.log(`[admin-servers] No VirtFusion mapping for ${auth0UserId}, auto-creating...`);

        // Get user's wallet to verify they exist
        const [wallet] = await db
          .select()
          .from(wallets)
          .where(eq(wallets.auth0UserId, auth0UserId));

        if (!wallet) {
          return res.status(400).json({ error: "User not found in system" });
        }

        // Create VirtFusion user using the provided email
        const userEmail = email;
        const userName = userEmail.split('@')[0];

        const vfUser = await virtfusionClient.findOrCreateUser(userEmail, userName);
        if (!vfUser) {
          return res.status(500).json({ error: "Failed to create VirtFusion user. Please try again." });
        }

        // Create the mapping
        const [newMapping] = await db
          .insert(userMappings)
          .values({
            auth0UserId,
            email: userEmail,
            virtFusionUserId: vfUser.id,
          })
          .returning();

        // Update wallet with VirtFusion user ID
        await db
          .update(wallets)
          .set({ virtFusionUserId: vfUser.id })
          .where(eq(wallets.auth0UserId, auth0UserId));

        userMapping = newMapping;
        console.log(`[admin-servers] Auto-created VirtFusion user ${vfUser.id} for ${auth0UserId}`);
      }

      // Look up plan
      const [plan] = await db
        .select()
        .from(plans)
        .where(eq(plans.id, planId));

      if (!plan) {
        return res.status(400).json({ error: "Plan not found" });
      }

      if (!plan.virtfusionPackageId) {
        return res.status(400).json({ error: "Plan is not linked to a VirtFusion package" });
      }

      // Get hypervisor group for location
      const location = LOCATION_CONFIG[locationCode] || LOCATION_CONFIG['BNE'];
      if (!location) {
        return res.status(400).json({ error: "Invalid location" });
      }
      const hypervisorGroupId = location.hypervisorGroupId;

      // Get OS template name if osId provided
      let osName = "Linux";
      if (osId) {
        try {
          const templatesData = await virtfusionClient.getOsTemplatesForPackage(plan.virtfusionPackageId);
          const template = templatesData.templates?.find((t: any) => t.id === osId);
          if (template) {
            osName = template.name || template.distro || "Linux";
          }
        } catch (e) {
          console.log(`[admin-servers] Could not fetch OS template name: ${e}`);
        }
      }

      // extRelationId is the normalized email
      const extRelationId = userMapping.email.toLowerCase().trim();

      // Provision server via VirtFusion
      let serverResult;
      try {
        serverResult = await virtfusionClient.provisionServer({
          userId: userMapping.virtFusionUserId,
          packageId: plan.virtfusionPackageId,
          hostname,
          extRelationId,
          osId: osId || undefined,
          hypervisorGroupId,
        });
      } catch (vfError: any) {
        console.log(`[admin-servers] VirtFusion provisioning failed: ${vfError.message}`);
        await auditFailure(req, "server.provision", "server", vfError.message, auth0UserId);
        return res.status(500).json({ error: `VirtFusion error: ${vfError.message}` });
      }

      console.log(`[admin-servers] Server provisioned: ID=${serverResult.serverId}, IP=${serverResult.primaryIp}`);

      // Create billing record
      const now = new Date();
      const nextBillAt = new Date(now);
      nextBillAt.setMonth(nextBillAt.getMonth() + 1);

      const [billingRecord] = await db
        .insert(serverBilling)
        .values({
          auth0UserId,
          virtfusionServerId: String(serverResult.serverId),
          virtfusionServerUuid: serverResult.uuid || null,
          planId: plan.id,
          deployedAt: now,
          monthlyPriceCents: freeServer ? 0 : plan.priceMonthly,
          status: "active",
          autoRenew: true,
          nextBillAt,
          freeServer,
        })
        .returning();

      console.log(`[admin-servers] Billing record created: ${billingRecord.id}`);

      // Send credentials email if requested and password available
      if (sendCredentials && serverResult.password) {
        try {
          await sendServerCredentialsEmail(
            userMapping.email,
            hostname,
            serverResult.primaryIp || "Pending",
            "root",
            serverResult.password,
            osName
          );
          console.log(`[admin-servers] Credentials email sent to ${userMapping.email}`);
        } catch (emailErr: any) {
          console.log(`[admin-servers] Failed to send credentials email: ${emailErr.message}`);
          // Don't fail the request, just log
        }
      }

      // Audit log
      await auditSuccess(req, "server.provision", "server", String(serverResult.serverId), {
        auth0UserId,
        planId,
        hostname,
        freeServer,
        notes,
      });

      res.status(201).json({
        success: true,
        server: {
          id: serverResult.serverId,
          name: serverResult.name,
          uuid: serverResult.uuid,
          primaryIp: serverResult.primaryIp,
          password: serverResult.password,
          osName: serverResult.osName,
        },
        billing: billingRecord,
      });
    } catch (error: any) {
      console.log(`[admin-servers] Provision error: ${error.message}`);
      await auditFailure(req, "server.provision", "server", error.message);
      res.status(500).json({ error: "Failed to provision server" });
    }
  });
}
