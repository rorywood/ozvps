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
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  lastActiveAt: timestamp("last_active_at"),
});

export const userFlags = pgTable("user_flags", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  auth0UserId: text("auth0_user_id").notNull().unique(),
  // Blocked = user cannot log in at all
  blocked: boolean("blocked").default(false).notNull(),
  blockedReason: text("blocked_reason"),
  blockedAt: timestamp("blocked_at"),
  // Suspended = user can log in but cannot deploy or control servers (can still view billing)
  suspended: boolean("suspended").default(false).notNull(),
  suspendedReason: text("suspended_reason"),
  suspendedAt: timestamp("suspended_at"),
  suspendedBy: text("suspended_by"), // Admin who suspended
  // Admin can manually verify email, bypassing Auth0's email_verified status
  emailVerifiedOverride: boolean("email_verified_override").default(false).notNull(),
  emailVerifiedOverrideAt: timestamp("email_verified_override_at"),
  emailVerifiedOverrideBy: text("email_verified_override_by"),
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
  popular: boolean("popular").default(false),
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
  profilePictureUrl: text("profile_picture_url"), // User's profile picture URL
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
  virtfusionServerUuid: text("virtfusion_server_uuid"), // Immutable UUID for reliable lookup
  planId: integer("plan_id").notNull(),

  // Billing state
  deployedAt: timestamp("deployed_at").notNull(),
  monthlyPriceCents: integer("monthly_price_cents").notNull(),
  status: text("status").notNull().default("active"), // active, paid, unpaid, suspended, cancelled
  autoRenew: boolean("auto_renew").default(true).notNull(),

  // Billing dates
  nextBillAt: timestamp("next_bill_at").notNull(),
  suspendAt: timestamp("suspend_at"), // Set when unpaid, null otherwise

  // Complimentary server flag - admin can grant free hosting
  freeServer: boolean("free_server").default(false).notNull(),

  // Trial server fields
  isTrial: boolean("is_trial").default(false).notNull(),
  trialExpiresAt: timestamp("trial_expires_at"),
  trialEndedAt: timestamp("trial_ended_at"),

  // Admin suspension - separate from billing suspension
  adminSuspended: boolean("admin_suspended").default(false).notNull(),
  adminSuspendedAt: timestamp("admin_suspended_at"),
  adminSuspendedReason: text("admin_suspended_reason"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Billing ledger - tracks all charges with idempotency
export const billingLedger = pgTable("billing_ledger", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  auth0UserId: text("auth0_user_id").notNull(),
  virtfusionServerId: text("virtfusion_server_id"),
  amountCents: integer("amount_cents").notNull(),
  description: text("description").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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

// Two-Factor Authentication settings
export const twoFactorAuth = pgTable("two_factor_auth", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  auth0UserId: text("auth0_user_id").notNull().unique(),
  secret: text("secret").notNull(), // Base32 encoded TOTP secret (or placeholder for email 2FA)
  enabled: boolean("enabled").default(false).notNull(),
  method: text("method").default("totp").notNull(), // 'totp' or 'email'
  emailOtpCode: text("email_otp_code"), // Current email OTP code (hashed)
  emailOtpExpiresAt: timestamp("email_otp_expires_at"), // When the email OTP expires
  backupCodes: text("backup_codes"), // JSON array of hashed backup codes
  verifiedAt: timestamp("verified_at"), // When 2FA was first verified/enabled
  lastUsedAt: timestamp("last_used_at"), // Last time 2FA was used for login
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Rate limiting table for persistent brute-force protection
export const rateLimits = pgTable("rate_limits", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  limitType: varchar("limit_type", { length: 20 }).notNull(), // 'email', 'ip', 'email_ip_combo'
  limitKey: varchar("limit_key", { length: 255 }).notNull(), // email, IP, or combo key
  attempts: integer("attempts").notNull().default(0),
  windowStart: timestamp("window_start").defaultNow().notNull(),
  lockedUntil: timestamp("locked_until"), // NULL if not locked
  lastAttempt: timestamp("last_attempt").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Password reset tokens table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  email: varchar("email", { length: 255 }).notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  usedAt: timestamp("used_at"),
});

// Email verification tokens table - custom verification flow
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  auth0UserId: text("auth0_user_id").notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  verified: boolean("verified").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  verifiedAt: timestamp("verified_at"),
});

// Support ticket categories (departments)
export const TICKET_CATEGORIES = [
  'sales',
  'accounts',
  'support',
  'abuse',
] as const;
export type TicketCategory = typeof TICKET_CATEGORIES[number];

// Support ticket priorities
export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TicketPriority = typeof TICKET_PRIORITIES[number];

// Support ticket statuses
export const TICKET_STATUSES = [
  'new',
  'open',
  'waiting_user',
  'waiting_admin',
  'resolved',
  'closed',
] as const;
export type TicketStatus = typeof TICKET_STATUSES[number];

// Support tickets - user support requests
export const tickets = pgTable("tickets", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  auth0UserId: text("auth0_user_id"), // nullable for guest tickets
  guestEmail: text("guest_email"), // email for guest tickets (when auth0UserId is null)
  guestAccessToken: text("guest_access_token"), // unique token for guest ticket access
  title: text("title").notNull(),
  category: text("category").notNull().default("support"), // sales, accounts, support, abuse
  priority: text("priority").notNull().default("normal"), // low, normal, high, urgent
  status: text("status").notNull().default("new"), // new, open, waiting_user, waiting_admin, resolved, closed
  virtfusionServerId: text("virtfusion_server_id"), // nullable - affected server
  assignedAdminId: text("assigned_admin_id"), // nullable - assigned admin auth0 user id
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"), // when ticket was marked as resolved (for 7-day auto-close)
  closedAt: timestamp("closed_at"),
});

// Support ticket messages - conversation thread
export const ticketMessages = pgTable("ticket_messages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  ticketId: integer("ticket_id").notNull(),
  authorType: text("author_type").notNull(), // user, admin
  authorId: text("author_id").notNull(), // auth0 user id
  authorEmail: text("author_email").notNull(),
  authorName: text("author_name"),
  message: text("message").notNull(),
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

// Insert schemas - simplified without .omit() to avoid drizzle-zod type issues
export const insertPlanSchema = createInsertSchema(plans);
export const insertWalletSchema = createInsertSchema(wallets);
export const insertWalletTransactionSchema = createInsertSchema(walletTransactions);
export const insertDeployOrderSchema = createInsertSchema(deployOrders);
export const insertServerBillingSchema = createInsertSchema(serverBilling);
export const insertBillingLedgerSchema = createInsertSchema(billingLedger);
export const insertServerCancellationSchema = createInsertSchema(serverCancellations);
export const insertSecuritySettingSchema = createInsertSchema(securitySettings);
export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLogs);
export const insertInvoiceSchema = createInsertSchema(invoices);
export const insertTicketSchema = createInsertSchema(tickets);
export const insertTicketMessageSchema = createInsertSchema(ticketMessages);
export const insertTwoFactorAuthSchema = createInsertSchema(twoFactorAuth);
export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens);
export const insertEmailVerificationTokenSchema = createInsertSchema(emailVerificationTokens);

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
export type BillingLedger = typeof billingLedger.$inferSelect;
export type InsertBillingLedger = z.infer<typeof insertBillingLedgerSchema>;
export type ServerCancellation = typeof serverCancellations.$inferSelect;
export type InsertServerCancellation = z.infer<typeof insertServerCancellationSchema>;
export type SecuritySetting = typeof securitySettings.$inferSelect;
export type InsertSecuritySetting = z.infer<typeof insertSecuritySettingSchema>;
export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type InsertAdminAuditLog = z.infer<typeof insertAdminAuditLogSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Ticket = typeof tickets.$inferSelect;
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type TicketMessage = typeof ticketMessages.$inferSelect;
export type InsertTicketMessage = z.infer<typeof insertTicketMessageSchema>;
export type TwoFactorAuth = typeof twoFactorAuth.$inferSelect;
export type InsertTwoFactorAuth = z.infer<typeof insertTwoFactorAuthSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type InsertEmailVerificationToken = z.infer<typeof insertEmailVerificationTokenSchema>;

// Password requirements validation schema - used for registration and password changes
export const passwordRequirementsSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be 128 characters or less')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: passwordRequirementsSchema,
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
  .max(253, 'Hostname must be 253 characters or less')
  .transform(val => val.trim())
  .refine(val => {
    const labels = val.split('.');
    for (const label of labels) {
      if (label.length === 0) return false;
      if (label.length > 63) return false;
      if (label.length === 1 && !/^[a-zA-Z0-9]$/.test(label)) return false;
      if (label.length > 1 && !/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label)) return false;
    }
    return true;
  }, 'Hostname must start and end with a letter or number, and contain only letters, numbers, hyphens, and dots');

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
  FORCE_LOGOUT: 'FORCE_LOGOUT',
  NEW_LOGIN: 'NEW_LOGIN',
  SECURITY_VIOLATION: 'SECURITY_VIOLATION',
} as const;

export type SessionRevokeReason = typeof SESSION_REVOKE_REASONS[keyof typeof SESSION_REVOKE_REASONS];

// Validation schemas for support tickets
export const createTicketSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200, 'Title must be 200 characters or less'),
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(TICKET_PRIORITIES).default('normal'),
  description: z.string().min(10, 'Description must be at least 10 characters').max(10000, 'Description must be 10000 characters or less'),
  virtfusionServerId: z.string().optional(),
});

export const ticketMessageSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(10000, 'Message must be 10000 characters or less'),
});

export const adminTicketUpdateSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  category: z.enum(TICKET_CATEGORIES).optional(),
  assignedAdminId: z.string().nullable().optional(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type TicketMessageInput = z.infer<typeof ticketMessageSchema>;
export type AdminTicketUpdateInput = z.infer<typeof adminTicketUpdateSchema>;

// ============================================
// ADMIN PANEL TABLES
// ============================================

// Admin IP Whitelist - controls access to admin panel
export const adminIpWhitelist = pgTable("admin_ip_whitelist", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  ipAddress: text("ip_address").notNull(),
  cidr: text("cidr"), // Optional CIDR notation (e.g., /24, /32)
  label: text("label").notNull(), // "Office", "Home", etc.
  addedBy: text("added_by").notNull(), // Auth0 user ID who added this entry
  addedByEmail: text("added_by_email").notNull(),
  expiresAt: timestamp("expires_at"), // Optional expiration
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Admin Sessions - separate from customer sessions for security
export const adminSessions = pgTable("admin_sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  auth0UserId: text("auth0_user_id").notNull(),
  email: text("email").notNull(),
  name: text("name"),
  ipAddress: text("ip_address").notNull(), // Session bound to IP
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
  revokedReason: text("revoked_reason"),
});

// Insert schemas for admin tables
export const insertAdminIpWhitelistSchema = createInsertSchema(adminIpWhitelist);
export const insertAdminSessionSchema = createInsertSchema(adminSessions);

// Types for admin tables
export type AdminIpWhitelist = typeof adminIpWhitelist.$inferSelect;
export type InsertAdminIpWhitelist = z.infer<typeof insertAdminIpWhitelistSchema>;
export type AdminSession = typeof adminSessions.$inferSelect;
export type InsertAdminSession = z.infer<typeof insertAdminSessionSchema>;

// Validation schema for adding IP to whitelist
export const addIpWhitelistSchema = z.object({
  ipAddress: z.string().min(7, 'IP address is required'),
  cidr: z.string().optional(),
  label: z.string().min(1, 'Label is required').max(100, 'Label must be 100 characters or less'),
  expiresAt: z.string().datetime().optional(),
});

export type AddIpWhitelistInput = z.infer<typeof addIpWhitelistSchema>;

// ============================================
// PROMOTIONAL CODES
// ============================================

// Promo codes table - discount codes for server deployments
export const promoCodes = pgTable("promo_codes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  code: text("code").notNull().unique(), // Stored uppercase
  discountType: text("discount_type").notNull(), // 'percentage' | 'fixed'
  discountValue: integer("discount_value").notNull(), // % (0-100) or cents
  appliesTo: text("applies_to").notNull().default("all"), // 'all' | 'specific'
  planIds: jsonb("plan_ids"), // Array of plan IDs if 'specific'
  maxUsesTotal: integer("max_uses_total"), // null = unlimited
  maxUsesPerUser: integer("max_uses_per_user").default(1),
  currentUses: integer("current_uses").notNull().default(0),
  validFrom: timestamp("valid_from").defaultNow().notNull(),
  validUntil: timestamp("valid_until"), // null = no expiry
  active: boolean("active").default(true).notNull(),
  createdBy: text("created_by").notNull(), // Admin auth0UserId
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Promo code usage tracking - records each use of a promo code
export const promoCodeUsage = pgTable("promo_code_usage", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  promoCodeId: integer("promo_code_id").notNull(),
  auth0UserId: text("auth0_user_id").notNull(),
  deployOrderId: integer("deploy_order_id"),
  discountAppliedCents: integer("discount_applied_cents").notNull(),
  originalPriceCents: integer("original_price_cents").notNull(),
  finalPriceCents: integer("final_price_cents").notNull(),
  usedAt: timestamp("used_at").defaultNow().notNull(),
});

// Insert schemas for promo codes
export const insertPromoCodeSchema = createInsertSchema(promoCodes);
export const insertPromoCodeUsageSchema = createInsertSchema(promoCodeUsage);

// Types for promo codes
export type PromoCode = typeof promoCodes.$inferSelect;
export type InsertPromoCode = z.infer<typeof insertPromoCodeSchema>;
export type PromoCodeUsage = typeof promoCodeUsage.$inferSelect;
export type InsertPromoCodeUsage = z.infer<typeof insertPromoCodeUsageSchema>;

// Validation schema for creating/updating promo codes
export const createPromoCodeSchema = z.object({
  code: z.string().min(3, 'Code must be at least 3 characters').max(20, 'Code must be 20 characters or less').transform(val => val.toUpperCase()),
  discountType: z.enum(['percentage', 'fixed']),
  discountValue: z.number().positive('Discount value must be positive'),
  appliesTo: z.enum(['all', 'specific']).default('all'),
  planIds: z.array(z.number()).optional(),
  maxUsesTotal: z.number().positive().optional().nullable(),
  maxUsesPerUser: z.number().positive().default(1),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional().nullable(),
  active: z.boolean().default(true),
});

export const updatePromoCodeSchema = createPromoCodeSchema.partial().omit({ code: true });

export type CreatePromoCodeInput = z.infer<typeof createPromoCodeSchema>;
export type UpdatePromoCodeInput = z.infer<typeof updatePromoCodeSchema>;

// Login attempts - tracks failed logins for account lockout
export const loginAttempts = pgTable("login_attempts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  email: text("email").notNull(),
  ipAddress: text("ip_address").notNull(),
  userAgent: text("user_agent"),
  success: boolean("success").notNull().default(false),
  failureReason: text("failure_reason"), // invalid_password, account_locked, 2fa_failed, etc.
  attemptedAt: timestamp("attempted_at").defaultNow().notNull(),
});

// Account lockouts - temporary lockouts after failed login attempts
export const accountLockouts = pgTable("account_lockouts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  email: text("email").notNull(),
  lockedAt: timestamp("locked_at").defaultNow().notNull(),
  lockedUntil: timestamp("locked_until").notNull(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lastFailedAt: timestamp("last_failed_at"),
  ipAddress: text("ip_address"),
});

// User audit logs - tracks sensitive user actions for security
export const userAuditLogs = pgTable("user_audit_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  auth0UserId: text("auth0_user_id").notNull(),
  email: text("email").notNull(),
  action: text("action").notNull(), // login, logout, password_change, 2fa_enable, 2fa_disable, server_delete, etc.
  targetType: text("target_type"), // server, account, 2fa, session, etc.
  targetId: text("target_id"),
  details: jsonb("details"), // Additional details about the action
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type AccountLockout = typeof accountLockouts.$inferSelect;
export type UserAuditLog = typeof userAuditLogs.$inferSelect;
