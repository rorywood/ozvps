-- Migration: Add security tables for account lockout, audit logging, and session binding
-- Created: 2026-01-22

-- Login attempts tracking
CREATE TABLE IF NOT EXISTS "login_attempts" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "email" text NOT NULL,
  "ip_address" text NOT NULL,
  "user_agent" text,
  "success" boolean NOT NULL DEFAULT false,
  "failure_reason" text,
  "attempted_at" timestamp DEFAULT now() NOT NULL
);

-- Index for querying recent attempts by email
CREATE INDEX IF NOT EXISTS "login_attempts_email_idx" ON "login_attempts" ("email");
CREATE INDEX IF NOT EXISTS "login_attempts_attempted_at_idx" ON "login_attempts" ("attempted_at");

-- Account lockouts
CREATE TABLE IF NOT EXISTS "account_lockouts" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "email" text NOT NULL,
  "locked_at" timestamp DEFAULT now() NOT NULL,
  "locked_until" timestamp NOT NULL,
  "failed_attempts" integer NOT NULL DEFAULT 0,
  "last_failed_at" timestamp,
  "ip_address" text
);

-- Index for checking lockout status
CREATE INDEX IF NOT EXISTS "account_lockouts_email_idx" ON "account_lockouts" ("email");
CREATE INDEX IF NOT EXISTS "account_lockouts_locked_until_idx" ON "account_lockouts" ("locked_until");

-- User audit logs
CREATE TABLE IF NOT EXISTS "user_audit_logs" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "auth0_user_id" text NOT NULL,
  "email" text NOT NULL,
  "action" text NOT NULL,
  "target_type" text,
  "target_id" text,
  "details" jsonb,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Index for querying audit logs
CREATE INDEX IF NOT EXISTS "user_audit_logs_auth0_user_id_idx" ON "user_audit_logs" ("auth0_user_id");
CREATE INDEX IF NOT EXISTS "user_audit_logs_action_idx" ON "user_audit_logs" ("action");
CREATE INDEX IF NOT EXISTS "user_audit_logs_created_at_idx" ON "user_audit_logs" ("created_at");

-- Add IP and user agent to sessions table for session binding
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "ip_address" text;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "user_agent" text;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "last_active_at" timestamp;
