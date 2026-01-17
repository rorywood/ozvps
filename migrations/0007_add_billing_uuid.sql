-- Migration: Add VirtFusion server UUID to billing
-- Created: 2026-01-17
-- Description: Adds immutable UUID column for reliable billing record lookup

-- Add UUID column (nullable to support existing records)
ALTER TABLE "server_billing"
ADD COLUMN IF NOT EXISTS "virtfusion_server_uuid" text;

-- Add index for UUID lookups
CREATE INDEX IF NOT EXISTS "server_billing_uuid_idx" ON "server_billing" ("virtfusion_server_uuid");
