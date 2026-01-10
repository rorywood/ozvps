#!/usr/bin/env node
/**
 * Database Migration Runner
 * Applies all pending SQL migrations in the migrations directory
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

async function runMigrations() {
  const sql = postgres(DATABASE_URL, { max: 1 });

  try {
    console.log('🔍 Checking for pending migrations...\n');

    // Get all SQL migration files
    const migrationsDir = join(__dirname, 'migrations');
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Run in alphabetical order

    if (files.length === 0) {
      console.log('✅ No SQL migrations found');
      await sql.end();
      return;
    }

    console.log(`Found ${files.length} migration file(s):`);
    files.forEach(f => console.log(`  - ${f}`));
    console.log('');

    // Run each migration
    for (const file of files) {
      console.log(`📝 Running ${file}...`);
      const migrationSQL = readFileSync(join(migrationsDir, file), 'utf-8');

      try {
        await sql.unsafe(migrationSQL);
        console.log(`✅ ${file} completed successfully\n`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`⏭️  ${file} already applied (tables exist)\n`);
        } else {
          throw error;
        }
      }
    }

    console.log('✅ All migrations completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigrations();
