import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { log } from "./logger";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const isProduction = process.env.NODE_ENV === 'production';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // Production-optimized pool settings
  max: isProduction ? 20 : 10, // Max connections in pool
  idleTimeoutMillis: 30000, // Close idle connections after 30s
  connectionTimeoutMillis: 5000, // Fail fast if can't connect in 5s
  allowExitOnIdle: !isProduction, // Allow clean exit in dev
});

export const db = drizzle(pool, { schema });

// Check if database is connected and responsive
export async function checkDatabaseHealth(): Promise<{ connected: boolean; error?: string }> {
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      return { connected: true };
    } finally {
      client.release();
    }
  } catch (error: any) {
    return { connected: false, error: error.message };
  }
}

// Run automatic schema migrations on startup
export async function runAutoMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    // Migration: Add virtfusion_server_uuid column to server_billing if it doesn't exist
    const checkColumn = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'server_billing' AND column_name = 'virtfusion_server_uuid'
    `);

    if (checkColumn.rows.length === 0) {
      log('Running migration: Adding virtfusion_server_uuid column...', 'db');
      await client.query(`
        ALTER TABLE "server_billing"
        ADD COLUMN IF NOT EXISTS "virtfusion_server_uuid" text
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS "server_billing_uuid_idx" ON "server_billing" ("virtfusion_server_uuid")
      `);
      log('Migration complete: virtfusion_server_uuid column added', 'db');
    }

    const checkClientErrorTable = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'client_error_events'
    `);

    if (checkClientErrorTable.rows.length === 0) {
      log('Running migration: Creating client_error_events table...', 'db');
      await client.query(`
        CREATE TABLE IF NOT EXISTS "client_error_events" (
          "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          "auth0_user_id" text,
          "session_id" varchar(64),
          "level" text NOT NULL DEFAULT 'error',
          "source" text NOT NULL,
          "message" text NOT NULL,
          "route" text,
          "page_url" text,
          "request_url" text,
          "method" text,
          "status_code" integer,
          "stack" text,
          "component_stack" text,
          "tags" jsonb,
          "extra" jsonb,
          "user_agent" text,
          "ip_address" text,
          "created_at" timestamp NOT NULL DEFAULT now()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS "client_error_events_created_at_idx"
        ON "client_error_events" ("created_at" DESC)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS "client_error_events_auth0_user_id_idx"
        ON "client_error_events" ("auth0_user_id")
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS "client_error_events_source_idx"
        ON "client_error_events" ("source")
      `);
      log('Migration complete: client_error_events table created', 'db');
    }

    const checkTrustedDeviceTable = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'trusted_two_factor_devices'
    `);

    if (checkTrustedDeviceTable.rows.length === 0) {
      log('Running migration: Creating trusted_two_factor_devices table...', 'db');
      await client.query(`
        CREATE TABLE IF NOT EXISTS "trusted_two_factor_devices" (
          "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          "auth0_user_id" text NOT NULL,
          "token_hash" text NOT NULL UNIQUE,
          "user_agent_hash" text NOT NULL,
          "device_label" text NOT NULL,
          "user_agent" text,
          "ip_address" text,
          "created_at" timestamp NOT NULL DEFAULT now(),
          "last_used_at" timestamp NOT NULL DEFAULT now(),
          "expires_at" timestamp NOT NULL,
          "revoked_at" timestamp
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS "trusted_two_factor_devices_auth0_user_id_idx"
        ON "trusted_two_factor_devices" ("auth0_user_id")
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS "trusted_two_factor_devices_expires_at_idx"
        ON "trusted_two_factor_devices" ("expires_at")
      `);
      log('Migration complete: trusted_two_factor_devices table created', 'db');
    }
  } catch (error: any) {
    log(`Migration error: ${error.message}`, 'db', { level: 'error' });
    // Don't throw - let app start even if migration fails (column might already exist)
  } finally {
    client.release();
  }
}
