-- Migration: Add server billing tables
-- Created: 2026-01-10
-- Description: Creates server_billing and billing_ledger tables for monthly VPS billing

-- Server Billing table
CREATE TABLE IF NOT EXISTS "server_billing" (
  "id" serial PRIMARY KEY NOT NULL,
  "virtfusion_server_id" text NOT NULL UNIQUE,
  "plan_id" integer NOT NULL,
  "auth0_user_id" text NOT NULL,
  "monthly_price_cents" integer NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "next_bill_at" timestamp NOT NULL,
  "suspend_at" timestamp,
  "auto_renew" boolean DEFAULT true NOT NULL,
  "deployed_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Billing Ledger table
CREATE TABLE IF NOT EXISTS "billing_ledger" (
  "id" serial PRIMARY KEY NOT NULL,
  "auth0_user_id" text NOT NULL,
  "virtfusion_server_id" text NOT NULL,
  "idempotency_key" text NOT NULL UNIQUE,
  "amount_cents" integer NOT NULL,
  "description" text NOT NULL,
  "billing_period_start" timestamp NOT NULL,
  "billing_period_end" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS "server_billing_auth0_user_id_idx" ON "server_billing" ("auth0_user_id");
CREATE INDEX IF NOT EXISTS "server_billing_status_idx" ON "server_billing" ("status");
CREATE INDEX IF NOT EXISTS "server_billing_next_bill_at_idx" ON "server_billing" ("next_bill_at");
CREATE INDEX IF NOT EXISTS "billing_ledger_auth0_user_id_idx" ON "billing_ledger" ("auth0_user_id");
CREATE INDEX IF NOT EXISTS "billing_ledger_virtfusion_server_id_idx" ON "billing_ledger" ("virtfusion_server_id");
CREATE INDEX IF NOT EXISTS "billing_ledger_created_at_idx" ON "billing_ledger" ("created_at");
