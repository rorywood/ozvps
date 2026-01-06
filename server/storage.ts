import { randomBytes } from "crypto";
import { SessionRevokeReason, plans, wallets, walletTransactions, deployOrders, type Plan, type InsertPlan, type Wallet, type InsertWallet, type WalletTransaction, type InsertWalletTransaction, type DeployOrder, type InsertDeployOrder } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";

export interface Session {
  id: string;
  userId?: number | null;
  auth0UserId?: string | null;
  virtFusionUserId?: number | null;
  extRelationId?: string | null;
  email: string;
  name?: string | null;
  expiresAt: Date;
  revokedAt?: Date | null;
  revokedReason?: string | null;
  lastActivityAt: Date;
}

export interface UserFlags {
  auth0UserId: string;
  blocked: boolean;
  blockedReason?: string | null;
  blockedAt?: Date | null;
}

export interface IStorage {
  createSession(data: {
    visitorId?: number;
    auth0UserId?: string;
    virtFusionUserId?: number;
    extRelationId?: string;
    email: string;
    name?: string;
    expiresAt: Date;
  }): Promise<Session>;
  getSession(id: string): Promise<Session | undefined>;
  deleteSession(id: string): Promise<void>;
  deleteUserSessions(userId: number): Promise<void>;
  deleteSessionsByAuth0UserId(auth0UserId: string): Promise<void>;
  revokeSessionsByAuth0UserId(auth0UserId: string, reason: SessionRevokeReason): Promise<void>;
  hasActiveSession(auth0UserId: string, idleTimeoutMs: number): Promise<boolean>;
  revokeIdleSessions(auth0UserId: string, idleTimeoutMs: number, reason: SessionRevokeReason): Promise<void>;
  updateSessionActivity(sessionId: string): Promise<void>;
  getUserFlags(auth0UserId: string): Promise<UserFlags | undefined>;
  setUserBlocked(auth0UserId: string, blocked: boolean, reason?: string): Promise<void>;
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
    expiresAt: Date;
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
      expiresAt: data.expiresAt,
      revokedAt: null,
      revokedReason: null,
      lastActivityAt: now,
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

  async revokeSessionsByAuth0UserId(auth0UserId: string, reason: SessionRevokeReason): Promise<void> {
    this.sessions.forEach((session) => {
      if (session.auth0UserId === auth0UserId && !session.revokedAt) {
        session.revokedAt = new Date();
        session.revokedReason = reason;
      }
    });
  }

  async hasActiveSession(auth0UserId: string, idleTimeoutMs: number): Promise<boolean> {
    const now = new Date();
    for (const session of this.sessions.values()) {
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
}

export const storage = new MemoryStorage();

// Database storage for plans, wallets, and deploy orders
export const dbStorage = {
  // Plans
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

  async upsertPlan(plan: InsertPlan): Promise<Plan> {
    const existing = await this.getPlanByCode(plan.code);
    if (existing) {
      const [updated] = await db
        .update(plans)
        .set(plan)
        .where(eq(plans.code, plan.code))
        .returning();
      return updated;
    }
    const [created] = await db.insert(plans).values(plan).returning();
    return created;
  },

  async syncPlansFromVirtFusion(packages: Array<{
    id: number;
    code: string;
    name: string;
    cpuCores: number;
    memory: number;
    primaryStorage: number;
    traffic: number;
    enabled: boolean;
    prices?: Array<{ price: number; billingPeriod?: string }>;
  }>): Promise<{ synced: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;

    for (const pkg of packages) {
      try {
        // Find monthly price (default to 0 if not found)
        const monthlyPrice = pkg.prices?.find(p => 
          p.billingPeriod === 'monthly' || p.billingPeriod === 'month' || !p.billingPeriod
        );
        const priceMonthly = monthlyPrice?.price || 0;

        await this.upsertPlan({
          code: pkg.code,
          name: pkg.name,
          vcpu: pkg.cpuCores,
          ramMb: pkg.memory,
          storageGb: pkg.primaryStorage,
          transferGb: pkg.traffic,
          priceMonthly,
          virtfusionPackageId: pkg.id,
          active: pkg.enabled,
        });
        synced++;
      } catch (error: any) {
        errors.push(`Failed to sync package ${pkg.code}: ${error.message}`);
      }
    }

    return { synced, errors };
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

  async getWalletByStripeCustomerId(stripeCustomerId: string): Promise<Wallet | undefined> {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.stripeCustomerId, stripeCustomerId));
    return wallet;
  },

  async creditWallet(auth0UserId: string, amountCents: number, transaction: Omit<InsertWalletTransaction, 'auth0UserId' | 'amountCents'>): Promise<Wallet> {
    // Check for idempotency using stripeEventId
    if (transaction.stripeEventId) {
      const [existing] = await db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.stripeEventId, transaction.stripeEventId));
      if (existing) {
        // Already processed, return current wallet
        return await this.getOrCreateWallet(auth0UserId);
      }
    }

    // Create wallet if doesn't exist
    await this.getOrCreateWallet(auth0UserId);

    // Insert transaction
    await db.insert(walletTransactions).values({
      auth0UserId,
      amountCents,
      ...transaction,
    });

    // Update wallet balance
    const [updated] = await db
      .update(wallets)
      .set({
        balanceCents: sql`${wallets.balanceCents} + ${amountCents}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.auth0UserId, auth0UserId))
      .returning();

    return updated;
  },

  async debitWallet(auth0UserId: string, amountCents: number, metadata?: Record<string, unknown>): Promise<{ success: boolean; wallet?: Wallet; error?: string }> {
    const wallet = await this.getOrCreateWallet(auth0UserId);
    
    if (wallet.balanceCents < amountCents) {
      return { success: false, error: 'Insufficient balance' };
    }

    // Insert debit transaction
    await db.insert(walletTransactions).values({
      auth0UserId,
      type: 'debit',
      amountCents: -amountCents,
      metadata: metadata || null,
    });

    // Update wallet balance
    const [updated] = await db
      .update(wallets)
      .set({
        balanceCents: sql`${wallets.balanceCents} - ${amountCents}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.auth0UserId, auth0UserId))
      .returning();

    return { success: true, wallet: updated };
  },

  async refundToWallet(auth0UserId: string, amountCents: number, metadata?: Record<string, unknown>): Promise<Wallet> {
    await this.getOrCreateWallet(auth0UserId);

    await db.insert(walletTransactions).values({
      auth0UserId,
      type: 'refund',
      amountCents,
      metadata: metadata || null,
    });

    const [updated] = await db
      .update(wallets)
      .set({
        balanceCents: sql`${wallets.balanceCents} + ${amountCents}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.auth0UserId, auth0UserId))
      .returning();

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

  // Deploy Orders
  async createDeployOrder(order: InsertDeployOrder): Promise<DeployOrder> {
    const [created] = await db.insert(deployOrders).values(order).returning();
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

  // Combined: debit wallet + create order in transaction
  async createDeployWithDebit(
    auth0UserId: string,
    planId: number,
    priceCents: number,
    hostname?: string
  ): Promise<{ success: boolean; order?: DeployOrder; error?: string }> {
    const wallet = await this.getOrCreateWallet(auth0UserId);
    
    if (wallet.balanceCents < priceCents) {
      return { success: false, error: 'Insufficient balance' };
    }

    // Create order first
    const order = await this.createDeployOrder({
      auth0UserId,
      planId,
      locationCode: 'BNE',
      hostname,
      priceCents,
      status: 'paid',
    });

    // Debit wallet
    await db.insert(walletTransactions).values({
      auth0UserId,
      type: 'debit',
      amountCents: -priceCents,
      metadata: { deployOrderId: order.id },
    });

    await db
      .update(wallets)
      .set({
        balanceCents: sql`${wallets.balanceCents} - ${priceCents}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.auth0UserId, auth0UserId));

    return { success: true, order };
  },
};
