import { Router, Request, Response } from "express";
import { db } from "../../server/db";
import {
  userMappings, wallets, walletTransactions, userFlags, sessions, twoFactorAuth,
  serverBilling, deployOrders, billingLedger, serverCancellations, invoices,
  tickets, ticketMessages, promoCodeUsage, passwordResetTokens, userAuditLogs
} from "../../shared/schema";
import { eq, desc, like, or, sql, inArray, gt, and, isNull } from "drizzle-orm";
import { dbStorage } from "../../server/storage";
import { auth0Client } from "../../server/auth0";
import { virtfusionClient } from "../../server/virtfusion";
import { getUncachableStripeClient } from "../../server/stripeClient";
import { auditSuccess, auditFailure } from "../utils/audit-log";

// SECURITY: Validate and sanitize reason strings to prevent DoS and injection
const MAX_REASON_LENGTH = 500;
function sanitizeReason(reason: unknown): string | undefined {
  if (reason === undefined || reason === null || reason === '') return undefined;
  if (typeof reason !== 'string') return undefined;
  // Trim and limit length
  return reason.trim().slice(0, MAX_REASON_LENGTH);
}

export function registerUsersRoutes(router: Router) {
  // List all users from Auth0 (paginated)
  router.get("/users", async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const perPage = Math.min(parseInt(req.query.perPage as string) || 50, 100);

      // Fetch users from Auth0 (0-indexed pages)
      const { users: auth0Users, total } = await auth0Client.listUsers(page - 1, perPage);

      // Enrich with local data (wallets, flags)
      const usersWithDetails = await Promise.all(
        auth0Users.map(async (user) => {
          const [wallet] = await db
            .select()
            .from(wallets)
            .where(eq(wallets.auth0UserId, user.user_id));

          const [flags] = await db
            .select()
            .from(userFlags)
            .where(eq(userFlags.auth0UserId, user.user_id));

          return {
            auth0UserId: user.user_id,
            email: user.email,
            name: user.name || null,
            // Auth0's email_verified (from their click on verification link)
            emailVerifiedAuth0: user.email_verified ?? false,
            // Admin override (manual verification)
            emailVerifiedOverride: flags?.emailVerifiedOverride ?? false,
            // Combined: user is considered verified if either is true
            emailVerified: (user.email_verified ?? false) || (flags?.emailVerifiedOverride ?? false),
            virtFusionUserId: user.app_metadata?.virtfusion_user_id || null,
            isAdmin: user.app_metadata?.is_admin || false,
            wallet: wallet || null,
            blocked: flags?.blocked || false,
            blockedReason: flags?.blockedReason || null,
            suspended: flags?.suspended || false,
            suspendedReason: flags?.suspendedReason || null,
          };
        })
      );

      res.json({
        users: usersWithDetails,
        pagination: {
          currentPage: page,
          perPage,
          total,
          totalPages: Math.ceil(total / perPage),
        },
      });
    } catch (error: any) {
      console.log(`[admin-users] List users error: ${error.message}`);
      res.status(500).json({ error: "Failed to list users" });
    }
  });

  // Search users in Auth0
  router.get("/users/search", async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string;
      if (!query || query.length < 2) {
        return res.status(400).json({ error: "Search query must be at least 2 characters" });
      }

      // Search in Auth0
      const auth0Users = await auth0Client.searchUsers(query, 50);

      // Enrich with local data
      const usersWithWallets = await Promise.all(
        auth0Users.map(async (user) => {
          const [wallet] = await db
            .select()
            .from(wallets)
            .where(eq(wallets.auth0UserId, user.user_id));

          const [flags] = await db
            .select()
            .from(userFlags)
            .where(eq(userFlags.auth0UserId, user.user_id));

          return {
            auth0UserId: user.user_id,
            email: user.email,
            name: user.name || null,
            // Auth0's email_verified (from their click on verification link)
            emailVerifiedAuth0: user.email_verified ?? false,
            // Admin override (manual verification)
            emailVerifiedOverride: flags?.emailVerifiedOverride ?? false,
            // Combined: user is considered verified if either is true
            emailVerified: (user.email_verified ?? false) || (flags?.emailVerifiedOverride ?? false),
            virtFusionUserId: user.app_metadata?.virtfusion_user_id || null,
            isAdmin: user.app_metadata?.is_admin || false,
            wallet: wallet || null,
            blocked: flags?.blocked || false,
            blockedReason: flags?.blockedReason || null,
            suspended: flags?.suspended || false,
            suspendedReason: flags?.suspendedReason || null,
          };
        })
      );

      res.json({ users: usersWithWallets });
    } catch (error: any) {
      console.log(`[admin-users] Search error: ${error.message}`);
      res.status(500).json({ error: "Failed to search users" });
    }
  });

  // Get user details (from Auth0 + local data)
  router.get("/users/:auth0UserId", async (req: Request, res: Response) => {
    try {
      const { auth0UserId } = req.params;

      // Get user from Auth0
      let auth0User;
      try {
        auth0User = await auth0Client.getUserById(auth0UserId);
      } catch (auth0Error: any) {
        console.log(`[admin-users] Auth0 API error: ${auth0Error.message}`);
        return res.status(503).json({ error: "Auth0 service unavailable. Please try again." });
      }

      if (!auth0User) {
        return res.status(404).json({ error: "User not found in Auth0" });
      }

      // Get local data
      const [wallet] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.auth0UserId, auth0UserId));

      const [flags] = await db
        .select()
        .from(userFlags)
        .where(eq(userFlags.auth0UserId, auth0UserId));

      const [tfa] = await db
        .select({ enabled: twoFactorAuth.enabled, verifiedAt: twoFactorAuth.verifiedAt })
        .from(twoFactorAuth)
        .where(eq(twoFactorAuth.auth0UserId, auth0UserId));

      // Get active sessions count
      const activeSessions = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sessions)
        .where(eq(sessions.auth0UserId, auth0UserId));

      res.json({
        user: {
          auth0UserId: auth0User.user_id,
          email: auth0User.email,
          name: auth0User.name || null,
          // Auth0's email_verified (from their click on verification link)
          emailVerifiedAuth0: auth0User.email_verified ?? false,
          // Admin override (manual verification)
          emailVerifiedOverride: flags?.emailVerifiedOverride ?? false,
          // Combined: user is considered verified if either is true
          emailVerified: (auth0User.email_verified ?? false) || (flags?.emailVerifiedOverride ?? false),
          virtFusionUserId: auth0User.app_metadata?.virtfusion_user_id || null,
          isAdmin: auth0User.app_metadata?.is_admin || false,
          wallet: wallet || null,
          blocked: flags?.blocked || false,
          blockedReason: flags?.blockedReason || null,
          suspended: flags?.suspended || false,
          suspendedReason: flags?.suspendedReason || null,
          suspendedAt: flags?.suspendedAt || null,
          twoFactorEnabled: tfa?.enabled || false,
          twoFactorVerifiedAt: tfa?.verifiedAt || null,
          activeSessions: activeSessions[0]?.count || 0,
        },
      });
    } catch (error: any) {
      console.log(`[admin-users] Get user error: ${error.message}`);
      res.status(500).json({ error: "Failed to get user" });
    }
  });

  // Get user transactions
  router.get("/users/:auth0UserId/transactions", async (req: Request, res: Response) => {
    try {
      const { auth0UserId } = req.params;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

      const transactions = await db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.auth0UserId, auth0UserId))
        .orderBy(desc(walletTransactions.createdAt))
        .limit(limit);

      res.json({ transactions });
    } catch (error: any) {
      console.log(`[admin-users] Get transactions error: ${error.message}`);
      res.status(500).json({ error: "Failed to get transactions" });
    }
  });

  // Block/unblock user
  router.post("/users/:auth0UserId/block", async (req: Request, res: Response) => {
    try {
      const { auth0UserId } = req.params;
      const { blocked } = req.body;
      const reason = sanitizeReason(req.body.reason);
      const session = req.adminSession!;

      if (typeof blocked !== "boolean") {
        return res.status(400).json({ error: "blocked must be a boolean" });
      }

      // Check user exists in Auth0
      let auth0User;
      try {
        auth0User = await auth0Client.getUserById(auth0UserId);
      } catch (auth0Error: any) {
        console.log(`[admin-users] Auth0 API error: ${auth0Error.message}`);
        return res.status(503).json({ error: "Auth0 service unavailable. Please try again." });
      }

      if (!auth0User) {
        return res.status(404).json({ error: "User not found in Auth0" });
      }

      // Update or create user flags
      const [existing] = await db
        .select()
        .from(userFlags)
        .where(eq(userFlags.auth0UserId, auth0UserId));

      if (existing) {
        await db
          .update(userFlags)
          .set({
            blocked,
            blockedReason: blocked ? (reason || null) : null,
            blockedAt: blocked ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(eq(userFlags.auth0UserId, auth0UserId));
      } else {
        await db.insert(userFlags).values({
          auth0UserId,
          blocked,
          blockedReason: blocked ? (reason || null) : null,
          blockedAt: blocked ? new Date() : null,
        });
      }

      // Revoke all sessions if blocking (logs them out immediately)
      if (blocked) {
        await db
          .update(sessions)
          .set({ revokedAt: new Date(), revokedReason: "USER_BLOCKED" })
          .where(eq(sessions.auth0UserId, auth0UserId));
        console.log(`[admin-users] All sessions revoked for blocked user ${auth0User.email}`);
        // Note: Server suspension is a separate action - use the billing endpoints to suspend servers if needed
      }

      // Audit log
      await auditSuccess(req, blocked ? "user.block" : "user.unblock", "user", auth0UserId, auth0User.email, { blocked, reason });

      console.log(`[admin-users] User ${auth0User.email} ${blocked ? "blocked" : "unblocked"} by ${session.email}`);

      res.json({ success: true, blocked });
    } catch (error: any) {
      await auditFailure(req, "user.block", "user", error.message, req.params.auth0UserId);
      console.log(`[admin-users] Block user error: ${error.message}`);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // Suspend/unsuspend user account (can still login but cannot deploy or control servers)
  router.post("/users/:auth0UserId/suspend", async (req: Request, res: Response) => {
    try {
      const { auth0UserId } = req.params;
      const { suspended } = req.body;
      const reason = sanitizeReason(req.body.reason);
      const session = req.adminSession!;

      if (typeof suspended !== "boolean") {
        return res.status(400).json({ error: "suspended must be a boolean" });
      }

      // Check user exists in Auth0
      let auth0User;
      try {
        auth0User = await auth0Client.getUserById(auth0UserId);
      } catch (auth0Error: any) {
        console.log(`[admin-users] Auth0 API error while checking user: ${auth0Error.message}`);
        return res.status(503).json({ error: "Auth0 service unavailable. Please try again." });
      }

      if (!auth0User) {
        return res.status(404).json({ error: "User not found in Auth0" });
      }

      // Update or create user flags
      const [existing] = await db
        .select()
        .from(userFlags)
        .where(eq(userFlags.auth0UserId, auth0UserId));

      if (existing) {
        await db
          .update(userFlags)
          .set({
            suspended,
            suspendedReason: suspended ? (reason || null) : null,
            suspendedAt: suspended ? new Date() : null,
            suspendedBy: suspended ? session.auth0UserId : null,
            updatedAt: new Date(),
          })
          .where(eq(userFlags.auth0UserId, auth0UserId));
      } else {
        await db.insert(userFlags).values({
          auth0UserId,
          suspended,
          suspendedReason: suspended ? (reason || null) : null,
          suspendedAt: suspended ? new Date() : null,
          suspendedBy: suspended ? session.auth0UserId : null,
        });
      }

      // If suspending, power off all user's servers
      let poweredOffCount = 0;
      if (suspended) {
        const userServers = await db
          .select()
          .from(serverBilling)
          .where(eq(serverBilling.auth0UserId, auth0UserId));

        for (const server of userServers) {
          if (server.status !== 'cancelled') {
            try {
              // Power off the server
              await virtfusionClient.powerAction(server.virtfusionServerId, 'stop');
              poweredOffCount++;
              console.log(`[admin-users] Powered off server ${server.virtfusionServerId} for suspended user ${auth0User.email}`);
            } catch (err: any) {
              console.log(`[admin-users] Failed to power off server ${server.virtfusionServerId}: ${err.message}`);
            }
          }
        }
        if (poweredOffCount > 0) {
          console.log(`[admin-users] Powered off ${poweredOffCount} servers for suspended user ${auth0User.email}`);
        }
      }

      // Audit log
      await auditSuccess(req, suspended ? "user.suspend" : "user.unsuspend", "user", auth0UserId, auth0User.email, { suspended, reason, poweredOffCount });

      console.log(`[admin-users] User ${auth0User.email} account ${suspended ? "suspended" : "unsuspended"} by ${session.email}`);

      res.json({ success: true, suspended, poweredOffCount });
    } catch (error: any) {
      await auditFailure(req, "user.suspend", "user", error.message, req.params.auth0UserId);
      console.log(`[admin-users] Suspend user error: ${error.message}`);
      res.status(500).json({ error: "Failed to update user suspension" });
    }
  });

  // Verify email manually
  router.post("/users/:auth0UserId/verify-email", async (req: Request, res: Response) => {
    try {
      const { auth0UserId } = req.params;
      const session = req.adminSession!;

      // Check user exists in Auth0
      let auth0User;
      try {
        auth0User = await auth0Client.getUserById(auth0UserId);
      } catch (auth0Error: any) {
        console.log(`[admin-users] Auth0 API error: ${auth0Error.message}`);
        return res.status(503).json({ error: "Auth0 service unavailable. Please try again." });
      }

      if (!auth0User) {
        return res.status(404).json({ error: "User not found in Auth0" });
      }

      // Update or create user flags
      const [existing] = await db
        .select()
        .from(userFlags)
        .where(eq(userFlags.auth0UserId, auth0UserId));

      if (existing) {
        await db
          .update(userFlags)
          .set({
            emailVerifiedOverride: true,
            emailVerifiedOverrideAt: new Date(),
            emailVerifiedOverrideBy: session.auth0UserId,
            updatedAt: new Date(),
          })
          .where(eq(userFlags.auth0UserId, auth0UserId));
      } else {
        await db.insert(userFlags).values({
          auth0UserId,
          emailVerifiedOverride: true,
          emailVerifiedOverrideAt: new Date(),
          emailVerifiedOverrideBy: session.auth0UserId,
        });
      }

      // Audit log
      await auditSuccess(req, "user.verify-email", "user", auth0UserId, auth0User.email);

      console.log(`[admin-users] Email verified for ${auth0User.email} by ${session.email}`);

      res.json({ success: true });
    } catch (error: any) {
      await auditFailure(req, "user.verify-email", "user", error.message, req.params.auth0UserId);
      console.log(`[admin-users] Verify email error: ${error.message}`);
      res.status(500).json({ error: "Failed to verify email" });
    }
  });

  // Resend verification email
  router.post("/users/:auth0UserId/resend-verification", async (req: Request, res: Response) => {
    try {
      const { auth0UserId } = req.params;
      const session = req.adminSession!;

      // Check user exists in Auth0
      let auth0User;
      try {
        auth0User = await auth0Client.getUserById(auth0UserId);
      } catch (auth0Error: any) {
        console.log(`[admin-users] Auth0 API error: ${auth0Error.message}`);
        return res.status(503).json({ error: "Auth0 service unavailable. Please try again." });
      }

      if (!auth0User) {
        return res.status(404).json({ error: "User not found in Auth0" });
      }

      // Resend verification email via Auth0
      const result = await auth0Client.resendVerificationEmail(auth0UserId);

      if (!result.success) {
        return res.status(400).json({ error: result.error || "Failed to send verification email" });
      }

      // Audit log
      await auditSuccess(req, "user.resend-verification", "user", auth0UserId, auth0User.email);

      console.log(`[admin-users] Verification email resent for ${auth0User.email} by ${session.email}`);

      res.json({ success: true });
    } catch (error: any) {
      await auditFailure(req, "user.resend-verification", "user", error.message, req.params.auth0UserId);
      console.log(`[admin-users] Resend verification error: ${error.message}`);
      res.status(500).json({ error: "Failed to resend verification email" });
    }
  });

  // Adjust wallet balance
  router.post("/users/:auth0UserId/wallet/adjust", async (req: Request, res: Response) => {
    try {
      const { auth0UserId } = req.params;
      const { amountCents, description } = req.body;
      const reason = sanitizeReason(req.body.reason);
      const session = req.adminSession!;

      if (!amountCents || typeof amountCents !== "number") {
        return res.status(400).json({ error: "amountCents must be a number" });
      }

      if (!description) {
        return res.status(400).json({ error: "description is required" });
      }

      // Check user exists in Auth0
      let auth0User;
      try {
        auth0User = await auth0Client.getUserById(auth0UserId);
      } catch (auth0Error: any) {
        console.log(`[admin-users] Auth0 API error: ${auth0Error.message}`);
        return res.status(503).json({ error: "Auth0 service unavailable. Please try again." });
      }

      if (!auth0User) {
        return res.status(404).json({ error: "User not found in Auth0" });
      }

      // Get or create wallet
      let [wallet] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.auth0UserId, auth0UserId));

      if (!wallet) {
        [wallet] = await db
          .insert(wallets)
          .values({ auth0UserId, balanceCents: 0 })
          .returning();
      }

      // Create transaction
      const type = amountCents > 0 ? "adjustment_credit" : "adjustment_debit";
      await db.insert(walletTransactions).values({
        auth0UserId,
        type,
        amountCents,
        metadata: {
          description,
          reason,
          adjustedByUserId: session.auth0UserId,
        },
      });

      // Update wallet balance atomically
      const [updatedWallet] = await db
        .update(wallets)
        .set({ balanceCents: sql`${wallets.balanceCents} + ${amountCents}`, updatedAt: new Date() })
        .where(eq(wallets.auth0UserId, auth0UserId))
        .returning();
      const newBalance = updatedWallet.balanceCents;

      // Audit log
      await auditSuccess(req, "user.wallet-adjust", "user", auth0UserId, auth0User.email, { amountCents, description, reason, newBalance });

      console.log(`[admin-users] Wallet adjusted for ${auth0User.email}: ${amountCents} cents by ${session.email}`);

      res.json({ success: true, newBalance });
    } catch (error: any) {
      await auditFailure(req, "user.wallet-adjust", "user", error.message, req.params.auth0UserId);
      console.log(`[admin-users] Wallet adjust error: ${error.message}`);
      res.status(500).json({ error: "Failed to adjust wallet" });
    }
  });

  // Link user to VirtFusion
  router.post("/users/:auth0UserId/link-virtfusion", async (req: Request, res: Response) => {
    try {
      const { auth0UserId } = req.params;
      const { virtFusionUserId } = req.body;
      const session = req.adminSession!;

      if (!virtFusionUserId || typeof virtFusionUserId !== "number") {
        return res.status(400).json({ error: "virtFusionUserId must be a number" });
      }

      // Check user exists in Auth0
      let auth0User;
      try {
        auth0User = await auth0Client.getUserById(auth0UserId);
      } catch (auth0Error: any) {
        console.log(`[admin-users] Auth0 API error: ${auth0Error.message}`);
        return res.status(503).json({ error: "Auth0 service unavailable. Please try again." });
      }

      if (!auth0User) {
        return res.status(404).json({ error: "User not found in Auth0" });
      }

      // Verify VirtFusion user exists
      try {
        await virtfusionClient.getUser(virtFusionUserId);
      } catch {
        return res.status(400).json({ error: "VirtFusion user not found" });
      }

      // Update Auth0 app_metadata with VirtFusion user ID
      await auth0Client.setVirtFusionUserId(auth0UserId, virtFusionUserId);

      // Also update wallet if it exists
      await db
        .update(wallets)
        .set({ virtFusionUserId })
        .where(eq(wallets.auth0UserId, auth0UserId));

      // Audit log
      await auditSuccess(req, "user.link-virtfusion", "user", auth0UserId, auth0User.email, { virtFusionUserId });

      console.log(`[admin-users] User ${auth0User.email} linked to VirtFusion user ${virtFusionUserId} by ${session.email}`);

      res.json({ success: true });
    } catch (error: any) {
      await auditFailure(req, "user.link-virtfusion", "user", error.message, req.params.auth0UserId);
      console.log(`[admin-users] Link VirtFusion error: ${error.message}`);
      res.status(500).json({ error: "Failed to link VirtFusion user" });
    }
  });

  // Revoke all user sessions
  router.post("/users/:auth0UserId/revoke-sessions", async (req: Request, res: Response) => {
    try {
      const { auth0UserId } = req.params;
      const session = req.adminSession!;

      const result = await db
        .update(sessions)
        .set({ revokedAt: new Date(), revokedReason: "ADMIN_REVOKED" })
        .where(eq(sessions.auth0UserId, auth0UserId));

      // Audit log
      await auditSuccess(req, "user.revoke-sessions", "user", auth0UserId);

      console.log(`[admin-users] Sessions revoked for ${auth0UserId} by ${session.email}`);

      res.json({ success: true });
    } catch (error: any) {
      await auditFailure(req, "user.revoke-sessions", "user", error.message, req.params.auth0UserId);
      console.log(`[admin-users] Revoke sessions error: ${error.message}`);
      res.status(500).json({ error: "Failed to revoke sessions" });
    }
  });

  // GET /users/activity/sessions — list active sessions across all users
  router.get("/users/activity/sessions", async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const onlineOnly = req.query.onlineOnly === "true";

      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      const now = new Date();

      const conditions = [
        gt(sessions.expiresAt, now),
        isNull(sessions.revokedAt),
      ];

      if (onlineOnly) {
        // lastActiveAt is NULL for brand-new sessions that haven't hit the activity middleware yet
        // fall back to createdAt so those sessions still show as online
        conditions.push(
          or(
            gt(sessions.lastActiveAt, fifteenMinutesAgo),
            and(isNull(sessions.lastActiveAt), gt(sessions.createdAt, fifteenMinutesAgo))
          )
        );
      }

      const rows = await db
        .select({
          id: sessions.id,
          auth0UserId: sessions.auth0UserId,
          email: sessions.email,
          name: sessions.name,
          ipAddress: sessions.ipAddress,
          userAgent: sessions.userAgent,
          createdAt: sessions.createdAt,
          lastActiveAt: sessions.lastActiveAt,
          expiresAt: sessions.expiresAt,
        })
        .from(sessions)
        .where(and(...conditions))
        .orderBy(desc(sessions.lastActiveAt))
        .limit(limit);

      res.json({ sessions: rows });
    } catch (error: any) {
      console.log(`[admin-activity] Get sessions error: ${error.message}`);
      res.status(500).json({ error: "Failed to get sessions" });
    }
  });

  // DELETE /users/activity/sessions/:sessionId — revoke a single session
  router.delete("/users/activity/sessions/:sessionId", async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;

      await db
        .update(sessions)
        .set({ revokedAt: new Date(), revokedReason: "ADMIN_REVOKED" })
        .where(eq(sessions.id, sessionId));

      await auditSuccess(req, "session.revoke", "session", sessionId);

      console.log(`[admin-activity] Session ${sessionId} revoked by ${req.adminSession!.email}`);

      res.json({ success: true });
    } catch (error: any) {
      await auditFailure(req, "session.revoke", "session", error.message, req.params.sessionId);
      console.log(`[admin-activity] Revoke session error: ${error.message}`);
      res.status(500).json({ error: "Failed to revoke session" });
    }
  });

  // GET /users/activity/feed — recent user audit log entries across all users
  router.get("/users/activity/feed", async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
      const since = req.query.since as string | undefined;

      const conditions = [];
      if (since) {
        conditions.push(gt(userAuditLogs.createdAt, new Date(since)));
      }

      const rows = await db
        .select({
          id: userAuditLogs.id,
          auth0UserId: userAuditLogs.auth0UserId,
          email: userAuditLogs.email,
          action: userAuditLogs.action,
          targetType: userAuditLogs.targetType,
          targetId: userAuditLogs.targetId,
          details: userAuditLogs.details,
          ipAddress: userAuditLogs.ipAddress,
          createdAt: userAuditLogs.createdAt,
        })
        .from(userAuditLogs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(userAuditLogs.createdAt))
        .limit(limit);

      res.json({ events: rows });
    } catch (error: any) {
      console.log(`[admin-activity] Get feed error: ${error.message}`);
      res.status(500).json({ error: "Failed to get activity feed" });
    }
  });

  // List all wallets (with pagination)
  router.get("/wallets", async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;

      const walletsList = await db
        .select({
          wallet: wallets,
          user: {
            email: userMappings.email,
            name: userMappings.name,
          },
        })
        .from(wallets)
        .leftJoin(userMappings, eq(wallets.auth0UserId, userMappings.auth0UserId))
        .orderBy(desc(wallets.updatedAt))
        .limit(limit)
        .offset(offset);

      res.json({ wallets: walletsList });
    } catch (error: any) {
      console.log(`[admin-users] List wallets error: ${error.message}`);
      res.status(500).json({ error: "Failed to list wallets" });
    }
  });

  // Purge user - DANGEROUS: Completely removes user from all systems
  // Deletes: VirtFusion servers + user, Stripe customer, Auth0 account, all local database records
  router.post("/users/:auth0UserId/purge", async (req: Request, res: Response) => {
    try {
      const { auth0UserId } = req.params;
      const { confirm } = req.body;
      const adminSession = req.adminSession!;

      // Require explicit confirmation
      if (confirm !== "PURGE") {
        return res.status(400).json({
          error: "Confirmation required. Send { confirm: 'PURGE' } to confirm this destructive action."
        });
      }

      console.log(`[admin-users] Starting purge for ${auth0UserId} by ${adminSession.email}`);

      const results: {
        auth0Deleted: boolean;
        virtfusionUserDeleted: boolean;
        stripeCustomerDeleted: boolean;
        localRecordsDeleted: {
          sessions: number;
          userFlags: number;
          walletTransactions: number;
          wallets: number;
          deployOrders: number;
          serverBilling: number;
          billingLedger: number;
          serverCancellations: number;
          invoices: number;
          twoFactorAuth: number;
          ticketMessages: number;
          tickets: number;
          promoCodeUsage: number;
          passwordResetTokens: number;
          userMappings: number;
        };
        errors: string[];
      } = {
        auth0Deleted: false,
        virtfusionUserDeleted: false,
        stripeCustomerDeleted: false,
        localRecordsDeleted: {
          sessions: 0,
          userFlags: 0,
          walletTransactions: 0,
          wallets: 0,
          deployOrders: 0,
          serverBilling: 0,
          billingLedger: 0,
          serverCancellations: 0,
          invoices: 0,
          twoFactorAuth: 0,
          ticketMessages: 0,
          tickets: 0,
          promoCodeUsage: 0,
          passwordResetTokens: 0,
          userMappings: 0,
        },
        errors: [],
      };

      // 1. Get user info from Auth0 first (need VirtFusion ID and email for Stripe)
      let virtFusionUserId: number | null = null;
      let userEmail: string | null = null;
      try {
        const auth0User = await auth0Client.getUserById(auth0UserId);
        if (auth0User) {
          // Ensure virtFusionUserId is a number (Auth0 might return it as string)
          const vfId = auth0User.app_metadata?.virtfusion_user_id;
          virtFusionUserId = vfId ? (typeof vfId === 'number' ? vfId : parseInt(vfId, 10)) : null;
          if (virtFusionUserId !== null && isNaN(virtFusionUserId)) {
            virtFusionUserId = null;
          }
          userEmail = auth0User.email || null;
          console.log(`[admin-users] Found user: email=${userEmail}, virtFusionId=${virtFusionUserId}`);
        } else {
          console.log(`[admin-users] User ${auth0UserId} not found in Auth0, continuing with local cleanup`);
        }
      } catch (err: any) {
        console.log(`[admin-users] Failed to fetch Auth0 user: ${err.message}`);
        results.errors.push(`Auth0 fetch failed: ${err.message}`);
      }

      // 2. Check if VirtFusion user has active servers - block purge if they do
      if (virtFusionUserId) {
        try {
          const serverCheck = await virtfusionClient.userHasActiveServers(virtFusionUserId);
          if (serverCheck.hasServers) {
            console.log(`[admin-users] Purge blocked - user has ${serverCheck.serverCount} active servers`);
            return res.status(400).json({
              error: `Cannot purge user - they have ${serverCheck.serverCount} active server(s) in VirtFusion. Delete the servers first before purging the user.`,
              servers: serverCheck.servers,
            });
          }
        } catch (err: any) {
          console.log(`[admin-users] Failed to check VirtFusion servers: ${err.message}`);
          // Allow purge to continue if check fails - servers may already be deleted
        }
      }

      // 3. Delete VirtFusion user (servers should already be deleted)
      if (virtFusionUserId) {
        try {
          console.log(`[admin-users] Attempting to delete VirtFusion user ID: ${virtFusionUserId} (type: ${typeof virtFusionUserId})`);
          const userDeleted = await virtfusionClient.deleteUserById(virtFusionUserId);
          results.virtfusionUserDeleted = userDeleted;
          if (!userDeleted) {
            results.errors.push(`Failed to delete VirtFusion user ${virtFusionUserId}`);
          }
          console.log(`[admin-users] VirtFusion user deletion: success=${userDeleted}`);
        } catch (err: any) {
          console.log(`[admin-users] VirtFusion user deletion failed: ${err.message}`);
          console.log(`[admin-users] VirtFusion user deletion error stack: ${err.stack}`);
          results.errors.push(`VirtFusion user deletion failed: ${err.message}`);
        }
      } else {
        console.log(`[admin-users] No VirtFusion user ID found for ${auth0UserId}, skipping VirtFusion deletion`);
      }

      // 4. Delete Stripe customer
      try {
        const [wallet] = await db.select().from(wallets).where(eq(wallets.auth0UserId, auth0UserId));
        if (wallet?.stripeCustomerId) {
          const stripe = await getUncachableStripeClient();
          try {
            await stripe.customers.del(wallet.stripeCustomerId);
            results.stripeCustomerDeleted = true;
            console.log(`[admin-users] Stripe customer ${wallet.stripeCustomerId} deleted`);
          } catch (stripeErr: any) {
            if (stripeErr.code === 'resource_missing') {
              console.log(`[admin-users] Stripe customer already deleted`);
              results.stripeCustomerDeleted = true; // Already gone
            } else {
              throw stripeErr;
            }
          }
        }
      } catch (err: any) {
        console.log(`[admin-users] Stripe deletion failed: ${err.message}`);
        results.errors.push(`Stripe deletion failed: ${err.message}`);
      }

      // 5. Delete Auth0 account
      try {
        const auth0Result = await auth0Client.deleteUser(auth0UserId);
        if (auth0Result.success) {
          results.auth0Deleted = true;
          console.log(`[admin-users] Auth0 user ${auth0UserId} deleted`);
        } else if (auth0Result.error?.includes('404') || auth0Result.error?.includes('not found')) {
          console.log(`[admin-users] Auth0 user already deleted`);
          results.auth0Deleted = true; // Already gone
        } else {
          console.log(`[admin-users] Auth0 deletion failed: ${auth0Result.error}`);
          results.errors.push(`Auth0 deletion failed: ${auth0Result.error}`);
        }
      } catch (err: any) {
        console.log(`[admin-users] Auth0 deletion error: ${err.message}`);
        results.errors.push(`Auth0 deletion error: ${err.message}`);
      }

      // 6. Delete local database records (order matters for foreign key constraints)
      try {
        // Get ticket IDs for this user first (for ticket messages)
        const userTickets = await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.auth0UserId, auth0UserId));
        const ticketIds = userTickets.map(t => t.id);

        // Delete ticket messages for user's tickets
        if (ticketIds.length > 0) {
          const ticketMsgResult = await db.delete(ticketMessages).where(inArray(ticketMessages.ticketId, ticketIds));
          results.localRecordsDeleted.ticketMessages = ticketMsgResult.rowCount || 0;
        }

        // Delete records in order (children before parents)
        const deleteResults = await Promise.all([
          db.delete(sessions).where(eq(sessions.auth0UserId, auth0UserId)),
          db.delete(billingLedger).where(eq(billingLedger.auth0UserId, auth0UserId)),
          db.delete(serverCancellations).where(eq(serverCancellations.auth0UserId, auth0UserId)),
          db.delete(invoices).where(eq(invoices.auth0UserId, auth0UserId)),
          db.delete(promoCodeUsage).where(eq(promoCodeUsage.auth0UserId, auth0UserId)),
          db.delete(twoFactorAuth).where(eq(twoFactorAuth.auth0UserId, auth0UserId)),
          db.delete(tickets).where(eq(tickets.auth0UserId, auth0UserId)),
          db.delete(deployOrders).where(eq(deployOrders.auth0UserId, auth0UserId)),
          db.delete(serverBilling).where(eq(serverBilling.auth0UserId, auth0UserId)),
          db.delete(walletTransactions).where(eq(walletTransactions.auth0UserId, auth0UserId)),
          db.delete(userFlags).where(eq(userFlags.auth0UserId, auth0UserId)),
        ]);

        results.localRecordsDeleted.sessions = deleteResults[0].rowCount || 0;
        results.localRecordsDeleted.billingLedger = deleteResults[1].rowCount || 0;
        results.localRecordsDeleted.serverCancellations = deleteResults[2].rowCount || 0;
        results.localRecordsDeleted.invoices = deleteResults[3].rowCount || 0;
        results.localRecordsDeleted.promoCodeUsage = deleteResults[4].rowCount || 0;
        results.localRecordsDeleted.twoFactorAuth = deleteResults[5].rowCount || 0;
        results.localRecordsDeleted.tickets = deleteResults[6].rowCount || 0;
        results.localRecordsDeleted.deployOrders = deleteResults[7].rowCount || 0;
        results.localRecordsDeleted.serverBilling = deleteResults[8].rowCount || 0;
        results.localRecordsDeleted.walletTransactions = deleteResults[9].rowCount || 0;
        results.localRecordsDeleted.userFlags = deleteResults[10].rowCount || 0;

        // Delete wallet last (after transactions)
        const walletResult = await db.delete(wallets).where(eq(wallets.auth0UserId, auth0UserId));
        results.localRecordsDeleted.wallets = walletResult.rowCount || 0;

        // Delete user mapping
        const userMappingResult = await db.delete(userMappings).where(eq(userMappings.auth0UserId, auth0UserId));
        results.localRecordsDeleted.userMappings = userMappingResult.rowCount || 0;

        // Delete password reset tokens by email if we have it
        if (userEmail) {
          const resetResult = await db.delete(passwordResetTokens).where(eq(passwordResetTokens.email, userEmail));
          results.localRecordsDeleted.passwordResetTokens = resetResult.rowCount || 0;
        }

        console.log(`[admin-users] Local database cleanup complete:`, results.localRecordsDeleted);
      } catch (err: any) {
        console.log(`[admin-users] Database cleanup failed: ${err.message}`);
        results.errors.push(`Database cleanup failed: ${err.message}`);
      }

      // Audit log
      await auditSuccess(req, "user.purge", "user", auth0UserId, userEmail || auth0UserId, {
        virtfusionUserDeleted: results.virtfusionUserDeleted,
        stripeDeleted: results.stripeCustomerDeleted,
        auth0Deleted: results.auth0Deleted,
      });

      console.log(`[admin-users] Purge complete for ${auth0UserId} by ${adminSession.email}:`, results);

      res.json({
        success: results.errors.length === 0,
        results,
      });
    } catch (error: any) {
      await auditFailure(req, "user.purge", "user", error.message, req.params.auth0UserId);
      console.log(`[admin-users] Purge error: ${error.message}`);
      // SECURITY: Don't expose internal error details
      res.status(500).json({ error: "Failed to purge user. Please check server logs for details." });
    }
  });
}
