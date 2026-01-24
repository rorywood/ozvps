-- Add trial server fields to server_billing table
ALTER TABLE "server_billing" ADD COLUMN IF NOT EXISTS "is_trial" boolean DEFAULT false NOT NULL;
ALTER TABLE "server_billing" ADD COLUMN IF NOT EXISTS "trial_expires_at" timestamp;
ALTER TABLE "server_billing" ADD COLUMN IF NOT EXISTS "trial_ended_at" timestamp;

-- Create index for efficient lookup of active trials that need processing
CREATE INDEX IF NOT EXISTS "idx_server_billing_trial_expires"
ON "server_billing" ("trial_expires_at") WHERE "is_trial" = true AND "trial_ended_at" IS NULL;
