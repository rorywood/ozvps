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
  virtFusionUserId: integer("virtfusion_user_id"),
  balanceCents: integer("balance_cents").notNull().default(0),
  autoTopupEnabled: boolean("auto_topup_enabled").default(false).notNull(),
  autoTopupThresholdCents: integer("auto_topup_threshold_cents").default(500),
  autoTopupAmountCents: integer("auto_topup_amount_cents").default(2000),
  autoTopupPaymentMethodId: text("auto_topup_payment_method_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
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

// Server billing status - tracks billing state for each server
export const serverBilling = pgTable("server_billing", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  auth0UserId: text("auth0_user_id").notNull(),
  virtfusionServerId: text("virtfusion_server_id").notNull().unique(),
  planId: integer("plan_id").notNull(),
  status: text("status").notNull().default("active"), // active, overdue, suspended, cancelled
  lastBilledAt: timestamp("last_billed_at"),
  nextBillingAt: timestamp("next_billing_at").notNull(),
  overdueAt: timestamp("overdue_at"),
  overdueSince: timestamp("overdue_since"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Security settings - admin-configurable security options including reCAPTCHA
export const securitySettings = pgTable("security_settings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  key: text("key").notNull().unique(),
  value: text("value"),
  enabled: boolean("enabled").default(false).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Admin audit logs - tracks all admin actions for security and accountability
export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  adminAuth0UserId: text("admin_auth0_user_id").notNull(),
  adminEmail: text("admin_email").notNull(),
  action: text("action").notNull(), // e.g., server.power.stop, user.credit.adjust, server.delete
  targetType: text("target_type").notNull(), // server, user, hypervisor, ip_block, etc.
  targetId: text("target_id"), // ID of the target entity
  targetLabel: text("target_label"), // Human-readable label (e.g., server name, user email)
  payload: jsonb("payload"), // Request payload/parameters
  result: jsonb("result"), // Response or result summary
  status: text("status").notNull().default("success"), // success, failure, pending
  errorMessage: text("error_message"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  reason: text("reason"), // Admin-provided reason for the action (required for destructive actions)
  createdAt: timestamp("created_at").defaultNow().notNull(),
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

// Invoices - generated for wallet top-ups
export const invoices = pgTable("invoices", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  auth0UserId: text("auth0_user_id").notNull(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  amountCents: integer("amount_cents").notNull(),
  description: text("description").notNull(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeSessionId: text("stripe_session_id"),
  walletTransactionId: integer("wallet_transaction_id"),
  status: text("status").notNull().default("paid"), // paid, pending, void
  customerEmail: text("customer_email").notNull(),
  customerName: text("customer_name"),
  pdfPath: text("pdf_path"), // path to generated PDF
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
export const insertServerBillingSchema = createInsertSchema(serverBilling).omit({ id: true, createdAt: true, updatedAt: true });
export const insertServerCancellationSchema = createInsertSchema(serverCancellations).omit({ id: true, requestedAt: true, revokedAt: true, completedAt: true });
export const insertSecuritySettingSchema = createInsertSchema(securitySettings).omit({ id: true, updatedAt: true });
export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLogs).omit({ id: true, createdAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });

// Types
export type Plan = typeof plans.$inferSelect;
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Wallet = typeof wallets.$inferSelect;
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type InsertWalletTransaction = z.infer<typeof insertWalletTransactionSchema>;
export type DeployOrder = typeof deployOrders.$inferSelect;
export type InsertDeployOrder = z.infer<typeof insertDeployOrderSchema>;
export type ServerBilling = typeof serverBilling.$inferSelect;
export type InsertServerBilling = z.infer<typeof insertServerBillingSchema>;
export type ServerCancellation = typeof serverCancellations.$inferSelect;
export type InsertServerCancellation = z.infer<typeof insertServerCancellationSchema>;
export type SecuritySetting = typeof securitySettings.$inferSelect;
export type InsertSecuritySetting = z.infer<typeof insertSecuritySettingSchema>;
export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type InsertAdminAuditLog = z.infer<typeof insertAdminAuditLogSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').optional(),
  recaptchaToken: z.string().optional(),
});

export const serverNameSchema = z.object({
  name: z.string()
    .min(3, 'Server name must be at least 3 characters')
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
