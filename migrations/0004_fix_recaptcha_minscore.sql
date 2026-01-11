-- Migration: Fix reCAPTCHA minScore
-- Created: 2026-01-11
-- Description: Sets the reCAPTCHA minScore to a valid value (0.5)
-- This fixes cases where the minScore was accidentally set to an invalid value

-- Insert or update the recaptcha_min_score setting to 0.5
INSERT INTO security_settings (key, value, enabled, updated_at)
VALUES ('recaptcha_min_score', '0.5', true, now())
ON CONFLICT (key) DO UPDATE SET
  value = '0.5',
  updated_at = now();
