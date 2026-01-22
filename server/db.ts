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
  } catch (error: any) {
    log(`Migration error: ${error.message}`, 'db', { level: 'error' });
    // Don't throw - let app start even if migration fails (column might already exist)
  } finally {
    client.release();
  }
}
