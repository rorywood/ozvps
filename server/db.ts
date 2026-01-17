import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

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
      console.log('[db] Running migration: Adding virtfusion_server_uuid column...');
      await client.query(`
        ALTER TABLE "server_billing"
        ADD COLUMN IF NOT EXISTS "virtfusion_server_uuid" text
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS "server_billing_uuid_idx" ON "server_billing" ("virtfusion_server_uuid")
      `);
      console.log('[db] Migration complete: virtfusion_server_uuid column added');
    }
  } catch (error: any) {
    console.error('[db] Migration error:', error.message);
    // Don't throw - let app start even if migration fails (column might already exist)
  } finally {
    client.release();
  }
}
