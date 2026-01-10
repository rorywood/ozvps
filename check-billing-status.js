#!/usr/bin/env node
/**
 * Billing Status Checker
 * Checks if billing tables exist and shows billing data
 */

import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { serverBilling, billingLedger } from './shared/schema.js';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  console.log('\nUsage:');
  console.log('  cd /opt/ozvps-panel');
  console.log('  export $(cat .env | grep -v "^#" | xargs)');
  console.log('  node check-billing-status.js');
  process.exit(1);
}

async function checkBilling() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 1,
  });
  const db = drizzle(pool);

  try {
    console.log('🔍 Checking billing setup...\n');

    // Check if tables exist
    console.log('📋 Step 1: Checking if billing tables exist');
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'server_billing'
      ) as server_billing_exists,
      EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'billing_ledger'
      ) as billing_ledger_exists
    `);

    const tables = tableCheck.rows[0];
    console.log(`  server_billing table: ${tables.server_billing_exists ? '✅ EXISTS' : '❌ MISSING'}`);
    console.log(`  billing_ledger table: ${tables.billing_ledger_exists ? '✅ EXISTS' : '❌ MISSING'}`);
    console.log('');

    if (!tables.server_billing_exists || !tables.billing_ledger_exists) {
      console.log('❌ Billing tables are MISSING!');
      console.log('\n💡 Fix:');
      console.log('  1. Run: bash fix-billing-now.sh');
      console.log('  2. Or run: bash public/run-migrations.sh');
      console.log('');
      await pool.end();
      return;
    }

    // Count records
    console.log('📊 Step 2: Counting billing records');
    const countResult = await pool.query('SELECT COUNT(*) as count FROM server_billing');
    const count = Number(countResult.rows[0].count);
    console.log(`  Total billing records: ${count}`);
    console.log('');

    if (count === 0) {
      console.log('⚠️  No billing records found!');
      console.log('\n💡 This is normal if you just created the tables.');
      console.log('   Billing records will be created automatically when you:');
      console.log('   1. Access the dashboard');
      console.log('   2. Access the server list');
      console.log('   3. View individual servers');
      console.log('');
    } else {
      // Show sample records
      console.log('📝 Step 3: Sample billing records');
      const records = await db.select().from(serverBilling).limit(10);
      records.forEach((r, i) => {
        console.log(`  ${i + 1}. Server ${r.virtfusionServerId}`);
        console.log(`     Status: ${r.status}`);
        console.log(`     Next Bill: ${r.nextBillAt.toLocaleDateString()}`);
        console.log(`     Monthly Price: $${(r.monthlyPriceCents / 100).toFixed(2)}`);
        console.log('');
      });
    }

    console.log('✅ Billing system check complete!');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Restart your application: pm2 restart ozvps-panel');
    console.log('  2. Refresh your dashboard');
    console.log('  3. Check the billing page');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\nStack:', error.stack);
  } finally {
    await pool.end();
  }
}

checkBilling();
