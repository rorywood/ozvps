import { randomBytes } from "crypto";
import { SessionRevokeReason, plans, wallets, walletTransactions, deployOrders, serverCancellations, serverBilling, securitySettings, adminAuditLogs, invoices, tickets, ticketMessages, twoFactorAuth, passwordResetTokens, emailVerificationTokens, promoCodes, promoCodeUsage, userFlags as userFlagsTable, loginAttempts, accountLockouts, userAuditLogs, type Plan, type InsertPlan, type Wallet, type InsertWallet, type WalletTransaction, type InsertWalletTransaction, type DeployOrder, type InsertDeployOrder, type ServerCancellation, type InsertServerCancellation, type ServerBilling, type InsertServerBilling, type SecuritySetting, type AdminAuditLog, type InsertAdminAuditLog, type Invoice, type InsertInvoice, type Ticket, type InsertTicket, type TicketMessage, type InsertTicketMessage, type TicketStatus, type TicketPriority, type TicketCategory, type TwoFactorAuth, type InsertTwoFactorAuth, type PasswordResetToken, type InsertPasswordResetToken, type EmailVerificationToken, type InsertEmailVerificationToken, type PromoCode, type InsertPromoCode, type PromoCodeUsage, type InsertPromoCodeUsage, type LoginAttempt, type AccountLockout, type UserAuditLog } from "@shared/schema";
import { log } from './log';
import { STATIC_PLANS } from "@shared/plans";
import { db } from "./db";
import { eq, desc, and, sql, inArray, or, isNull, ne } from "drizzle-orm";

export interface Session {
  id: string;
  userId?: number | null;
  auth0UserId?: string | null;
  virtFusionUserId?: number | null;
  extRelationId?: string | null;
  email: string;
  name?: string | null;
  isAdmin?: boolean;
  emailVerified?: boolean;
  expiresAt: Date;
  revokedAt?: Date | null;
  revokedReason?: string | null;
  lastActivityAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface UserFlags {
  auth0UserId: string;
  // Blocked = user cannot log in at all
  blocked: boolean;
  blockedReason?: string | null;
  blockedAt?: Date | null;
  // Suspended = user can log in but cannot deploy or control servers
  suspended?: boolean;
  suspendedReason?: string | null;
  suspendedAt?: Date | null;
  suspendedBy?: string | null;
  // Admin email verification override - bypasses Auth0's email_verified
  emailVerifiedOverride?: boolean;
  emailVerifiedOverrideAt?: Date | null;
  emailVerifiedOverrideBy?: string | null;
}

export interface IStorage {
  createSession(data: {
    visitorId?: number;
    auth0UserId?: string;
    virtFusionUserId?: number;
    extRelationId?: string;
    email: string;
    name?: string;
    isAdmin?: boolean;
    emailVerified?: boolean;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<Session>;
  getSession(id: string): Promise<Session | undefined>;
  deleteSession(id: string): Promise<void>;
  deleteUserSessions(userId: number): Promise<void>;
  deleteSessionsByAuth0UserId(auth0UserId: string): Promise<void>;
  revokeSessionsByAuth0UserId(auth0UserId: string, reason: SessionRevokeReason, excludeSessionId?: string): Promise<void>;
  hasActiveSession(auth0UserId: string, idleTimeoutMs: number): Promise<boolean>;
  revokeIdleSessions(auth0UserId: string, idleTimeoutMs: number, reason: SessionRevokeReason): Promise<void>;
  updateSessionActivity(sessionId: string): Promise<void>;
  updateSession(sessionId: string, updates: Partial<Pick<Session, 'isAdmin' | 'name' | 'emailVerified'>>): Promise<void>;
  getUserFlags(auth0UserId: string): Promise<UserFlags | undefined>;
  setUserBlocked(auth0UserId: string, blocked: boolean, reason?: string): Promise<void>;
  setEmailVerifiedOverride(auth0UserId: string, verified: boolean, adminEmail: string): Promise<void>;
  getEmailVerifiedOverride(auth0UserId: string): Promise<boolean>;
}

export class MemoryStorage implements IStorage {
  private sessions: Map<string, Session> = new Map();
  private userFlagsMap: Map<string, UserFlags> = new Map();

  async createSession(data: {
    visitorId?: number;
    auth0UserId?: string;
    virtFusionUserId?: number;
    extRelationId?: string;
    email: string;
    name?: string;
    isAdmin?: boolean;
    emailVerified?: boolean;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<Session> {
    const id = randomBytes(32).toString("hex");
    const now = new Date();
    const session: Session = {
      id,
      userId: data.visitorId || null,
      auth0UserId: data.auth0UserId || null,
      virtFusionUserId: data.virtFusionUserId || null,
      extRelationId: data.extRelationId || null,
      email: data.email,
      name: data.name || null,
      isAdmin: data.isAdmin || false,
      emailVerified: data.emailVerified ?? false,
      expiresAt: data.expiresAt,
      revokedAt: null,
      revokedReason: null,
      lastActivityAt: now,
      ipAddress: data.ipAddress || null,
      userAgent: data.userAgent || null,
    };
    this.sessions.set(id, session);
    return session;
  }

  async getSession(id: string): Promise<Session | undefined> {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    
    if (new Date(session.expiresAt) < new Date()) {
      this.sessions.delete(id);
      return undefined;
    }
    
    if (session.revokedAt) {
      return session;
    }
    
    return session;
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async deleteUserSessions(userId: number): Promise<void> {
    const idsToDelete: string[] = [];
    this.sessions.forEach((session, id) => {
      if (session.userId === userId) {
        idsToDelete.push(id);
      }
    });
    idsToDelete.forEach(id => this.sessions.delete(id));
  }

  async deleteSessionsByAuth0UserId(auth0UserId: string): Promise<void> {
    const idsToDelete: string[] = [];
    this.sessions.forEach((session, id) => {
      if (session.auth0UserId === auth0UserId) {
        idsToDelete.push(id);
      }
    });
    idsToDelete.forEach(id => this.sessions.delete(id));
  }

  async revokeSessionsByAuth0UserId(auth0UserId: string, reason: SessionRevokeReason, excludeSessionId?: string): Promise<void> {
    this.sessions.forEach((session, sessionId) => {
      if (session.auth0UserId === auth0UserId && !session.revokedAt && sessionId !== excludeSessionId) {
        session.revokedAt = new Date();
        session.revokedReason = reason;
      }
    });
  }

  async hasActiveSession(auth0UserId: string, idleTimeoutMs: number): Promise<boolean> {
    const now = new Date();
    for (const session of Array.from(this.sessions.values())) {
      if (
        session.auth0UserId === auth0UserId &&
        !session.revokedAt &&
        new Date(session.expiresAt) > now
      ) {
        const lastActivity = new Date(session.lastActivityAt);
        const idleTime = now.getTime() - lastActivity.getTime();
        if (idleTime <= idleTimeoutMs) {
          return true;
        }
      }
    }
    return false;
  }

  async revokeIdleSessions(auth0UserId: string, idleTimeoutMs: number, reason: SessionRevokeReason): Promise<void> {
    const now = new Date();
    this.sessions.forEach((session) => {
      if (
        session.auth0UserId === auth0UserId &&
        !session.revokedAt &&
        new Date(session.expiresAt) > now
      ) {
        const lastActivity = new Date(session.lastActivityAt);
        const idleTime = now.getTime() - lastActivity.getTime();
        if (idleTime > idleTimeoutMs) {
          session.revokedAt = now;
          session.revokedReason = reason;
        }
      }
    });
  }

  async updateSessionActivity(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivityAt = new Date();
    }
  }

  async updateSession(sessionId: string, updates: Partial<Pick<Session, 'isAdmin' | 'name' | 'emailVerified'>>): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (updates.isAdmin !== undefined) {
        session.isAdmin = updates.isAdmin;
      }
      if (updates.name !== undefined) {
        session.name = updates.name;
      }
      if (updates.emailVerified !== undefined) {
        session.emailVerified = updates.emailVerified;
      }
    }
  }

  async getUserFlags(auth0UserId: string): Promise<UserFlags | undefined> {
    return this.userFlagsMap.get(auth0UserId);
  }

  async setUserBlocked(auth0UserId: string, blocked: boolean, reason?: string): Promise<void> {
    const existing = this.userFlagsMap.get(auth0UserId);
    if (existing) {
      existing.blocked = blocked;
      existing.blockedReason = blocked ? (reason || null) : null;
      existing.blockedAt = blocked ? new Date() : null;
    } else {
      this.userFlagsMap.set(auth0UserId, {
        auth0UserId,
        blocked,
        blockedReason: blocked ? (reason || null) : null,
        blockedAt: blocked ? new Date() : null,
      });
    }
  }

  async setEmailVerifiedOverride(auth0UserId: string, verified: boolean, adminEmail: string): Promise<void> {
    const existing = this.userFlagsMap.get(auth0UserId);
    if (existing) {
      existing.emailVerifiedOverride = verified;
      existing.emailVerifiedOverrideAt = verified ? new Date() : null;
      existing.emailVerifiedOverrideBy = verified ? adminEmail : null;
    } else {
      this.userFlagsMap.set(auth0UserId, {
        auth0UserId,
        blocked: false,
        emailVerifiedOverride: verified,
        emailVerifiedOverrideAt: verified ? new Date() : null,
        emailVerifiedOverrideBy: verified ? adminEmail : null,
      });
    }
  }

  async getEmailVerifiedOverride(auth0UserId: string): Promise<boolean> {
    const flags = this.userFlagsMap.get(auth0UserId);
    return flags?.emailVerifiedOverride ?? false;
  }
}

// Redis-backed session storage
export class RedisStorage implements IStorage {
  private redisClient: any;
  private memoryFallback: MemoryStorage;

  constructor(redisClient: any) {
    this.redisClient = redisClient;
    this.memoryFallback = new MemoryStorage();
  }

  private isRedisAvailable(): boolean {
    return this.redisClient?.isOpen === true;
  }

  private sessionKey(id: string): string {
    return `session:${id}`;
  }

  private userSessionsKey(auth0UserId: string): string {
    return `user_sessions:${auth0UserId}`;
  }

  private userFlagsKey(auth0UserId: string): string {
    return `user_flags:${auth0UserId}`;
  }

  async createSession(data: {
    visitorId?: number;
    auth0UserId?: string;
    virtFusionUserId?: number;
    extRelationId?: string;
    email: string;
    name?: string;
    isAdmin?: boolean;
    emailVerified?: boolean;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<Session> {
    const id = randomBytes(32).toString("hex");
    const now = new Date();
    const session: Session = {
      id,
      userId: data.visitorId || null,
      auth0UserId: data.auth0UserId || null,
      virtFusionUserId: data.virtFusionUserId || null,
      extRelationId: data.extRelationId || null,
      email: data.email,
      name: data.name || null,
      isAdmin: data.isAdmin || false,
      emailVerified: data.emailVerified ?? false,
      expiresAt: data.expiresAt,
      revokedAt: null,
      revokedReason: null,
      lastActivityAt: now,
      ipAddress: data.ipAddress || null,
      userAgent: data.userAgent || null,
    };

    if (!this.isRedisAvailable()) {
      return this.memoryFallback.createSession(data);
    }

    try {
      const ttlSeconds = Math.ceil((data.expiresAt.getTime() - now.getTime()) / 1000);
      await this.redisClient.setEx(
        this.sessionKey(id),
        ttlSeconds,
        JSON.stringify(session)
      );

      // Track user sessions for bulk operations
      if (data.auth0UserId) {
        await this.redisClient.sAdd(this.userSessionsKey(data.auth0UserId), id);
        await this.redisClient.expire(this.userSessionsKey(data.auth0UserId), ttlSeconds);
      }

      return session;
    } catch (error: any) {
      log(`Redis error in createSession: ${error.message}`, 'storage');
      return this.memoryFallback.createSession(data);
    }
  }

  async getSession(id: string): Promise<Session | undefined> {
    if (!this.isRedisAvailable()) {
      return this.memoryFallback.getSession(id);
    }

    try {
      const data = await this.redisClient.get(this.sessionKey(id));
      if (!data) return undefined;

      const session: Session = JSON.parse(data);

      // Convert date strings back to Date objects
      session.expiresAt = new Date(session.expiresAt);
      session.lastActivityAt = new Date(session.lastActivityAt);
      if (session.revokedAt) {
        session.revokedAt = new Date(session.revokedAt);
      }

      // Check if expired
      if (session.expiresAt < new Date()) {
        await this.deleteSession(id);
        return undefined;
      }

      return session;
    } catch (error: any) {
      log(`Redis error in getSession: ${error.message}`, 'storage');
      return this.memoryFallback.getSession(id);
    }
  }

  async deleteSession(id: string): Promise<void> {
    if (!this.isRedisAvailable()) {
      return this.memoryFallback.deleteSession(id);
    }

    try {
      // Get session to find user ID for cleanup
      const session = await this.getSession(id);
      if (session?.auth0UserId) {
        await this.redisClient.sRem(this.userSessionsKey(session.auth0UserId), id);
      }
      await this.redisClient.del(this.sessionKey(id));
    } catch (error: any) {
      log(`Redis error in deleteSession: ${error.message}`, 'storage');
      return this.memoryFallback.deleteSession(id);
    }
  }

  async deleteUserSessions(userId: number): Promise<void> {
    if (!this.isRedisAvailable()) {
      return this.memoryFallback.deleteUserSessions(userId);
    }

    try {
      // Note: Redis implementation tracks by auth0UserId, not userId
      // This method is kept for interface compatibility but may not find sessions
      log(`deleteUserSessions called with userId ${userId} - Redis tracks by auth0UserId`, 'storage');
    } catch (error: any) {
      log(`Redis error in deleteUserSessions: ${error.message}`, 'storage');
      return this.memoryFallback.deleteUserSessions(userId);
    }
  }

  async deleteSessionsByAuth0UserId(auth0UserId: string): Promise<void> {
    if (!this.isRedisAvailable()) {
      return this.memoryFallback.deleteSessionsByAuth0UserId(auth0UserId);
    }

    try {
      const sessionIds = await this.redisClient.sMembers(this.userSessionsKey(auth0UserId));
      if (sessionIds.length > 0) {
        const keys = sessionIds.map((id: string) => this.sessionKey(id));
        await this.redisClient.del(keys);
        await this.redisClient.del(this.userSessionsKey(auth0UserId));
      }
    } catch (error: any) {
      log(`Redis error in deleteSessionsByAuth0UserId: ${error.message}`, 'storage');
      return this.memoryFallback.deleteSessionsByAuth0UserId(auth0UserId);
    }
  }

  async revokeSessionsByAuth0UserId(auth0UserId: string, reason: SessionRevokeReason, excludeSessionId?: string): Promise<void> {
    if (!this.isRedisAvailable()) {
      return this.memoryFallback.revokeSessionsByAuth0UserId(auth0UserId, reason, excludeSessionId);
    }

    try {
      const sessionIds = await this.redisClient.sMembers(this.userSessionsKey(auth0UserId));
      const now = new Date();

      for (const id of sessionIds) {
        // Skip the excluded session (e.g., current session during password change)
        if (id === excludeSessionId) continue;

        const session = await this.getSession(id);
        if (session && !session.revokedAt) {
          session.revokedAt = now;
          session.revokedReason = reason;
          const ttlSeconds = Math.ceil((session.expiresAt.getTime() - now.getTime()) / 1000);
          if (ttlSeconds > 0) {
            await this.redisClient.setEx(
              this.sessionKey(id),
              ttlSeconds,
              JSON.stringify(session)
            );
          }
        }
      }
    } catch (error: any) {
      log(`Redis error in revokeSessionsByAuth0UserId: ${error.message}`, 'storage');
      return this.memoryFallback.revokeSessionsByAuth0UserId(auth0UserId, reason, excludeSessionId);
    }
  }

  async hasActiveSession(auth0UserId: string, idleTimeoutMs: number): Promise<boolean> {
    if (!this.isRedisAvailable()) {
      return this.memoryFallback.hasActiveSession(auth0UserId, idleTimeoutMs);
    }

    try {
      const sessionIds = await this.redisClient.sMembers(this.userSessionsKey(auth0UserId));
      const now = new Date();

      for (const id of sessionIds) {
        const session = await this.getSession(id);
        if (
          session &&
          !session.revokedAt &&
          new Date(session.expiresAt) > now
        ) {
          const lastActivity = new Date(session.lastActivityAt);
          const idleTime = now.getTime() - lastActivity.getTime();
          if (idleTime <= idleTimeoutMs) {
            return true;
          }
        }
      }
      return false;
    } catch (error: any) {
      log(`Redis error in hasActiveSession: ${error.message}`, 'storage');
      return this.memoryFallback.hasActiveSession(auth0UserId, idleTimeoutMs);
    }
  }

  async revokeIdleSessions(auth0UserId: string, idleTimeoutMs: number, reason: SessionRevokeReason): Promise<void> {
    if (!this.isRedisAvailable()) {
      return this.memoryFallback.revokeIdleSessions(auth0UserId, idleTimeoutMs, reason);
    }

    try {
      const sessionIds = await this.redisClient.sMembers(this.userSessionsKey(auth0UserId));
      const now = new Date();

      for (const id of sessionIds) {
        const session = await this.getSession(id);
        if (
          session &&
          !session.revokedAt &&
          new Date(session.expiresAt) > now
        ) {
          const lastActivity = new Date(session.lastActivityAt);
          const idleTime = now.getTime() - lastActivity.getTime();
          if (idleTime > idleTimeoutMs) {
            session.revokedAt = now;
            session.revokedReason = reason;
            const ttlSeconds = Math.ceil((session.expiresAt.getTime() - now.getTime()) / 1000);
            if (ttlSeconds > 0) {
              await this.redisClient.setEx(
                this.sessionKey(id),
                ttlSeconds,
                JSON.stringify(session)
              );
            }
          }
        }
      }
    } catch (error: any) {
      log(`Redis error in revokeIdleSessions: ${error.message}`, 'storage');
      return this.memoryFallback.revokeIdleSessions(auth0UserId, idleTimeoutMs, reason);
    }
  }

  async updateSessionActivity(sessionId: string): Promise<void> {
    if (!this.isRedisAvailable()) {
      return this.memoryFallback.updateSessionActivity(sessionId);
    }

    try {
      const session = await this.getSession(sessionId);
      if (session) {
        session.lastActivityAt = new Date();
        const ttlSeconds = Math.ceil((session.expiresAt.getTime() - Date.now()) / 1000);
        if (ttlSeconds > 0) {
          await this.redisClient.setEx(
            this.sessionKey(sessionId),
            ttlSeconds,
            JSON.stringify(session)
          );
        }
      }
    } catch (error: any) {
      log(`Redis error in updateSessionActivity: ${error.message}`, 'storage');
      return this.memoryFallback.updateSessionActivity(sessionId);
    }
  }

  async updateSession(sessionId: string, updates: Partial<Pick<Session, 'isAdmin' | 'name' | 'emailVerified'>>): Promise<void> {
    if (!this.isRedisAvailable()) {
      return this.memoryFallback.updateSession(sessionId, updates);
    }

    try {
      const session = await this.getSession(sessionId);
      if (session) {
        if (updates.isAdmin !== undefined) {
          session.isAdmin = updates.isAdmin;
        }
        if (updates.name !== undefined) {
          session.name = updates.name;
        }
        if (updates.emailVerified !== undefined) {
          session.emailVerified = updates.emailVerified;
        }
        const ttlSeconds = Math.ceil((session.expiresAt.getTime() - Date.now()) / 1000);
        if (ttlSeconds > 0) {
          await this.redisClient.setEx(
            this.sessionKey(sessionId),
            ttlSeconds,
            JSON.stringify(session)
          );
        }
      }
    } catch (error: any) {
      log(`Redis error in updateSession: ${error.message}`, 'storage');
      return this.memoryFallback.updateSession(sessionId, updates);
    }
  }

  async getUserFlags(auth0UserId: string): Promise<UserFlags | undefined> {
    if (!this.isRedisAvailable()) {
      return this.memoryFallback.getUserFlags(auth0UserId);
    }

    try {
      const data = await this.redisClient.get(this.userFlagsKey(auth0UserId));
      if (!data) return undefined;

      const flags: UserFlags = JSON.parse(data);
      // Convert date strings back to Date objects
      if (flags.blockedAt) {
        flags.blockedAt = new Date(flags.blockedAt);
      }
      return flags;
    } catch (error: any) {
      log(`Redis error in getUserFlags: ${error.message}`, 'storage');
      return this.memoryFallback.getUserFlags(auth0UserId);
    }
  }

  async setUserBlocked(auth0UserId: string, blocked: boolean, reason?: string): Promise<void> {
    if (!this.isRedisAvailable()) {
      return this.memoryFallback.setUserBlocked(auth0UserId, blocked, reason);
    }

    try {
      // Get existing flags first to preserve other settings
      const existingData = await this.redisClient.get(this.userFlagsKey(auth0UserId));
      const existing: UserFlags = existingData ? JSON.parse(existingData) : { auth0UserId, blocked: false };

      const flags: UserFlags = {
        ...existing,
        auth0UserId,
        blocked,
        blockedReason: blocked ? (reason || null) : null,
        blockedAt: blocked ? new Date() : null,
      };

      // Store user flags with 30 day expiry
      await this.redisClient.setEx(
        this.userFlagsKey(auth0UserId),
        30 * 24 * 60 * 60,
        JSON.stringify(flags)
      );
    } catch (error: any) {
      log(`Redis error in setUserBlocked: ${error.message}`, 'storage');
      return this.memoryFallback.setUserBlocked(auth0UserId, blocked, reason);
    }
  }

  async setEmailVerifiedOverride(auth0UserId: string, verified: boolean, adminEmail: string): Promise<void> {
    if (!this.isRedisAvailable()) {
      return this.memoryFallback.setEmailVerifiedOverride(auth0UserId, verified, adminEmail);
    }

    try {
      // Get existing flags first to preserve other settings
      const existingData = await this.redisClient.get(this.userFlagsKey(auth0UserId));
      const existing: UserFlags = existingData ? JSON.parse(existingData) : { auth0UserId, blocked: false };

      const flags: UserFlags = {
        ...existing,
        auth0UserId,
        emailVerifiedOverride: verified,
        emailVerifiedOverrideAt: verified ? new Date() : null,
        emailVerifiedOverrideBy: verified ? adminEmail : null,
      };

      // Store user flags with 30 day expiry
      await this.redisClient.setEx(
        this.userFlagsKey(auth0UserId),
        30 * 24 * 60 * 60,
        JSON.stringify(flags)
      );
      log(`Set email verified override for ${auth0UserId} to ${verified} by ${adminEmail}`, 'storage');
    } catch (error: any) {
      log(`Redis error in setEmailVerifiedOverride: ${error.message}`, 'storage');
      return this.memoryFallback.setEmailVerifiedOverride(auth0UserId, verified, adminEmail);
    }
  }

  async getEmailVerifiedOverride(auth0UserId: string): Promise<boolean> {
    if (!this.isRedisAvailable()) {
      return this.memoryFallback.getEmailVerifiedOverride(auth0UserId);
    }

    try {
      const data = await this.redisClient.get(this.userFlagsKey(auth0UserId));
      if (!data) return false;

      const flags: UserFlags = JSON.parse(data);
      return flags.emailVerifiedOverride ?? false;
    } catch (error: any) {
      log(`Redis error in getEmailVerifiedOverride: ${error.message}`, 'storage');
      return this.memoryFallback.getEmailVerifiedOverride(auth0UserId);
    }
  }
}

// Initialize storage - will be updated to use Redis when available
let storageInstance: IStorage = new MemoryStorage();

export function initializeStorage(redisClient?: any): IStorage {
  if (redisClient && redisClient.isOpen) {
    log('Initializing Redis-backed session storage', 'storage');
    storageInstance = new RedisStorage(redisClient);
  } else {
    log('Redis not available, using memory-backed session storage', 'storage');
    storageInstance = new MemoryStorage();
  }
  return storageInstance;
}

export const storage = new Proxy({} as IStorage, {
  get(_, prop) {
    return (storageInstance as any)[prop];
  }
});

// Database storage for plans, wallets, and deploy orders
export const dbStorage = {
  // Plans
  async getAllPlans(): Promise<Plan[]> {
    return db.select().from(plans);
  },

  async getActivePlans(): Promise<Plan[]> {
    return db.select().from(plans).where(eq(plans.active, true));
  },

  async getPlanById(id: number): Promise<Plan | undefined> {
    const [plan] = await db.select().from(plans).where(eq(plans.id, id));
    return plan;
  },

  async getPlanByCode(code: string): Promise<Plan | undefined> {
    const [plan] = await db.select().from(plans).where(eq(plans.code, code));
    return plan;
  },

  async upsertPlan(plan: InsertPlan & Record<string, unknown>): Promise<Plan> {
    // Use virtfusionPackageId as the primary lookup for synced plans
    const planData = plan as typeof plans.$inferInsert;
    if (planData.virtfusionPackageId) {
      const [existingByVfId] = await db
        .select()
        .from(plans)
        .where(eq(plans.virtfusionPackageId, planData.virtfusionPackageId!));

      if (existingByVfId) {
        // Preserve existing price if the new price is 0 (VirtFusion doesn't provide pricing)
        const updateData = { ...planData };
        if (planData.priceMonthly === 0 && existingByVfId.priceMonthly && existingByVfId.priceMonthly > 0) {
          updateData.priceMonthly = existingByVfId.priceMonthly;
        }
        // Allow plan active status to be updated from static config and VirtFusion sync

        const [updated] = await db
          .update(plans)
          .set(updateData)
          .where(eq(plans.virtfusionPackageId, planData.virtfusionPackageId!))
          .returning();
        return updated;
      }
    }

    // Fallback to code lookup for manually created plans
    const existing = await this.getPlanByCode(planData.code);
    if (existing) {
      // Preserve existing price if the new price is 0
      const updateData = { ...planData };
      if (planData.priceMonthly === 0 && existing.priceMonthly && existing.priceMonthly > 0) {
        updateData.priceMonthly = existing.priceMonthly;
      }
      // Allow plan active status to be updated

      const [updated] = await db
        .update(plans)
        .set(updateData)
        .where(eq(plans.code, planData.code))
        .returning();
      return updated;
    }
    const [created] = await db.insert(plans).values(planData).returning();
    return created;
  },

  async seedPlansFromConfig(): Promise<{ seeded: number; errors: string[] }> {
    const errors: string[] = [];
    let seeded = 0;

    for (const plan of STATIC_PLANS) {
      try {
        await this.upsertPlan({
          code: plan.code,
          name: plan.name,
          vcpu: plan.vcpu,
          ramMb: plan.ramMb,
          storageGb: plan.storageGb,
          transferGb: plan.transferGb,
          priceMonthly: plan.priceMonthly,
          virtfusionPackageId: plan.virtfusionPackageId,
          active: plan.active,
          popular: plan.popular ?? false,
        });
        seeded++;
      } catch (error: any) {
        errors.push(`Failed to seed plan ${plan.code}: ${error.message}`);
      }
    }

    return { seeded, errors };
  },

  // Wallets
  async getWallet(auth0UserId: string): Promise<Wallet | undefined> {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.auth0UserId, auth0UserId));
    return wallet;
  },

  async getOrCreateWallet(auth0UserId: string): Promise<Wallet> {
    const existing = await this.getWallet(auth0UserId);
    if (existing) return existing;
    
    const [wallet] = await db
      .insert(wallets)
      .values({ auth0UserId, balanceCents: 0 })
      .returning();
    return wallet;
  },

  async updateWalletStripeCustomerId(auth0UserId: string, stripeCustomerId: string): Promise<Wallet> {
    const [updated] = await db
      .update(wallets)
      .set({ stripeCustomerId, updatedAt: new Date() })
      .where(eq(wallets.auth0UserId, auth0UserId))
      .returning();
    return updated;
  },

  async clearWalletStripeCustomerId(auth0UserId: string): Promise<Wallet | undefined> {
    const [updated] = await db
      .update(wallets)
      .set({ 
        stripeCustomerId: null, 
        autoTopupEnabled: false,
        autoTopupPaymentMethodId: null,
        updatedAt: new Date() 
      })
      .where(eq(wallets.auth0UserId, auth0UserId))
      .returning();
    return updated;
  },

  async updateWalletVirtFusionUserId(auth0UserId: string, virtFusionUserId: number): Promise<Wallet | undefined> {
    const [updated] = await db
      .update(wallets)
      .set({ virtFusionUserId, updatedAt: new Date() })
      .where(eq(wallets.auth0UserId, auth0UserId))
      .returning();
    return updated;
  },

  async updateProfilePicture(auth0UserId: string, profilePictureUrl: string | null): Promise<Wallet | undefined> {
    const [updated] = await db
      .update(wallets)
      .set({ profilePictureUrl, updatedAt: new Date() })
      .where(eq(wallets.auth0UserId, auth0UserId))
      .returning();
    return updated;
  },

  async getWalletByStripeCustomerId(stripeCustomerId: string): Promise<Wallet | undefined> {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.stripeCustomerId, stripeCustomerId));
    return wallet;
  },

  async getWalletByVirtFusionUserId(virtFusionUserId: number): Promise<Wallet | undefined> {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.virtFusionUserId, virtFusionUserId));
    return wallet;
  },

  async softDeleteWallet(auth0UserId: string): Promise<Wallet | undefined> {
    const [updated] = await db
      .update(wallets)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(wallets.auth0UserId, auth0UserId))
      .returning();
    return updated;
  },

  async softDeleteWalletByStripeCustomerId(stripeCustomerId: string): Promise<Wallet | undefined> {
    const [updated] = await db
      .update(wallets)
      .set({ 
        deletedAt: new Date(), 
        updatedAt: new Date(),
        autoTopupEnabled: false,
        autoTopupPaymentMethodId: null,
      })
      .where(eq(wallets.stripeCustomerId, stripeCustomerId))
      .returning();
    return updated;
  },

  async creditWallet(auth0UserId: string, amountCents: number, transaction: { type: string; stripeEventId?: string | null; stripePaymentIntentId?: string | null; stripeSessionId?: string | null; metadata?: Record<string, unknown> }): Promise<Wallet> {
    // SECURITY: Check for idempotency using stripeEventId to prevent duplicate credits
    if (transaction.stripeEventId) {
      const [existing] = await db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.stripeEventId, transaction.stripeEventId));
      if (existing) {
        // Already processed, return current wallet
        log(`Duplicate credit attempt blocked for stripeEventId: ${transaction.stripeEventId}`, 'security');
        return await this.getOrCreateWallet(auth0UserId);
      }
    }

    // SECURITY: Also check stripePaymentIntentId for idempotency (used by auto-topup and direct charges)
    if (transaction.stripePaymentIntentId) {
      const [existing] = await db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.stripePaymentIntentId, transaction.stripePaymentIntentId));
      if (existing) {
        // Already processed, return current wallet
        log(`Duplicate credit attempt blocked for stripePaymentIntentId: ${transaction.stripePaymentIntentId}`, 'security');
        return await this.getOrCreateWallet(auth0UserId);
      }
    }

    // Create wallet if doesn't exist
    await this.getOrCreateWallet(auth0UserId);

    // SECURITY: Update balance FIRST, then record transaction
    // This ensures if balance update fails, no orphaned transaction record is created
    const [updated] = await db
      .update(wallets)
      .set({
        balanceCents: sql`${wallets.balanceCents} + ${amountCents}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.auth0UserId, auth0UserId))
      .returning();

    if (!updated) {
      throw new Error('Failed to update wallet balance');
    }

    // Insert transaction after successful balance update
    await db.insert(walletTransactions).values({
      auth0UserId,
      amountCents,
      ...transaction,
    });

    return updated;
  },

  async debitWallet(auth0UserId: string, amountCents: number, metadata?: Record<string, unknown>): Promise<{ success: boolean; wallet?: Wallet; error?: string }> {
    // SECURITY: Use atomic UPDATE with WHERE clause to prevent race conditions
    // This ensures the balance check and deduction happen atomically
    // If balance is insufficient, no rows are updated
    
    await this.getOrCreateWallet(auth0UserId);
    
    // Atomic balance check and deduction - prevents race conditions
    // Only updates if current balance >= amountCents
    const [updated] = await db
      .update(wallets)
      .set({
        balanceCents: sql`${wallets.balanceCents} - ${amountCents}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(wallets.auth0UserId, auth0UserId),
          sql`${wallets.balanceCents} >= ${amountCents}`
        )
      )
      .returning();
    
    if (!updated) {
      // No rows updated means insufficient balance
      return { success: false, error: 'Insufficient balance' };
    }

    // Insert debit transaction after successful balance update
    await db.insert(walletTransactions).values({
      auth0UserId,
      type: 'debit',
      amountCents: -amountCents,
      metadata: metadata || null,
    });

    return { success: true, wallet: updated };
  },

  async refundToWallet(auth0UserId: string, amountCents: number, metadata?: Record<string, unknown>): Promise<Wallet> {
    await this.getOrCreateWallet(auth0UserId);

    // SECURITY: Update balance FIRST, then record transaction
    // This ensures if balance update fails, no orphaned transaction record is created
    const [updated] = await db
      .update(wallets)
      .set({
        balanceCents: sql`${wallets.balanceCents} + ${amountCents}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.auth0UserId, auth0UserId))
      .returning();

    if (!updated) {
      throw new Error('Failed to update wallet balance');
    }

    // Record transaction after successful balance update
    await db.insert(walletTransactions).values({
      auth0UserId,
      type: 'refund',
      amountCents,
      metadata: metadata || null,
    });

    return updated;
  },

  async getWalletTransactions(auth0UserId: string, limit = 50): Promise<WalletTransaction[]> {
    return db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.auth0UserId, auth0UserId))
      .orderBy(desc(walletTransactions.createdAt))
      .limit(limit);
  },

  async deductBalance(
    auth0UserId: string,
    amountCents: number,
    metadata?: Record<string, any>
  ): Promise<boolean> {
    const [updated] = await db
      .update(wallets)
      .set({
        balanceCents: sql`${wallets.balanceCents} - ${amountCents}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(wallets.auth0UserId, auth0UserId),
          sql`${wallets.balanceCents} >= ${amountCents}`,
          sql`${wallets.deletedAt} IS NULL`
        )
      )
      .returning();

    if (!updated) {
      return false;
    }

    await db.insert(walletTransactions).values({
      auth0UserId,
      type: metadata?.type || 'debit',
      amountCents: -amountCents,
      metadata: metadata || null,
    });

    return true;
  },

  async creditBalance(
    auth0UserId: string,
    amountCents: number,
    metadata?: Record<string, any>
  ): Promise<boolean> {
    const [updated] = await db
      .update(wallets)
      .set({
        balanceCents: sql`${wallets.balanceCents} + ${amountCents}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(wallets.auth0UserId, auth0UserId),
          sql`${wallets.deletedAt} IS NULL`
        )
      )
      .returning();

    if (!updated) {
      return false;
    }

    await db.insert(walletTransactions).values({
      auth0UserId,
      type: metadata?.type || 'credit',
      amountCents,
      metadata: metadata || null,
    });

    return true;
  },

  // Admin: Get all wallets
  async getAllWallets(): Promise<Wallet[]> {
    return db
      .select()
      .from(wallets)
      .orderBy(desc(wallets.updatedAt));
  },

  // Get active wallets (not deleted) for orphan cleanup
  async getActiveWallets(): Promise<Wallet[]> {
    return db
      .select()
      .from(wallets)
      .where(sql`${wallets.deletedAt} IS NULL`)
      .orderBy(wallets.updatedAt);
  },

  // Admin: Adjust wallet balance (add or remove credits)
  async adjustWalletBalance(
    auth0UserId: string, 
    amountCents: number, 
    reason: string,
    adminEmail: string
  ): Promise<{ success: boolean; wallet?: Wallet; error?: string }> {
    const wallet = await this.getWallet(auth0UserId);
    if (!wallet) {
      return { success: false, error: 'Wallet not found' };
    }

    // SECURITY: For negative adjustments, use atomic check in WHERE clause
    // This prevents race conditions that could result in negative balances
    let updated: Wallet | undefined;
    
    if (amountCents < 0) {
      // Atomic balance check and deduction for negative adjustments
      const [result] = await db
        .update(wallets)
        .set({
          balanceCents: sql`${wallets.balanceCents} + ${amountCents}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(wallets.auth0UserId, auth0UserId),
            sql`${wallets.balanceCents} + ${amountCents} >= 0`
          )
        )
        .returning();
      
      if (!result) {
        return { success: false, error: 'Adjustment would result in negative balance' };
      }
      updated = result;
    } else {
      // For positive adjustments, no balance check needed
      const [result] = await db
        .update(wallets)
        .set({
          balanceCents: sql`${wallets.balanceCents} + ${amountCents}`,
          updatedAt: new Date(),
        })
        .where(eq(wallets.auth0UserId, auth0UserId))
        .returning();
      updated = result;
    }

    // Insert adjustment transaction after successful balance update
    await db.insert(walletTransactions).values({
      auth0UserId,
      type: 'admin_adjustment',
      amountCents,
      metadata: { 
        reason,
        adminEmail,
        adjustedAt: new Date().toISOString(),
      },
    });

    return { success: true, wallet: updated };
  },

  // Deploy Orders
  async createDeployOrder(order: InsertDeployOrder): Promise<DeployOrder> {
    const [created] = await db.insert(deployOrders).values(order as typeof deployOrders.$inferInsert).returning();
    return created;
  },

  async getDeployOrder(id: number): Promise<DeployOrder | undefined> {
    const [order] = await db.select().from(deployOrders).where(eq(deployOrders.id, id));
    return order;
  },

  async getDeployOrdersByUser(auth0UserId: string): Promise<DeployOrder[]> {
    return db
      .select()
      .from(deployOrders)
      .where(eq(deployOrders.auth0UserId, auth0UserId))
      .orderBy(desc(deployOrders.createdAt));
  },

  async updateDeployOrder(id: number, updates: Partial<DeployOrder>): Promise<DeployOrder | undefined> {
    const [updated] = await db
      .update(deployOrders)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(deployOrders.id, id))
      .returning();
    return updated;
  },

  async cancelAllUserOrders(auth0UserId: string): Promise<number> {
    const result = await db
      .update(deployOrders)
      .set({ 
        status: 'cancelled',
        errorMessage: 'User account deleted',
        updatedAt: new Date() 
      })
      .where(eq(deployOrders.auth0UserId, auth0UserId))
      .returning();
    return result.length;
  },

  // Combined: debit wallet + create order in transaction
  async createDeployWithDebit(
    auth0UserId: string,
    planId: number,
    priceCents: number,
    hostname?: string,
    planName?: string
  ): Promise<{ success: boolean; order?: DeployOrder; error?: string }> {
    await this.getOrCreateWallet(auth0UserId);
    
    // SECURITY: Atomic balance check and deduction to prevent race conditions
    const [updated] = await db
      .update(wallets)
      .set({
        balanceCents: sql`${wallets.balanceCents} - ${priceCents}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(wallets.auth0UserId, auth0UserId),
          sql`${wallets.balanceCents} >= ${priceCents}`
        )
      )
      .returning();
    
    if (!updated) {
      return { success: false, error: 'Insufficient balance' };
    }

    // Create order after successful balance deduction
    const order = await this.createDeployOrder({
      auth0UserId,
      planId,
      locationCode: 'BNE',
      hostname,
      priceCents,
      status: 'paid',
    });

    // Insert debit transaction with server details for display
    await db.insert(walletTransactions).values({
      auth0UserId,
      type: 'debit',
      amountCents: -priceCents,
      metadata: {
        deployOrderId: order.id,
        serverName: hostname,
        planName: planName,
        reason: 'Server deployment'
      },
    });

    return { success: true, order };
  },

  // Server Cancellation methods
  async createCancellationRequest(data: InsertServerCancellation): Promise<ServerCancellation> {
    const [cancellation] = await db.insert(serverCancellations).values(data as typeof serverCancellations.$inferInsert).returning();
    return cancellation;
  },

  async getCancellationByServerId(virtfusionServerId: string, auth0UserId: string): Promise<ServerCancellation | undefined> {
    const [cancellation] = await db
      .select()
      .from(serverCancellations)
      .where(
        and(
          eq(serverCancellations.virtfusionServerId, virtfusionServerId),
          eq(serverCancellations.auth0UserId, auth0UserId),
          inArray(serverCancellations.status, ['pending', 'processing'])
        )
      );
    return cancellation;
  },

  async revokeCancellationRequest(id: number): Promise<ServerCancellation | undefined> {
    const [updated] = await db
      .update(serverCancellations)
      .set({ status: 'revoked', revokedAt: new Date() })
      .where(eq(serverCancellations.id, id))
      .returning();
    return updated;
  },

  async getPendingCancellations(): Promise<ServerCancellation[]> {
    return db
      .select()
      .from(serverCancellations)
      .where(eq(serverCancellations.status, 'pending'))
      .orderBy(serverCancellations.scheduledDeletionAt);
  },

  async getProcessingCancellations(): Promise<ServerCancellation[]> {
    return db
      .select()
      .from(serverCancellations)
      .where(eq(serverCancellations.status, 'processing'))
      .orderBy(serverCancellations.scheduledDeletionAt);
  },

  async markCancellationProcessing(id: number): Promise<ServerCancellation | undefined> {
    const [updated] = await db
      .update(serverCancellations)
      .set({ status: 'processing' })
      .where(eq(serverCancellations.id, id))
      .returning();
    return updated;
  },

  async completeCancellation(id: number): Promise<ServerCancellation | undefined> {
    const [updated] = await db
      .update(serverCancellations)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(serverCancellations.id, id))
      .returning();
    return updated;
  },

  async getUserCancellations(auth0UserId: string): Promise<ServerCancellation[]> {
    return db
      .select()
      .from(serverCancellations)
      .where(eq(serverCancellations.auth0UserId, auth0UserId))
      .orderBy(desc(serverCancellations.requestedAt));
  },
  
  async markCancellationFailed(id: number, errorMessage: string): Promise<ServerCancellation | undefined> {
    const [updated] = await db
      .update(serverCancellations)
      .set({ status: 'failed', errorMessage })
      .where(eq(serverCancellations.id, id))
      .returning();
    return updated;
  },

  // Auto top-up settings
  async updateAutoTopupSettings(
    auth0UserId: string,
    settings: {
      enabled: boolean;
      thresholdCents?: number;
      amountCents?: number;
      paymentMethodId?: string | null;
    }
  ): Promise<Wallet | undefined> {
    const [updated] = await db
      .update(wallets)
      .set({
        autoTopupEnabled: settings.enabled,
        autoTopupThresholdCents: settings.thresholdCents,
        autoTopupAmountCents: settings.amountCents,
        autoTopupPaymentMethodId: settings.paymentMethodId,
        updatedAt: new Date(),
      })
      .where(eq(wallets.auth0UserId, auth0UserId))
      .returning();
    return updated;
  },

  async getWalletsNeedingTopup(): Promise<Wallet[]> {
    return db
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
  },

  // Server Billing methods
  async createServerBilling(data: InsertServerBilling): Promise<ServerBilling> {
    const [billing] = await db.insert(serverBilling).values(data as typeof serverBilling.$inferInsert).returning();
    return billing;
  },

  async getServerBilling(virtfusionServerId: string): Promise<ServerBilling | undefined> {
    const [billing] = await db
      .select()
      .from(serverBilling)
      .where(eq(serverBilling.virtfusionServerId, virtfusionServerId));
    return billing;
  },

  async getServerBillingByUser(auth0UserId: string): Promise<ServerBilling[]> {
    return db
      .select()
      .from(serverBilling)
      .where(eq(serverBilling.auth0UserId, auth0UserId));
  },

  async getServersDueToBill(): Promise<ServerBilling[]> {
    return db
      .select()
      .from(serverBilling)
      .where(
        and(
          or(eq(serverBilling.status, 'paid'), eq(serverBilling.status, 'active')),
          sql`${serverBilling.nextBillAt} <= NOW()`
        )
      );
  },

  async getOverdueServers(gracePeriodDays: number = 7): Promise<ServerBilling[]> {
    return db
      .select()
      .from(serverBilling)
      .where(
        and(
          eq(serverBilling.status, 'unpaid'),
          sql`${serverBilling.suspendAt} <= NOW()`
        )
      );
  },

  async updateServerBillingStatus(
    virtfusionServerId: string,
    status: string,
    suspendAt?: Date | null
  ): Promise<ServerBilling | undefined> {
    const updates: Record<string, unknown> = { status, updatedAt: new Date() };
    if (suspendAt !== undefined) {
      updates.suspendAt = suspendAt;
    }
    const [updated] = await db
      .update(serverBilling)
      .set(updates)
      .where(eq(serverBilling.virtfusionServerId, virtfusionServerId))
      .returning();
    return updated;
  },

  async markServerBilled(
    virtfusionServerId: string,
    nextBillAt: Date
  ): Promise<ServerBilling | undefined> {
    const [updated] = await db
      .update(serverBilling)
      .set({
        nextBillAt,
        status: 'paid',
        suspendAt: null,
        updatedAt: new Date(),
      })
      .where(eq(serverBilling.virtfusionServerId, virtfusionServerId))
      .returning();
    return updated;
  },

  async deleteServerBilling(virtfusionServerId: string): Promise<void> {
    await db
      .delete(serverBilling)
      .where(eq(serverBilling.virtfusionServerId, virtfusionServerId));
  },

  // Security settings
  async getSecuritySetting(key: string): Promise<SecuritySetting | undefined> {
    const [setting] = await db
      .select()
      .from(securitySettings)
      .where(eq(securitySettings.key, key));
    return setting;
  },

  async getAllSecuritySettings(): Promise<SecuritySetting[]> {
    return db.select().from(securitySettings);
  },

  async upsertSecuritySetting(key: string, value: string | null, enabled: boolean): Promise<SecuritySetting> {
    const [existing] = await db
      .select()
      .from(securitySettings)
      .where(eq(securitySettings.key, key));

    if (existing) {
      const [updated] = await db
        .update(securitySettings)
        .set({ value, enabled, updatedAt: new Date() })
        .where(eq(securitySettings.key, key))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(securitySettings)
        .values({ key, value, enabled })
        .returning();
      return created;
    }
  },

  // Sync version that uses cached settings - call refreshRecaptchaCache periodically
  getRecaptchaSettings(): { enabled: boolean; siteKey: string | null; secretKey: string | null; version: 'v2' | 'v3'; minScore: number } {
    return this._recaptchaCache || {
      enabled: false,
      siteKey: null,
      secretKey: null,
      version: 'v3',
      minScore: 0.5,
    };
  },

  _recaptchaCache: null as { enabled: boolean; siteKey: string | null; secretKey: string | null; version: 'v2' | 'v3'; minScore: number } | null,

  async refreshRecaptchaCache(): Promise<void> {
    const settings = await this.getRecaptchaSettingsAsync();
    this._recaptchaCache = settings;
  },

  async getRecaptchaSettingsAsync(): Promise<{ enabled: boolean; siteKey: string | null; secretKey: string | null; version: 'v2' | 'v3'; minScore: number }> {
    try {
      // Try database first
      const [siteKeySetting, secretKeySetting, versionSetting, minScoreSetting] = await Promise.all([
        this.getSecuritySetting('recaptcha_site_key'),
        this.getSecuritySetting('recaptcha_secret_key'),
        this.getSecuritySetting('recaptcha_version'),
        this.getSecuritySetting('recaptcha_min_score'),
      ]);

      // If database has settings, use them
      if (siteKeySetting?.value && secretKeySetting?.value) {
        const enabled = siteKeySetting.enabled && secretKeySetting.enabled;
        const version = (versionSetting?.value === 'v2' ? 'v2' : 'v3') as 'v2' | 'v3';
        const minScore = minScoreSetting?.value ? parseFloat(minScoreSetting.value) : 0.5;

        return {
          enabled,
          siteKey: siteKeySetting.value,
          secretKey: secretKeySetting.value,
          version,
          minScore: isNaN(minScore) ? 0.5 : Math.max(0, Math.min(1, minScore)),
        };
      }

      // Fall back to environment variables (legacy support)
      const siteKey = process.env.RECAPTCHA_SITE_KEY || null;
      const secretKey = process.env.RECAPTCHA_SECRET_KEY || null;
      const enabled = !!(siteKey && secretKey);

      return { enabled, siteKey, secretKey, version: 'v3', minScore: 0.5 };
    } catch (error) {
      // If database fails, fall back to env vars
      const siteKey = process.env.RECAPTCHA_SITE_KEY || null;
      const secretKey = process.env.RECAPTCHA_SECRET_KEY || null;
      const enabled = !!(siteKey && secretKey);

      return { enabled, siteKey, secretKey, version: 'v3', minScore: 0.5 };
    }
  },

  async updateRecaptchaSettings(settings: { siteKey: string; secretKey: string; enabled: boolean; version?: 'v2' | 'v3'; minScore?: number }): Promise<void> {
    await Promise.all([
      this.upsertSecuritySetting('recaptcha_site_key', settings.siteKey, settings.enabled),
      this.upsertSecuritySetting('recaptcha_secret_key', settings.secretKey, settings.enabled),
      this.upsertSecuritySetting('recaptcha_version', settings.version || 'v3', settings.enabled),
      this.upsertSecuritySetting('recaptcha_min_score', String(settings.minScore ?? 0.5), settings.enabled),
    ]);
    // Refresh cache after update
    await this.refreshRecaptchaCache();
  },

  async testRecaptchaConfig(siteKey: string, secretKey: string): Promise<{ valid: boolean; error?: string }> {
    // Basic validation - check key formats
    if (!siteKey || siteKey.length < 30) {
      return { valid: false, error: 'Invalid site key format' };
    }
    if (!secretKey || secretKey.length < 30) {
      return { valid: false, error: 'Invalid secret key format' };
    }
    // Keys should start with 6L for reCAPTCHA
    if (!siteKey.startsWith('6L')) {
      return { valid: false, error: 'Site key should start with "6L"' };
    }
    return { valid: true };
  },

  // ========== ADMIN AUDIT LOGGING ==========
  async createAuditLog(data: InsertAdminAuditLog): Promise<AdminAuditLog> {
    const [log] = await db
      .insert(adminAuditLogs)
      .values(data as typeof adminAuditLogs.$inferInsert)
      .returning();
    return log;
  },

  async getAuditLogs(options: {
    limit?: number;
    offset?: number;
    adminAuth0UserId?: string;
    action?: string;
    targetType?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<{ logs: AdminAuditLog[]; total: number }> {
    const { limit = 50, offset = 0, adminAuth0UserId, action, targetType, status, startDate, endDate } = options;
    
    const conditions: any[] = [];
    
    if (adminAuth0UserId) {
      conditions.push(eq(adminAuditLogs.adminAuth0UserId, adminAuth0UserId));
    }
    if (action) {
      conditions.push(eq(adminAuditLogs.action, action));
    }
    if (targetType) {
      conditions.push(eq(adminAuditLogs.targetType, targetType));
    }
    if (status) {
      conditions.push(eq(adminAuditLogs.status, status));
    }
    if (startDate) {
      conditions.push(sql`${adminAuditLogs.createdAt} >= ${startDate}`);
    }
    if (endDate) {
      conditions.push(sql`${adminAuditLogs.createdAt} <= ${endDate}`);
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const [logs, countResult] = await Promise.all([
      db.select()
        .from(adminAuditLogs)
        .where(whereClause)
        .orderBy(desc(adminAuditLogs.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` })
        .from(adminAuditLogs)
        .where(whereClause),
    ]);
    
    return {
      logs,
      total: countResult[0]?.count || 0,
    };
  },

  async getAuditLogById(id: number): Promise<AdminAuditLog | undefined> {
    const [log] = await db
      .select()
      .from(adminAuditLogs)
      .where(eq(adminAuditLogs.id, id));
    return log;
  },

  // Invoice functions
  async createInvoice(data: InsertInvoice): Promise<Invoice> {
    const [invoice] = await db.insert(invoices).values(data as typeof invoices.$inferInsert).returning();
    return invoice;
  },

  async getInvoicesByUser(auth0UserId: string): Promise<Invoice[]> {
    return db
      .select()
      .from(invoices)
      .where(eq(invoices.auth0UserId, auth0UserId))
      .orderBy(desc(invoices.createdAt));
  },

  async getInvoiceById(id: number): Promise<Invoice | undefined> {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, id));
    return invoice;
  },

  async getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | undefined> {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.invoiceNumber, invoiceNumber));
    return invoice;
  },

  async generateInvoiceNumber(): Promise<string> {
    // Format: INV-YYYYMM-XXXXX where XXXXX is a sequential number
    const now = new Date();
    const prefix = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    // Get the count of invoices this month to generate sequential number
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(invoices)
      .where(sql`${invoices.invoiceNumber} LIKE ${prefix + '%'}`);
    
    const nextNum = (result?.count || 0) + 1;
    return `${prefix}-${String(nextNum).padStart(5, '0')}`;
  },

  async updateInvoicePdfPath(id: number, pdfPath: string): Promise<Invoice | undefined> {
    const [updated] = await db
      .update(invoices)
      .set({ pdfPath })
      .where(eq(invoices.id, id))
      .returning();
    return updated;
  },

  // ========== SUPPORT TICKETS ==========

  // Create a new ticket
  async createTicket(data: InsertTicket): Promise<Ticket> {
    const [ticket] = await db.insert(tickets).values(data as typeof tickets.$inferInsert).returning();
    return ticket;
  },

  // Get a ticket by ID
  async getTicketById(id: number): Promise<Ticket | undefined> {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id));
    return ticket;
  },

  // Get tickets for a user
  async getUserTickets(auth0UserId: string, options: {
    status?: 'open' | 'closed' | 'all';
    limit?: number;
    offset?: number;
  } = {}): Promise<{ tickets: Ticket[]; total: number }> {
    const { status = 'all', limit = 50, offset = 0 } = options;

    const conditions: any[] = [eq(tickets.auth0UserId, auth0UserId)];

    // "all" and "open" both exclude closed tickets (show active tickets only)
    // "closed" shows only closed tickets
    if (status === 'closed') {
      conditions.push(eq(tickets.status, 'closed'));
    } else {
      // 'all' and 'open' both show non-closed tickets
      conditions.push(ne(tickets.status, 'closed'));
    }

    const whereClause = and(...conditions);

    const [ticketList, countResult] = await Promise.all([
      db.select()
        .from(tickets)
        .where(whereClause)
        .orderBy(desc(tickets.lastMessageAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` })
        .from(tickets)
        .where(whereClause),
    ]);

    return {
      tickets: ticketList,
      total: countResult[0]?.count || 0,
    };
  },

  // Get all tickets (for admin)
  async getAllTickets(options: {
    status?: TicketStatus | TicketStatus[];
    category?: TicketCategory;
    priority?: TicketPriority;
    auth0UserId?: string;
    virtfusionServerId?: string;
    assignedAdminId?: string | null;
    limit?: number;
    offset?: number;
    sortBy?: 'lastMessageAt' | 'priority' | 'createdAt';
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<{ tickets: Ticket[]; total: number }> {
    const {
      status,
      category,
      priority,
      auth0UserId,
      virtfusionServerId,
      assignedAdminId,
      limit = 50,
      offset = 0,
      sortBy = 'lastMessageAt',
      sortOrder = 'desc',
    } = options;

    const conditions: any[] = [];

    if (status) {
      if (Array.isArray(status)) {
        conditions.push(inArray(tickets.status, status));
      } else {
        conditions.push(eq(tickets.status, status));
      }
    }
    if (category) {
      conditions.push(eq(tickets.category, category));
    }
    if (priority) {
      conditions.push(eq(tickets.priority, priority));
    }
    if (auth0UserId) {
      conditions.push(eq(tickets.auth0UserId, auth0UserId));
    }
    if (virtfusionServerId) {
      conditions.push(eq(tickets.virtfusionServerId, virtfusionServerId));
    }
    if (assignedAdminId !== undefined) {
      if (assignedAdminId === null) {
        conditions.push(isNull(tickets.assignedAdminId));
      } else {
        conditions.push(eq(tickets.assignedAdminId, assignedAdminId));
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Build order by clause
    let orderByColumn: any;
    switch (sortBy) {
      case 'priority':
        // Priority order: urgent > high > normal > low
        orderByColumn = sql`CASE ${tickets.priority}
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          WHEN 'low' THEN 4
          ELSE 5 END`;
        break;
      case 'createdAt':
        orderByColumn = tickets.createdAt;
        break;
      default:
        orderByColumn = tickets.lastMessageAt;
    }

    const [ticketList, countResult] = await Promise.all([
      db.select()
        .from(tickets)
        .where(whereClause)
        .orderBy(sortOrder === 'asc' ? orderByColumn : desc(orderByColumn))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` })
        .from(tickets)
        .where(whereClause),
    ]);

    return {
      tickets: ticketList,
      total: countResult[0]?.count || 0,
    };
  },

  // Update a ticket
  async updateTicket(id: number, updates: Partial<{
    status: TicketStatus;
    priority: TicketPriority;
    category: TicketCategory;
    assignedAdminId: string | null;
    resolvedAt: Date | null;
    closedAt: Date | null;
  }>): Promise<Ticket | undefined> {
    const [updated] = await db
      .update(tickets)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tickets.id, id))
      .returning();
    return updated;
  },

  // Update last message timestamp
  async updateTicketLastMessage(id: number): Promise<Ticket | undefined> {
    const [updated] = await db
      .update(tickets)
      .set({ lastMessageAt: new Date(), updatedAt: new Date() })
      .where(eq(tickets.id, id))
      .returning();
    return updated;
  },

  // Close a ticket
  async closeTicket(id: number): Promise<Ticket | undefined> {
    const [updated] = await db
      .update(tickets)
      .set({ status: 'closed', closedAt: new Date(), updatedAt: new Date() })
      .where(eq(tickets.id, id))
      .returning();
    return updated;
  },

  // Reopen a ticket
  async reopenTicket(id: number): Promise<Ticket | undefined> {
    const [updated] = await db
      .update(tickets)
      .set({ status: 'waiting_admin', resolvedAt: null, closedAt: null, updatedAt: new Date() })
      .where(eq(tickets.id, id))
      .returning();
    return updated;
  },

  // Delete a ticket and its messages (admin only)
  async deleteTicket(id: number): Promise<boolean> {
    // First delete all messages for this ticket
    await db.delete(ticketMessages).where(eq(ticketMessages.ticketId, id));
    // Then delete the ticket itself
    const result = await db.delete(tickets).where(eq(tickets.id, id));
    return true;
  },

  // Create a ticket message
  async createTicketMessage(data: InsertTicketMessage): Promise<TicketMessage> {
    const messageData = data as typeof ticketMessages.$inferInsert;
    const [message] = await db.insert(ticketMessages).values(messageData).returning();
    // Update ticket last message time
    await this.updateTicketLastMessage(messageData.ticketId);
    return message;
  },

  // Get messages for a ticket
  async getTicketMessages(ticketId: number): Promise<TicketMessage[]> {
    return db
      .select()
      .from(ticketMessages)
      .where(eq(ticketMessages.ticketId, ticketId))
      .orderBy(ticketMessages.createdAt);
  },

  // Count tickets needing admin attention (new or waiting_admin)
  async getAdminTicketCounts(): Promise<{
    new: number;
    waitingAdmin: number;
    open: number;
    total: number;
  }> {
    const [newCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(eq(tickets.status, 'new'));

    const [waitingAdminCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(eq(tickets.status, 'waiting_admin'));

    const [openCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(
        and(
          ne(tickets.status, 'closed'),
          ne(tickets.status, 'resolved')
        )
      );

    const [totalCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets);

    return {
      new: newCount?.count || 0,
      waitingAdmin: waitingAdminCount?.count || 0,
      open: openCount?.count || 0,
      total: totalCount?.count || 0,
    };
  },

  // Count tickets with unread admin replies for a user
  async getUserTicketCounts(auth0UserId: string): Promise<{
    open: number;
    waitingUser: number;
    total: number;
  }> {
    const [openCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(
        and(
          eq(tickets.auth0UserId, auth0UserId),
          ne(tickets.status, 'closed'),
          ne(tickets.status, 'resolved')
        )
      );

    const [waitingUserCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(
        and(
          eq(tickets.auth0UserId, auth0UserId),
          eq(tickets.status, 'waiting_user')
        )
      );

    const [totalCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(eq(tickets.auth0UserId, auth0UserId));

    return {
      open: openCount?.count || 0,
      waitingUser: waitingUserCount?.count || 0,
      total: totalCount?.count || 0,
    };
  },

  // Two-Factor Authentication
  async getTwoFactorAuth(auth0UserId: string): Promise<TwoFactorAuth | undefined> {
    const [tfa] = await db.select().from(twoFactorAuth).where(eq(twoFactorAuth.auth0UserId, auth0UserId));
    return tfa;
  },

  async createTwoFactorAuth(data: InsertTwoFactorAuth): Promise<TwoFactorAuth> {
    const [tfa] = await db.insert(twoFactorAuth).values(data as typeof twoFactorAuth.$inferInsert).returning();
    return tfa;
  },

  async updateTwoFactorAuth(auth0UserId: string, updates: Partial<Omit<TwoFactorAuth, 'id' | 'auth0UserId' | 'createdAt'>>): Promise<TwoFactorAuth | undefined> {
    const [updated] = await db
      .update(twoFactorAuth)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(twoFactorAuth.auth0UserId, auth0UserId))
      .returning();
    return updated;
  },

  async enableTwoFactorAuth(auth0UserId: string, backupCodes: string[]): Promise<TwoFactorAuth | undefined> {
    const [updated] = await db
      .update(twoFactorAuth)
      .set({
        enabled: true,
        backupCodes: JSON.stringify(backupCodes),
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(twoFactorAuth.auth0UserId, auth0UserId))
      .returning();
    return updated;
  },

  async disableTwoFactorAuth(auth0UserId: string): Promise<TwoFactorAuth | undefined> {
    const [updated] = await db
      .update(twoFactorAuth)
      .set({
        enabled: false,
        backupCodes: null,
        verifiedAt: null,
        lastUsedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(twoFactorAuth.auth0UserId, auth0UserId))
      .returning();
    return updated;
  },

  // Email 2FA methods
  async setTwoFactorMethod(auth0UserId: string, method: 'totp' | 'email'): Promise<TwoFactorAuth | undefined> {
    const [updated] = await db
      .update(twoFactorAuth)
      .set({ method, updatedAt: new Date() })
      .where(eq(twoFactorAuth.auth0UserId, auth0UserId))
      .returning();
    return updated;
  },

  async setEmailOtpCode(auth0UserId: string, code: string, expiresAt: Date): Promise<TwoFactorAuth | undefined> {
    const [updated] = await db
      .update(twoFactorAuth)
      .set({
        emailOtpCode: code,
        emailOtpExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(twoFactorAuth.auth0UserId, auth0UserId))
      .returning();
    return updated;
  },

  async clearEmailOtpCode(auth0UserId: string): Promise<void> {
    await db
      .update(twoFactorAuth)
      .set({
        emailOtpCode: null,
        emailOtpExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(twoFactorAuth.auth0UserId, auth0UserId));
  },

  async createEmailTwoFactorAuth(auth0UserId: string): Promise<TwoFactorAuth> {
    // For email 2FA, we use a placeholder secret since TOTP isn't needed
    const [tfa] = await db
      .insert(twoFactorAuth)
      .values({
        auth0UserId,
        secret: 'EMAIL_2FA_PLACEHOLDER',
        method: 'email',
        enabled: false,
      })
      .returning();
    return tfa;
  },

  async deleteTwoFactorAuth(auth0UserId: string): Promise<void> {
    await db.delete(twoFactorAuth).where(eq(twoFactorAuth.auth0UserId, auth0UserId));
  },

  async updateTwoFactorLastUsed(auth0UserId: string): Promise<void> {
    await db
      .update(twoFactorAuth)
      .set({ lastUsedAt: new Date(), updatedAt: new Date() })
      .where(eq(twoFactorAuth.auth0UserId, auth0UserId));
  },

  async updateTwoFactorBackupCodes(auth0UserId: string, backupCodes: string[]): Promise<TwoFactorAuth | undefined> {
    const [updated] = await db
      .update(twoFactorAuth)
      .set({
        backupCodes: JSON.stringify(backupCodes),
        updatedAt: new Date(),
      })
      .where(eq(twoFactorAuth.auth0UserId, auth0UserId))
      .returning();
    return updated;
  },

  // Password reset token functions
  async createPasswordResetToken(email: string): Promise<PasswordResetToken> {
    // Generate a secure random token
    const token = randomBytes(32).toString('hex');
    // Token expires in 30 minutes
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    // Invalidate any existing tokens for this email
    await db
      .update(passwordResetTokens)
      .set({ used: true, usedAt: new Date() })
      .where(and(
        eq(passwordResetTokens.email, email.toLowerCase()),
        eq(passwordResetTokens.used, false)
      ));

    // Create new token
    const [resetToken] = await db
      .insert(passwordResetTokens)
      .values({
        email: email.toLowerCase(),
        token,
        expiresAt,
        used: false,
      } as typeof passwordResetTokens.$inferInsert)
      .returning();

    return resetToken;
  },

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));
    return resetToken;
  },

  async markPasswordResetTokenUsed(token: string): Promise<void> {
    await db
      .update(passwordResetTokens)
      .set({ used: true, usedAt: new Date() })
      .where(eq(passwordResetTokens.token, token));
  },

  async cleanupExpiredPasswordResetTokens(): Promise<number> {
    const result = await db
      .delete(passwordResetTokens)
      .where(
        or(
          sql`${passwordResetTokens.expiresAt} < NOW()`,
          eq(passwordResetTokens.used, true)
        )
      )
      .returning();
    return result.length;
  },

  // ========== PROMO CODES ==========

  // Get promo code by code (case-insensitive)
  async getPromoCodeByCode(code: string): Promise<PromoCode | undefined> {
    const [promo] = await db
      .select()
      .from(promoCodes)
      .where(eq(promoCodes.code, code.toUpperCase()));
    return promo;
  },

  // Get promo code by ID
  async getPromoCodeById(id: number): Promise<PromoCode | undefined> {
    const [promo] = await db.select().from(promoCodes).where(eq(promoCodes.id, id));
    return promo;
  },

  // Get all promo codes (for admin)
  async getAllPromoCodes(): Promise<PromoCode[]> {
    return db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt));
  },

  // Create promo code
  async createPromoCode(data: Omit<InsertPromoCode, 'id' | 'currentUses' | 'createdAt' | 'updatedAt'>): Promise<PromoCode> {
    const [promo] = await db
      .insert(promoCodes)
      .values({
        ...data,
        code: data.code.toUpperCase(),
      } as typeof promoCodes.$inferInsert)
      .returning();
    return promo;
  },

  // Update promo code
  async updatePromoCode(id: number, updates: Partial<Omit<PromoCode, 'id' | 'code' | 'createdAt' | 'createdBy'>>): Promise<PromoCode | undefined> {
    const [updated] = await db
      .update(promoCodes)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(promoCodes.id, id))
      .returning();
    return updated;
  },

  // Delete promo code
  async deletePromoCode(id: number): Promise<boolean> {
    const result = await db.delete(promoCodes).where(eq(promoCodes.id, id)).returning();
    return result.length > 0;
  },

  // Increment promo code usage count (atomic with limit check)
  // Prevents race conditions by only incrementing if limit not reached
  async incrementPromoCodeUsage(id: number): Promise<PromoCode | undefined> {
    const [updated] = await db
      .update(promoCodes)
      .set({
        currentUses: sql`${promoCodes.currentUses} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(promoCodes.id, id),
          // Only increment if no limit OR current uses below limit
          sql`(${promoCodes.maxUsesTotal} IS NULL OR ${promoCodes.currentUses} < ${promoCodes.maxUsesTotal})`
        )
      )
      .returning();

    // If no rows updated, the limit was reached (race condition caught)
    if (!updated) {
      throw new Error('Promo code usage limit reached');
    }

    return updated;
  },

  // Get user's usage count for a promo code
  async getPromoCodeUsageCount(promoCodeId: number, auth0UserId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(promoCodeUsage)
      .where(
        and(
          eq(promoCodeUsage.promoCodeId, promoCodeId),
          eq(promoCodeUsage.auth0UserId, auth0UserId)
        )
      );
    return result?.count || 0;
  },

  // Record promo code usage
  async recordPromoCodeUsage(data: Omit<InsertPromoCodeUsage, 'id' | 'usedAt'>): Promise<PromoCodeUsage> {
    const [usage] = await db
      .insert(promoCodeUsage)
      .values(data as typeof promoCodeUsage.$inferInsert)
      .returning();
    return usage;
  },

  // Get promo code usage history (for admin)
  async getPromoCodeUsageHistory(promoCodeId: number, limit: number = 100): Promise<PromoCodeUsage[]> {
    return db
      .select()
      .from(promoCodeUsage)
      .where(eq(promoCodeUsage.promoCodeId, promoCodeId))
      .orderBy(desc(promoCodeUsage.usedAt))
      .limit(limit);
  },

  // Validate promo code - returns validation result with discount info
  async validatePromoCode(
    code: string,
    auth0UserId: string,
    planId: number,
    priceCents: number
  ): Promise<{
    valid: boolean;
    error?: string;
    promoCode?: PromoCode;
    discountCents?: number;
    finalPriceCents?: number;
  }> {
    const promo = await this.getPromoCodeByCode(code);

    if (!promo) {
      return { valid: false, error: 'Invalid promo code' };
    }

    // Check if active
    if (!promo.active) {
      return { valid: false, error: 'This promo code is no longer active' };
    }

    // Check validity period
    const now = new Date();
    if (promo.validFrom && now < new Date(promo.validFrom)) {
      return { valid: false, error: 'This promo code is not yet valid' };
    }
    if (promo.validUntil && now > new Date(promo.validUntil)) {
      return { valid: false, error: 'This promo code has expired' };
    }

    // Check total usage limit
    if (promo.maxUsesTotal !== null && promo.currentUses >= promo.maxUsesTotal) {
      return { valid: false, error: 'This promo code has reached its usage limit' };
    }

    // Check per-user usage limit
    if (promo.maxUsesPerUser !== null) {
      const userUsageCount = await this.getPromoCodeUsageCount(promo.id, auth0UserId);
      if (userUsageCount >= promo.maxUsesPerUser) {
        return { valid: false, error: 'You have already used this promo code' };
      }
    }

    // Check if applies to this plan
    if (promo.appliesTo === 'specific') {
      const planIds = (promo.planIds as number[]) || [];
      if (!planIds.includes(planId)) {
        return { valid: false, error: 'This promo code does not apply to the selected plan' };
      }
    }

    // Calculate discount
    let discountCents: number;
    if (promo.discountType === 'percentage') {
      discountCents = Math.round(priceCents * (promo.discountValue / 100));
    } else {
      // Fixed discount - cap at price
      discountCents = Math.min(promo.discountValue, priceCents);
    }

    const finalPriceCents = priceCents - discountCents;

    return {
      valid: true,
      promoCode: promo,
      discountCents,
      finalPriceCents,
    };
  },

  // User Flags - Read directly from database (not cache)
  // Use this for checking suspension status as it's more up-to-date than Redis cache
  async getUserFlagsFromDb(auth0UserId: string): Promise<UserFlags | undefined> {
    const [flags] = await db
      .select()
      .from(userFlagsTable)
      .where(eq(userFlagsTable.auth0UserId, auth0UserId));

    if (!flags) return undefined;

    return {
      auth0UserId: flags.auth0UserId,
      blocked: flags.blocked,
      blockedReason: flags.blockedReason,
      blockedAt: flags.blockedAt,
      suspended: flags.suspended,
      suspendedReason: flags.suspendedReason,
      suspendedAt: flags.suspendedAt,
      suspendedBy: flags.suspendedBy,
      emailVerifiedOverride: flags.emailVerifiedOverride,
      emailVerifiedOverrideAt: flags.emailVerifiedOverrideAt,
      emailVerifiedOverrideBy: flags.emailVerifiedOverrideBy,
    };
  },

  // ========== EMAIL VERIFICATION TOKENS ==========

  // Create email verification token for a user
  async createEmailVerificationToken(auth0UserId: string, email: string): Promise<EmailVerificationToken> {
    // Generate a secure random token
    const token = randomBytes(32).toString('hex');
    // Token expires in 24 hours
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Invalidate any existing tokens for this user
    await db
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.auth0UserId, auth0UserId));

    // Create new token
    const [verificationToken] = await db
      .insert(emailVerificationTokens)
      .values({
        auth0UserId,
        email: email.toLowerCase(),
        token,
        expiresAt,
        verified: false,
      } as typeof emailVerificationTokens.$inferInsert)
      .returning();

    return verificationToken;
  },

  // Get email verification token by token string
  async getEmailVerificationToken(token: string): Promise<EmailVerificationToken | undefined> {
    const [verificationToken] = await db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.token, token));
    return verificationToken;
  },

  // Get pending verification token for a user
  async getPendingVerificationToken(auth0UserId: string): Promise<EmailVerificationToken | undefined> {
    const [verificationToken] = await db
      .select()
      .from(emailVerificationTokens)
      .where(
        and(
          eq(emailVerificationTokens.auth0UserId, auth0UserId),
          eq(emailVerificationTokens.verified, false),
          sql`${emailVerificationTokens.expiresAt} > NOW()`
        )
      );
    return verificationToken;
  },

  // Mark email as verified
  async markEmailVerified(token: string): Promise<EmailVerificationToken | undefined> {
    const [updated] = await db
      .update(emailVerificationTokens)
      .set({ verified: true, verifiedAt: new Date() })
      .where(eq(emailVerificationTokens.token, token))
      .returning();
    return updated;
  },

  // Check if user has verified their email
  async isEmailVerified(auth0UserId: string): Promise<boolean> {
    const [result] = await db
      .select()
      .from(emailVerificationTokens)
      .where(
        and(
          eq(emailVerificationTokens.auth0UserId, auth0UserId),
          eq(emailVerificationTokens.verified, true)
        )
      );
    return !!result;
  },

  // Cleanup expired email verification tokens
  async cleanupExpiredEmailVerificationTokens(): Promise<number> {
    const result = await db
      .delete(emailVerificationTokens)
      .where(
        and(
          sql`${emailVerificationTokens.expiresAt} < NOW()`,
          eq(emailVerificationTokens.verified, false)
        )
      )
      .returning();
    return result.length;
  },

  // ============================================
  // Login Attempts & Account Lockout
  // ============================================

  // Record a login attempt
  async recordLoginAttempt(data: {
    email: string;
    ipAddress: string;
    userAgent?: string;
    success: boolean;
    failureReason?: string;
  }): Promise<void> {
    await db.insert(loginAttempts).values({
      email: data.email.toLowerCase(),
      ipAddress: data.ipAddress,
      userAgent: data.userAgent || null,
      success: data.success,
      failureReason: data.failureReason || null,
    });
  },

  // Get recent failed login attempts for an email (within last 15 minutes)
  async getRecentFailedAttempts(email: string, windowMinutes: number = 15): Promise<number> {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.email, email.toLowerCase()),
          eq(loginAttempts.success, false),
          sql`${loginAttempts.attemptedAt} > ${windowStart}`
        )
      );
    return Number(result[0]?.count || 0);
  },

  // Check if account is currently locked
  async getAccountLockout(email: string): Promise<AccountLockout | undefined> {
    const [lockout] = await db
      .select()
      .from(accountLockouts)
      .where(
        and(
          eq(accountLockouts.email, email.toLowerCase()),
          sql`${accountLockouts.lockedUntil} > NOW()`
        )
      )
      .orderBy(desc(accountLockouts.lockedAt))
      .limit(1);
    return lockout;
  },

  // Create or update account lockout
  async createAccountLockout(email: string, failedAttempts: number, lockoutMinutes: number, ipAddress?: string): Promise<AccountLockout> {
    const lockedUntil = new Date(Date.now() + lockoutMinutes * 60 * 1000);

    // Delete any existing lockouts for this email
    await db.delete(accountLockouts).where(eq(accountLockouts.email, email.toLowerCase()));

    // Create new lockout
    const [lockout] = await db
      .insert(accountLockouts)
      .values({
        email: email.toLowerCase(),
        lockedUntil,
        failedAttempts,
        lastFailedAt: new Date(),
        ipAddress: ipAddress || null,
      })
      .returning();
    return lockout;
  },

  // Clear account lockout (e.g., after successful login or admin unlock)
  async clearAccountLockout(email: string): Promise<void> {
    await db.delete(accountLockouts).where(eq(accountLockouts.email, email.toLowerCase()));
  },

  // Cleanup old login attempts (older than 30 days)
  async cleanupOldLoginAttempts(daysOld: number = 30): Promise<number> {
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    const result = await db
      .delete(loginAttempts)
      .where(sql`${loginAttempts.attemptedAt} < ${cutoff}`)
      .returning();
    return result.length;
  },

  // Cleanup expired lockouts
  async cleanupExpiredLockouts(): Promise<number> {
    const result = await db
      .delete(accountLockouts)
      .where(sql`${accountLockouts.lockedUntil} < NOW()`)
      .returning();
    return result.length;
  },

  // ============================================
  // User Audit Logs
  // ============================================

  // Create an audit log entry
  async createUserAuditLog(data: {
    auth0UserId: string;
    email: string;
    action: string;
    targetType?: string;
    targetId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<UserAuditLog> {
    const [auditLog] = await db
      .insert(userAuditLogs)
      .values({
        auth0UserId: data.auth0UserId,
        email: data.email.toLowerCase(),
        action: data.action,
        targetType: data.targetType || null,
        targetId: data.targetId || null,
        details: data.details || null,
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null,
      })
      .returning();
    return auditLog;
  },

  // Get audit logs for a user
  async getUserAuditLogs(auth0UserId: string, limit: number = 100): Promise<UserAuditLog[]> {
    return db
      .select()
      .from(userAuditLogs)
      .where(eq(userAuditLogs.auth0UserId, auth0UserId))
      .orderBy(desc(userAuditLogs.createdAt))
      .limit(limit);
  },

  // Get audit logs by action type
  async getAuditLogsByAction(action: string, limit: number = 100): Promise<UserAuditLog[]> {
    return db
      .select()
      .from(userAuditLogs)
      .where(eq(userAuditLogs.action, action))
      .orderBy(desc(userAuditLogs.createdAt))
      .limit(limit);
  },

  // Cleanup old audit logs (keep for 1 year by default)
  async cleanupOldAuditLogs(daysOld: number = 365): Promise<number> {
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    const result = await db
      .delete(userAuditLogs)
      .where(sql`${userAuditLogs.createdAt} < ${cutoff}`)
      .returning();
    return result.length;
  },
};
