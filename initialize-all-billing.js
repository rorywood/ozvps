#!/usr/bin/env node
/**
 * Initialize billing for ALL existing servers
 * Run this once to create billing records for servers that don't have them
 */

import pg from 'pg';
import { virtfusionClient } from './server/virtfusion.js';
import { db } from './server/db.js';
import { users } from './shared/schema.js';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

async function initializeAllBilling() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 1,
  });

  try {
    console.log('🔍 Initializing billing for all servers...\n');

    // Get all users with VirtFusion IDs
    const allUsers = await db.select().from(users);

    let totalServers = 0;
    let initializedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const user of allUsers) {
      if (!user.virtfusionUserId) {
        continue;
      }

      console.log(`\nProcessing user: ${user.email} (${user.auth0UserId})`);

      try {
        // Get all servers for this user
        const servers = await virtfusionClient.listServersWithStats(user.virtfusionUserId);
        console.log(`  Found ${servers.length} servers`);

        for (const server of servers) {
          totalServers++;

          // Check if billing record already exists
          const existingBilling = await pool.query(
            'SELECT id FROM server_billing WHERE virtfusion_server_id = $1',
            [server.id]
          );

          if (existingBilling.rows.length > 0) {
            console.log(`  ⏭️  Server ${server.id} - already has billing`);
            skippedCount++;
            continue;
          }

          // Check if server has plan info
          if (!server.plan || !server.plan.priceMonthly) {
            console.log(`  ⚠️  Server ${server.id} - missing plan/price info`);
            errorCount++;
            continue;
          }

          // Calculate next bill date (30 days from now for existing servers)
          const deployedAt = server.createdAt ? new Date(server.createdAt) : new Date();
          const nextBillAt = new Date();
          nextBillAt.setDate(nextBillAt.getDate() + 30);

          // Insert billing record
          await pool.query(`
            INSERT INTO server_billing (
              virtfusion_server_id,
              plan_id,
              auth0_user_id,
              monthly_price_cents,
              status,
              next_bill_at,
              auto_renew,
              deployed_at,
              created_at,
              updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
          `, [
            server.id,
            server.plan.id,
            user.auth0UserId,
            server.plan.priceMonthly,
            'active',
            nextBillAt,
            true,
            deployedAt
          ]);

          console.log(`  ✅ Server ${server.id} - billing initialized ($${(server.plan.priceMonthly / 100).toFixed(2)}/mo)`);
          initializedCount++;
        }
      } catch (userError) {
        console.error(`  ❌ Error processing user: ${userError.message}`);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary:');
    console.log(`  Total servers found: ${totalServers}`);
    console.log(`  ✅ Initialized: ${initializedCount}`);
    console.log(`  ⏭️  Skipped (already exist): ${skippedCount}`);
    console.log(`  ❌ Errors: ${errorCount}`);
    console.log('='.repeat(60));
    console.log('\n✅ Done! Restart your app and refresh the dashboard.\n');

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initializeAllBilling();
