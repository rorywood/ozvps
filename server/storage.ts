import { randomBytes } from "crypto";
import { SessionRevokeReason, plans, wallets, walletTransactions, deployOrders, serverCancellations, type Plan, type InsertPlan, type Wallet, type InsertWallet, type WalletTransaction, type InsertWalletTransaction, type DeployOrder, type InsertDeployOrder, type ServerCancellation, type InsertServerCancellation } from "@shared/schema";
import { STATIC_PLANS } from "@shared/plans";
import { db } from "./db";
import { eq, desc, and, sql, inArray } from "drizzle-orm";

export interface Session {
  id: string;
  userId?: number | null;
  auth0UserId?: string | null;
  virtFusionUserId?: number | null;
  extRelationId?: string | null;
  email: string;
  name?: string | null;
  isAdmin?: boolean;
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
    isAdmin?: boolean;
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
    isAdmin?: boolean;
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
      isAdmin: data.isAdmin || false,
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
    // Use virtfusionPackageId as the primary lookup for synced plans
    if (plan.virtfusionPackageId) {
      const [existingByVfId] = await db
        .select()
        .from(plans)
        .where(eq(plans.virtfusionPackageId, plan.virtfusionPackageId));
      
      if (existingByVfId) {
        // Preserve existing price if the new price is 0 (VirtFusion doesn't provide pricing)
        const updateData = { ...plan };
        if (plan.priceMonthly === 0 && existingByVfId.priceMonthly && existingByVfId.priceMonthly > 0) {
          updateData.priceMonthly = existingByVfId.priceMonthly;
        }
        // Preserve manually-disabled plans (don't re-enable from VirtFusion sync)
        if (existingByVfId.active === false) {
          updateData.active = false;
        }
        
        const [updated] = await db
          .update(plans)
          .set(updateData)
          .where(eq(plans.virtfusionPackageId, plan.virtfusionPackageId))
          .returning();
        return updated;
      }
    }
    
    // Fallback to code lookup for manually created plans
    const existing = await this.getPlanByCode(plan.code);
    if (existing) {
      // Preserve existing price if the new price is 0
      const updateData = { ...plan };
      if (plan.priceMonthly === 0 && existing.priceMonthly && existing.priceMonthly > 0) {
        updateData.priceMonthly = existing.priceMonthly;
      }
      // Preserve manually-disabled plans
      if (existing.active === false) {
        updateData.active = false;
      }
      
      const [updated] = await db
        .update(plans)
        .set(updateData)
        .where(eq(plans.code, plan.code))
        .returning();
      return updated;
    }
    const [created] = await db.insert(plans).values(plan).returning();
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

  async getWalletByStripeCustomerId(stripeCustomerId: string): Promise<Wallet | undefined> {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.stripeCustomerId, stripeCustomerId));
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
    hostname?: string
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

    // Insert debit transaction
    await db.insert(walletTransactions).values({
      auth0UserId,
      type: 'debit',
      amountCents: -priceCents,
      metadata: { deployOrderId: order.id },
    });

    return { success: true, order };
  },

  // Server Cancellation methods
  async createCancellationRequest(data: InsertServerCancellation): Promise<ServerCancellation> {
    const [cancellation] = await db.insert(serverCancellations).values(data).returning();
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
};
