import { Router, Request, Response } from "express";
import { db } from "../../server/db";
import { userMappings, wallets, walletTransactions, userFlags, sessions, twoFactorAuth, serverBilling } from "../../shared/schema";
import { eq, desc, like, or, sql } from "drizzle-orm";
import { dbStorage } from "../../server/storage";
import { auth0Client } from "../../server/auth0";
import { virtfusionClient } from "../../server/virtfusion";
import { auditSuccess, auditFailure } from "../utils/audit-log";

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
      const auth0User = await auth0Client.getUserById(auth0UserId);
      if (!auth0User) {
        return res.status(404).json({ error: "User not found" });
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
      const { blocked, reason } = req.body;
      const session = req.adminSession!;

      if (typeof blocked !== "boolean") {
        return res.status(400).json({ error: "blocked must be a boolean" });
      }

      // Check user exists in Auth0
      const auth0User = await auth0Client.getUserById(auth0UserId);
      if (!auth0User) {
        return res.status(404).json({ error: "User not found" });
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
      const { suspended, reason } = req.body;
      const session = req.adminSession!;

      if (typeof suspended !== "boolean") {
        return res.status(400).json({ error: "suspended must be a boolean" });
      }

      // Check user exists in Auth0
      const auth0User = await auth0Client.getUserById(auth0UserId);
      if (!auth0User) {
        return res.status(404).json({ error: "User not found" });
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
      const auth0User = await auth0Client.getUserById(auth0UserId);
      if (!auth0User) {
        return res.status(404).json({ error: "User not found" });
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
      const auth0User = await auth0Client.getUserById(auth0UserId);
      if (!auth0User) {
        return res.status(404).json({ error: "User not found" });
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
      const { amountCents, description, reason } = req.body;
      const session = req.adminSession!;

      if (!amountCents || typeof amountCents !== "number") {
        return res.status(400).json({ error: "amountCents must be a number" });
      }

      if (!description) {
        return res.status(400).json({ error: "description is required" });
      }

      // Check user exists in Auth0
      const auth0User = await auth0Client.getUserById(auth0UserId);
      if (!auth0User) {
        return res.status(404).json({ error: "User not found" });
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
          adjustedBy: session.email,
          adjustedByUserId: session.auth0UserId,
        },
      });

      // Update wallet balance
      const newBalance = wallet.balanceCents + amountCents;
      await db
        .update(wallets)
        .set({ balanceCents: newBalance, updatedAt: new Date() })
        .where(eq(wallets.auth0UserId, auth0UserId));

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
      const auth0User = await auth0Client.getUserById(auth0UserId);
      if (!auth0User) {
        return res.status(404).json({ error: "User not found" });
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
}
