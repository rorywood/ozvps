-- Add email 2FA support to two_factor_auth table
ALTER TABLE "two_factor_auth" ADD COLUMN IF NOT EXISTS "method" text NOT NULL DEFAULT 'totp';
ALTER TABLE "two_factor_auth" ADD COLUMN IF NOT EXISTS "email_otp_code" text;
ALTER TABLE "two_factor_auth" ADD COLUMN IF NOT EXISTS "email_otp_expires_at" timestamp;
