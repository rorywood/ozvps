import { pgTable, text, varchar, timestamp, integer, boolean, uuid, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Maps Auth0 users to VirtFusion users
export const userMappings = pgTable("user_mappings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  auth0UserId: text("auth0_user_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  virtFusionUserId: integer("virtfusion_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Legacy users table (no longer used with Auth0)
export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  virtFusionUserId: integer("virtfusion_user_id"),
  extRelationId: text("ext_relation_id"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: integer("user_id"),
  auth0UserId: text("auth0_user_id"),
  virtFusionUserId: integer("virtfusion_user_id"),
  extRelationId: text("ext_relation_id"),
  email: text("email").notNull(),
  name: text("name"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
  revokedReason: text("revoked_reason"),
});

export const userFlags = pgTable("user_flags", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  auth0UserId: text("auth0_user_id").notNull().unique(),
  blocked: boolean("blocked").default(false).notNull(),
  blockedReason: text("blocked_reason"),
  blockedAt: timestamp("blocked_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Plans table - VPS packages available for deployment
export const plans = pgTable("plans", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  vcpu: integer("vcpu").notNull(),
  ramMb: integer("ram_mb").notNull(),
  storageGb: integer("storage_gb").notNull(),
  transferGb: integer("transfer_gb").notNull(),
  priceMonthly: integer("price_monthly_cents").notNull(),
  virtfusionPackageId: integer("virtfusion_package_id"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Wallets table - user account balance
export const wallets = pgTable("wallets", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  auth0UserId: text("auth0_user_id").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id").unique(),
  balanceCents: integer("balance_cents").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Wallet transactions - credits, debits, refunds
export const walletTransactions = pgTable("wallet_transactions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  auth0UserId: text("auth0_user_id").notNull(),
  type: text("type").notNull(), // topup, debit, refund, adjustment
  amountCents: integer("amount_cents").notNull(), // signed: positive for credits, negative for debits
  stripeEventId: text("stripe_event_id").unique(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeSessionId: text("stripe_session_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Deploy orders - server provisioning requests
export const deployOrders = pgTable("deploy_orders", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  auth0UserId: text("auth0_user_id").notNull(),
  planId: integer("plan_id").notNull(),
  locationCode: text("location_code").notNull().default("BNE"),
  hostname: text("hostname"),
  priceCents: integer("price_cents").notNull(),
  status: text("status").notNull().default("pending_payment"), // pending_payment, paid, provisioning, active, failed, cancelled
  virtfusionServerId: integer("virtfusion_server_id"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Server cancellation requests - grace period (30 days) or immediate (5 mins) before deletion
export const serverCancellations = pgTable("server_cancellations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  auth0UserId: text("auth0_user_id").notNull(),
  virtfusionServerId: text("virtfusion_server_id").notNull(),
  serverName: text("server_name"),
  reason: text("reason"),
  mode: text("mode").notNull().default("grace"), // grace (30 days), immediate (5 mins)
  status: text("status").notNull().default("pending"), // pending, revoked, completed, failed
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  scheduledDeletionAt: timestamp("scheduled_deletion_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"), // stores error if deletion fails
});

// Relations
export const walletsRelations = relations(wallets, ({ many }) => ({
  transactions: many(walletTransactions),
}));

export const walletTransactionsRelations = relations(walletTransactions, ({ one }) => ({
  wallet: one(wallets, {
    fields: [walletTransactions.auth0UserId],
    references: [wallets.auth0UserId],
  }),
}));

export const deployOrdersRelations = relations(deployOrders, ({ one }) => ({
  plan: one(plans, {
    fields: [deployOrders.planId],
    references: [plans.id],
  }),
}));

// Insert schemas
export const insertPlanSchema = createInsertSchema(plans).omit({ id: true, createdAt: true });
export const insertWalletSchema = createInsertSchema(wallets).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWalletTransactionSchema = createInsertSchema(walletTransactions).omit({ id: true, createdAt: true });
export const insertDeployOrderSchema = createInsertSchema(deployOrders).omit({ id: true, createdAt: true, updatedAt: true });
export const insertServerCancellationSchema = createInsertSchema(serverCancellations).omit({ id: true, requestedAt: true, revokedAt: true, completedAt: true });

// Types
export type Plan = typeof plans.$inferSelect;
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Wallet = typeof wallets.$inferSelect;
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type InsertWalletTransaction = z.infer<typeof insertWalletTransactionSchema>;
export type DeployOrder = typeof deployOrders.$inferSelect;
export type InsertDeployOrder = z.infer<typeof insertDeployOrderSchema>;
export type ServerCancellation = typeof serverCancellations.$inferSelect;
export type InsertServerCancellation = z.infer<typeof insertServerCancellationSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').optional(),
});

export const serverNameSchema = z.object({
  name: z.string()
    .min(2, 'Server name must be at least 2 characters')
    .max(48, 'Server name must be 48 characters or less')
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9\s\-_.]*$/, 'Server name can only contain letters, numbers, spaces, hyphens, underscores, and periods'),
});

export const hostnameSchema = z.string()
  .min(1, 'Hostname is required')
  .max(63, 'Hostname must be 63 characters or less')
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Hostname must be lowercase, start and end with a letter or number, and contain only letters, numbers, and hyphens')
  .transform(val => val.toLowerCase().trim());

export const reinstallSchema = z.object({
  osId: z.union([z.string(), z.number()]).refine(val => val !== '' && val !== null, 'OS template is required'),
  hostname: hostnameSchema,
});

export type User = typeof users.$inferSelect;
export type UserMapping = typeof userMappings.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type UserFlags = typeof userFlags.$inferSelect;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ServerNameInput = z.infer<typeof serverNameSchema>;
export type ReinstallInput = z.infer<typeof reinstallSchema>;

export const SESSION_REVOKE_REASONS = {
  CONCURRENT_LOGIN: 'CONCURRENT_LOGIN',
  USER_BLOCKED: 'USER_BLOCKED',
  ADMIN_REVOKED: 'ADMIN_REVOKED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  IDLE_TIMEOUT: 'IDLE_TIMEOUT',
  ALREADY_LOGGED_IN: 'ALREADY_LOGGED_IN',
  USER_DELETED: 'USER_DELETED',
} as const;

export type SessionRevokeReason = typeof SESSION_REVOKE_REASONS[keyof typeof SESSION_REVOKE_REASONS];
