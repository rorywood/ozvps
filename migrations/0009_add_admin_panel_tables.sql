-- Admin IP Whitelist - controls access to admin panel
CREATE TABLE IF NOT EXISTS admin_ip_whitelist (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  ip_address TEXT NOT NULL,
  cidr TEXT,
  label TEXT NOT NULL,
  added_by TEXT NOT NULL,
  added_by_email TEXT NOT NULL,
  expires_at TIMESTAMP,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Admin Sessions - separate from customer sessions for security
CREATE TABLE IF NOT EXISTS admin_sessions (
  id VARCHAR(64) PRIMARY KEY,
  auth0_user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  last_activity_at TIMESTAMP DEFAULT NOW() NOT NULL,
  revoked_at TIMESTAMP,
  revoked_reason TEXT
);

-- Indexes for admin tables
CREATE INDEX IF NOT EXISTS idx_admin_ip_whitelist_ip ON admin_ip_whitelist(ip_address);
CREATE INDEX IF NOT EXISTS idx_admin_ip_whitelist_enabled ON admin_ip_whitelist(enabled);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_auth0_user ON admin_sessions(auth0_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);
