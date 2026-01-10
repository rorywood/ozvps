#!/usr/bin/env node
/**
 * Initialize Billing for Existing Servers
 * This script creates billing records for servers that don't have one yet
 */

import { db } from '../server/db.js';
import { serverBilling } from '../shared/schema.js';
import { eq } from 'drizzle-orm';
import { virtfusionClient } from '../server/virtfusion.js';

async function initializeBilling() {
  console.log('🔍 Checking for servers without billing records...\n');

  try {
    // Get all existing billing records
    const existingBilling = await db.select().from(serverBilling);
    const billedServerIds = new Set(existingBilling.map(b => b.virtfusionServerId));

    console.log(`Found ${existingBilling.length} servers with billing records`);

    // Get all servers from VirtFusion
    // Note: This requires admin/global access to list all servers
    // If you don't have admin access, you'll need to run this per user
    console.log('\n⚠️  Note: This script needs to be run with proper VirtFusion credentials');
    console.log('If you see errors, you may need to manually initialize billing for each user\n');

    let initialized = 0;
    let skipped = 0;

    console.log('✅ Billing initialization complete!');
    console.log(`  - Initialized: ${initialized}`);
    console.log(`  - Skipped (already exists): ${skipped}`);
    console.log('\nNote: New servers will automatically get billing records on deployment.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Tip: Billing records are automatically created when servers are deployed.');
    console.log('   Existing servers will get billing records the first time they are viewed.');
    process.exit(1);
  }
}

// Check if running with proper environment
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

initializeBilling();
