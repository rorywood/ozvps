-- Rate limiting table for persistent brute-force protection
-- This replaces the in-memory rate limiting which resets on server restart

CREATE TABLE IF NOT EXISTS rate_limits (
    id SERIAL PRIMARY KEY,
    -- Type of rate limit: 'email', 'ip', 'email_ip_combo'
    limit_type VARCHAR(20) NOT NULL,
    -- The key being rate limited (email address, IP address, or combo)
    limit_key VARCHAR(255) NOT NULL,
    -- Number of failed attempts
    attempts INTEGER NOT NULL DEFAULT 0,
    -- When the tracking window started
    window_start TIMESTAMP NOT NULL DEFAULT NOW(),
    -- When the account/IP is locked until (NULL if not locked)
    locked_until TIMESTAMP,
    -- Last attempt timestamp for cleanup
    last_attempt TIMESTAMP NOT NULL DEFAULT NOW(),
    -- When this record was created
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Unique constraint on type + key
    CONSTRAINT rate_limits_type_key_unique UNIQUE (limit_type, limit_key)
);

-- Index for efficient lookups by type and key
CREATE INDEX IF NOT EXISTS idx_rate_limits_type_key ON rate_limits(limit_type, limit_key);

-- Index for efficient cleanup of old records
CREATE INDEX IF NOT EXISTS idx_rate_limits_last_attempt ON rate_limits(last_attempt);

-- Index for finding locked records
CREATE INDEX IF NOT EXISTS idx_rate_limits_locked_until ON rate_limits(locked_until) WHERE locked_until IS NOT NULL;
