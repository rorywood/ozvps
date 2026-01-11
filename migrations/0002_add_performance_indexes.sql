-- Migration: Add performance indexes
-- Created: 2026-01-11
-- Description: Adds indexes for frequently queried columns to improve query performance

-- Wallets table indexes
CREATE INDEX IF NOT EXISTS "idx_wallets_auth0_user_id" ON "wallets" ("auth0_user_id");
CREATE INDEX IF NOT EXISTS "idx_wallets_stripe_customer_id" ON "wallets" ("stripe_customer_id") WHERE "stripe_customer_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_wallets_active" ON "wallets" ("auth0_user_id") WHERE "deleted_at" IS NULL;

-- Wallet transactions indexes
CREATE INDEX IF NOT EXISTS "idx_wallet_transactions_auth0_user_id" ON "wallet_transactions" ("auth0_user_id");
CREATE INDEX IF NOT EXISTS "idx_wallet_transactions_created_at" ON "wallet_transactions" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_wallet_transactions_user_created" ON "wallet_transactions" ("auth0_user_id", "created_at" DESC);

-- Server billing indexes
CREATE INDEX IF NOT EXISTS "idx_server_billing_auth0_user_id" ON "server_billing" ("auth0_user_id");
CREATE INDEX IF NOT EXISTS "idx_server_billing_virtfusion_server_id" ON "server_billing" ("virtfusion_server_id");
CREATE INDEX IF NOT EXISTS "idx_server_billing_status" ON "server_billing" ("status");
CREATE INDEX IF NOT EXISTS "idx_server_billing_next_bill_at" ON "server_billing" ("next_bill_at") WHERE "status" = 'active';

-- Sessions indexes
CREATE INDEX IF NOT EXISTS "idx_sessions_auth0_user_id" ON "sessions" ("auth0_user_id");
CREATE INDEX IF NOT EXISTS "idx_sessions_expires_at" ON "sessions" ("expires_at");
CREATE INDEX IF NOT EXISTS "idx_sessions_active" ON "sessions" ("auth0_user_id", "expires_at") WHERE "revoked_at" IS NULL;

-- Tickets indexes
CREATE INDEX IF NOT EXISTS "idx_tickets_auth0_user_id" ON "tickets" ("auth0_user_id");
CREATE INDEX IF NOT EXISTS "idx_tickets_status" ON "tickets" ("status");
CREATE INDEX IF NOT EXISTS "idx_tickets_user_status" ON "tickets" ("auth0_user_id", "status");
CREATE INDEX IF NOT EXISTS "idx_tickets_created_at" ON "tickets" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_tickets_last_message_at" ON "tickets" ("last_message_at" DESC);

-- Ticket messages indexes
CREATE INDEX IF NOT EXISTS "idx_ticket_messages_ticket_id" ON "ticket_messages" ("ticket_id");
CREATE INDEX IF NOT EXISTS "idx_ticket_messages_created_at" ON "ticket_messages" ("ticket_id", "created_at");

-- Deploy orders indexes
CREATE INDEX IF NOT EXISTS "idx_deploy_orders_auth0_user_id" ON "deploy_orders" ("auth0_user_id");
CREATE INDEX IF NOT EXISTS "idx_deploy_orders_status" ON "deploy_orders" ("status");

-- Server cancellations indexes
CREATE INDEX IF NOT EXISTS "idx_server_cancellations_auth0_user_id" ON "server_cancellations" ("auth0_user_id");
CREATE INDEX IF NOT EXISTS "idx_server_cancellations_status" ON "server_cancellations" ("status");
CREATE INDEX IF NOT EXISTS "idx_server_cancellations_pending" ON "server_cancellations" ("scheduled_deletion_at") WHERE "status" = 'pending';

-- Invoices indexes
CREATE INDEX IF NOT EXISTS "idx_invoices_auth0_user_id" ON "invoices" ("auth0_user_id");
CREATE INDEX IF NOT EXISTS "idx_invoices_created_at" ON "invoices" ("created_at" DESC);

-- Admin audit logs indexes
CREATE INDEX IF NOT EXISTS "idx_admin_audit_logs_admin_id" ON "admin_audit_logs" ("admin_auth0_user_id");
CREATE INDEX IF NOT EXISTS "idx_admin_audit_logs_created_at" ON "admin_audit_logs" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_admin_audit_logs_target" ON "admin_audit_logs" ("target_type", "target_id");

-- User mappings indexes (auth0_user_id already unique, add virtfusion_user_id)
CREATE INDEX IF NOT EXISTS "idx_user_mappings_virtfusion_user_id" ON "user_mappings" ("virtfusion_user_id");

-- Security settings index (key already unique)
-- No additional indexes needed

-- Billing ledger indexes
CREATE INDEX IF NOT EXISTS "idx_billing_ledger_auth0_user_id" ON "billing_ledger" ("auth0_user_id");
CREATE INDEX IF NOT EXISTS "idx_billing_ledger_server_id" ON "billing_ledger" ("virtfusion_server_id");
