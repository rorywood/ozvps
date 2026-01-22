-- Migration: Add promo codes tables
-- Created: 2026-01-22

-- Promo codes table - discount codes for server deployments
CREATE TABLE IF NOT EXISTS "promo_codes" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "code" text NOT NULL UNIQUE,
  "discount_type" text NOT NULL,
  "discount_value" integer NOT NULL,
  "applies_to" text NOT NULL DEFAULT 'all',
  "plan_ids" jsonb,
  "valid_from" timestamp DEFAULT now() NOT NULL,
  "valid_until" timestamp,
  "max_uses_total" integer,
  "max_uses_per_user" integer DEFAULT 1,
  "current_uses" integer NOT NULL DEFAULT 0,
  "active" boolean NOT NULL DEFAULT true,
  "created_by" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Index for looking up promo codes by code
CREATE INDEX IF NOT EXISTS "idx_promo_codes_code" ON "promo_codes" ("code");
CREATE INDEX IF NOT EXISTS "idx_promo_codes_active" ON "promo_codes" ("active");

-- Promo code usage tracking - records each use of a promo code
CREATE TABLE IF NOT EXISTS "promo_code_usage" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "promo_code_id" integer NOT NULL,
  "auth0_user_id" text NOT NULL,
  "deploy_order_id" integer,
  "discount_applied_cents" integer NOT NULL,
  "original_price_cents" integer NOT NULL,
  "final_price_cents" integer NOT NULL,
  "used_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for promo code usage lookups
CREATE INDEX IF NOT EXISTS "idx_promo_code_usage_promo_id" ON "promo_code_usage" ("promo_code_id");
CREATE INDEX IF NOT EXISTS "idx_promo_code_usage_auth0_user_id" ON "promo_code_usage" ("auth0_user_id");
CREATE INDEX IF NOT EXISTS "idx_promo_code_usage_promo_user" ON "promo_code_usage" ("promo_code_id", "auth0_user_id");
