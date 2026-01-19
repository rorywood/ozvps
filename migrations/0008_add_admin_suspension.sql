-- Add admin suspension fields to server_billing table
ALTER TABLE "server_billing" ADD COLUMN IF NOT EXISTS "admin_suspended" boolean DEFAULT false NOT NULL;
ALTER TABLE "server_billing" ADD COLUMN IF NOT EXISTS "admin_suspended_at" timestamp;
ALTER TABLE "server_billing" ADD COLUMN IF NOT EXISTS "admin_suspended_reason" text;
