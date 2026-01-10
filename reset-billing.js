#!/usr/bin/env node
import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set');
  process.exit(1);
}

async function resetBilling() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 1,
  });

  try {
    console.log('Resetting billing records...');

    // Delete all billing records so they can be recreated with correct dates
    await pool.query('DELETE FROM server_billing');

    console.log('✓ Billing records reset successfully');
    console.log('Billing records will be automatically recreated when users visit the billing page');
  } catch (error) {
    console.error('Failed to reset billing:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

resetBilling();
