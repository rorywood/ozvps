-- Migration: Add Two-Factor Authentication
-- Created: 2026-01-11
-- Description: Adds table for storing 2FA secrets and backup codes

-- Two-Factor Authentication settings
CREATE TABLE IF NOT EXISTS "two_factor_auth" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "auth0_user_id" text NOT NULL UNIQUE,
  "secret" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT false,
  "backup_codes" text,
  "verified_at" timestamp,
  "last_used_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Index for looking up 2FA by user
CREATE INDEX IF NOT EXISTS "idx_two_factor_auth_user_id" ON "two_factor_auth" ("auth0_user_id");
CREATE INDEX IF NOT EXISTS "idx_two_factor_auth_enabled" ON "two_factor_auth" ("auth0_user_id") WHERE "enabled" = true;
