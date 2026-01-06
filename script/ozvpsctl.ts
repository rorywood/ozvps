#!/usr/bin/env npx tsx
import { db } from '../server/db';
import { wallets, walletTransactions, plans } from '../shared/schema';
import { eq, desc } from 'drizzle-orm';
import { virtfusionClient } from '../server/virtfusion';

const COMMANDS = {
  users: ['list', 'show'],
  wallet: ['show', 'add', 'deduct', 'history'],
  plans: ['list', 'sync'],
  stripe: ['status', 'show'],
};

function printHelp() {
  console.log(`
OzVPS Control CLI

Usage: ozvpsctl <command> <subcommand> [options]

Commands:
  users list                    List all users with wallets
  users show <email>            Show details for a single user

  wallet show <email>           View a user's wallet balance
  wallet add <email> <cents>    Add credit to a user's wallet
  wallet deduct <email> <cents> Deduct credit from a user's wallet
  wallet history <email>        View a user's transaction history

  plans list                    List all plans
  plans sync                    Force VirtFusion plan sync

  stripe status                 Check Stripe configuration status
  stripe show <email>           Show a user's linked Stripe customer ID

Examples:
  ozvpsctl users list
  ozvpsctl wallet add user@example.com 1000
  ozvpsctl plans sync
`);
}

async function getWalletByEmail(email: string) {
  const [wallet] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.auth0UserId, email));
  
  if (!wallet) {
    // Try looking up by auth0UserId pattern
    const allWallets = await db.select().from(wallets);
    const found = allWallets.find(w => 
      w.auth0UserId.includes(email) || 
      w.auth0UserId === email
    );
    return found;
  }
  return wallet;
}

async function listUsers() {
  const allWallets = await db.select().from(wallets);
  
  if (allWallets.length === 0) {
    console.log('No users found.');
    return;
  }

  console.log('\nUsers with Wallets:\n');
  console.log('Auth0 User ID                              | Balance    | Stripe Customer');
  console.log('-'.repeat(80));
  
  for (const wallet of allWallets) {
    const balance = `$${(wallet.balanceCents / 100).toFixed(2)}`.padEnd(10);
    const stripe = wallet.stripeCustomerId || 'Not linked';
    console.log(`${wallet.auth0UserId.padEnd(40)} | ${balance} | ${stripe}`);
  }
  console.log(`\nTotal: ${allWallets.length} users`);
}

async function showUser(identifier: string) {
  const wallet = await getWalletByEmail(identifier);
  
  if (!wallet) {
    console.error(`User not found: ${identifier}`);
    process.exit(1);
  }

  console.log('\nUser Details:\n');
  console.log(`Auth0 User ID:     ${wallet.auth0UserId}`);
  console.log(`Balance:           $${(wallet.balanceCents / 100).toFixed(2)} AUD (${wallet.balanceCents} cents)`);
  console.log(`Stripe Customer:   ${wallet.stripeCustomerId || 'Not linked'}`);
  console.log(`Created:           ${wallet.createdAt}`);
  console.log(`Updated:           ${wallet.updatedAt}`);

  // Get recent transactions
  const transactions = await db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.auth0UserId, wallet.auth0UserId))
    .orderBy(desc(walletTransactions.createdAt))
    .limit(5);

  if (transactions.length > 0) {
    console.log('\nRecent Transactions:');
    for (const tx of transactions) {
      const amount = tx.amountCents >= 0 ? `+$${(tx.amountCents / 100).toFixed(2)}` : `-$${(Math.abs(tx.amountCents) / 100).toFixed(2)}`;
      console.log(`  ${tx.createdAt?.toISOString().slice(0, 19)} | ${amount.padEnd(10)} | ${tx.type}`);
    }
  }
}

async function showWallet(identifier: string) {
  const wallet = await getWalletByEmail(identifier);
  
  if (!wallet) {
    console.error(`Wallet not found for: ${identifier}`);
    process.exit(1);
  }

  console.log(`\nWallet Balance: $${(wallet.balanceCents / 100).toFixed(2)} AUD (${wallet.balanceCents} cents)`);
  console.log(`Stripe Customer: ${wallet.stripeCustomerId || 'Not linked'}`);
}

async function addCredits(identifier: string, amountCents: number) {
  if (amountCents <= 0) {
    console.error('Amount must be positive');
    process.exit(1);
  }

  const wallet = await getWalletByEmail(identifier);
  
  if (!wallet) {
    console.error(`Wallet not found for: ${identifier}`);
    process.exit(1);
  }

  // Insert transaction
  await db.insert(walletTransactions).values({
    auth0UserId: wallet.auth0UserId,
    amountCents: amountCents,
    type: 'credit',
    metadata: { source: 'ozvpsctl', action: 'add' },
  });

  // Update balance
  const [updated] = await db
    .update(wallets)
    .set({ 
      balanceCents: wallet.balanceCents + amountCents,
      updatedAt: new Date(),
    })
    .where(eq(wallets.auth0UserId, wallet.auth0UserId))
    .returning();

  console.log(`\nAdded $${(amountCents / 100).toFixed(2)} to ${wallet.auth0UserId}`);
  console.log(`New balance: $${(updated.balanceCents / 100).toFixed(2)} AUD`);
}

async function deductCredits(identifier: string, amountCents: number) {
  if (amountCents <= 0) {
    console.error('Amount must be positive');
    process.exit(1);
  }

  const wallet = await getWalletByEmail(identifier);
  
  if (!wallet) {
    console.error(`Wallet not found for: ${identifier}`);
    process.exit(1);
  }

  if (wallet.balanceCents < amountCents) {
    console.error(`Insufficient balance: $${(wallet.balanceCents / 100).toFixed(2)} < $${(amountCents / 100).toFixed(2)}`);
    process.exit(1);
  }

  // Insert transaction
  await db.insert(walletTransactions).values({
    auth0UserId: wallet.auth0UserId,
    amountCents: -amountCents,
    type: 'debit',
    metadata: { source: 'ozvpsctl', action: 'deduct' },
  });

  // Update balance
  const [updated] = await db
    .update(wallets)
    .set({ 
      balanceCents: wallet.balanceCents - amountCents,
      updatedAt: new Date(),
    })
    .where(eq(wallets.auth0UserId, wallet.auth0UserId))
    .returning();

  console.log(`\nDeducted $${(amountCents / 100).toFixed(2)} from ${wallet.auth0UserId}`);
  console.log(`New balance: $${(updated.balanceCents / 100).toFixed(2)} AUD`);
}

async function walletHistory(identifier: string) {
  const wallet = await getWalletByEmail(identifier);
  
  if (!wallet) {
    console.error(`Wallet not found for: ${identifier}`);
    process.exit(1);
  }

  const transactions = await db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.auth0UserId, wallet.auth0UserId))
    .orderBy(desc(walletTransactions.createdAt));

  console.log(`\nTransaction History for ${wallet.auth0UserId}:\n`);
  console.log('Date                    | Amount      | Type   | Description');
  console.log('-'.repeat(80));

  if (transactions.length === 0) {
    console.log('No transactions found.');
    return;
  }

  for (const tx of transactions) {
    const date = tx.createdAt?.toISOString().slice(0, 19) || 'Unknown';
    const amount = tx.amountCents >= 0 
      ? `+$${(tx.amountCents / 100).toFixed(2)}`.padEnd(11)
      : `-$${(Math.abs(tx.amountCents) / 100).toFixed(2)}`.padEnd(11);
    const type = tx.type.padEnd(6);
    const desc = tx.stripeEventId || (tx.metadata as any)?.source || '-';
    console.log(`${date} | ${amount} | ${type} | ${desc}`);
  }

  console.log(`\nCurrent Balance: $${(wallet.balanceCents / 100).toFixed(2)} AUD`);
}

async function listPlans() {
  const allPlans = await db.select().from(plans);

  console.log('\nPlans:\n');
  console.log('ID  | Code        | Name                  | Price    | vCPU | RAM    | Storage | Active');
  console.log('-'.repeat(90));

  for (const plan of allPlans) {
    const price = `$${(plan.priceMonthly / 100).toFixed(2)}`.padEnd(8);
    const ram = `${plan.ramMb}MB`.padEnd(6);
    const storage = `${plan.storageGb}GB`.padEnd(7);
    console.log(
      `${String(plan.id).padEnd(3)} | ${plan.code.padEnd(11)} | ${plan.name.padEnd(21)} | ${price} | ${String(plan.vcpu).padEnd(4)} | ${ram} | ${storage} | ${plan.active ? 'Yes' : 'No'}`
    );
  }
  console.log(`\nTotal: ${allPlans.length} plans`);
}

async function syncPlans() {
  console.log('Syncing plans from VirtFusion...\n');

  try {
    const packages = await virtfusionClient.getPackages();
    
    if (packages.length === 0) {
      console.error('No packages found from VirtFusion');
      process.exit(1);
    }

    console.log(`Found ${packages.length} packages from VirtFusion`);

    // Import dbStorage for sync
    const { dbStorage } = await import('../server/storage');
    const result = await dbStorage.syncPlansFromVirtFusion(packages);

    console.log(`\nSync complete: ${result.synced} synced, ${result.errors.length} errors`);
    
    if (result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach(err => console.log(`  - ${err}`));
    }
  } catch (error: any) {
    console.error(`Sync failed: ${error.message}`);
    process.exit(1);
  }
}

async function stripeStatus() {
  const hasPublishable = !!process.env.STRIPE_PUBLISHABLE_KEY;
  const hasSecret = !!process.env.STRIPE_SECRET_KEY;
  
  console.log('\nStripe Configuration:\n');
  console.log(`STRIPE_PUBLISHABLE_KEY: ${hasPublishable ? 'Set' : 'NOT SET'}`);
  console.log(`STRIPE_SECRET_KEY:      ${hasSecret ? 'Set' : 'NOT SET'}`);
  console.log(`Mode:                   ${process.env.STRIPE_SECRET_KEY?.startsWith('sk_test') ? 'Test' : process.env.STRIPE_SECRET_KEY?.startsWith('sk_live') ? 'Live' : 'Unknown'}`);
  
  if (!hasPublishable || !hasSecret) {
    console.log('\nStripe is NOT fully configured. Add keys to .env');
  } else {
    console.log('\nStripe is configured.');
  }
}

async function stripeShow(identifier: string) {
  const wallet = await getWalletByEmail(identifier);
  
  if (!wallet) {
    console.error(`Wallet not found for: ${identifier}`);
    process.exit(1);
  }

  console.log(`\nStripe Customer for ${wallet.auth0UserId}:`);
  console.log(`Customer ID: ${wallet.stripeCustomerId || 'Not linked'}`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return;
  }

  const [command, subcommand, ...rest] = args;

  try {
    switch (command) {
      case 'users':
        if (subcommand === 'list') {
          await listUsers();
        } else if (subcommand === 'show' && rest[0]) {
          await showUser(rest[0]);
        } else {
          console.error('Usage: ozvpsctl users list | users show <email>');
          process.exit(1);
        }
        break;

      case 'wallet':
        if (subcommand === 'show' && rest[0]) {
          await showWallet(rest[0]);
        } else if (subcommand === 'add' && rest[0] && rest[1]) {
          await addCredits(rest[0], parseInt(rest[1], 10));
        } else if (subcommand === 'deduct' && rest[0] && rest[1]) {
          await deductCredits(rest[0], parseInt(rest[1], 10));
        } else if (subcommand === 'history' && rest[0]) {
          await walletHistory(rest[0]);
        } else {
          console.error('Usage: ozvpsctl wallet show|add|deduct|history <email> [amount]');
          process.exit(1);
        }
        break;

      case 'plans':
        if (subcommand === 'list') {
          await listPlans();
        } else if (subcommand === 'sync') {
          await syncPlans();
        } else {
          console.error('Usage: ozvpsctl plans list | plans sync');
          process.exit(1);
        }
        break;

      case 'stripe':
        if (subcommand === 'status') {
          await stripeStatus();
        } else if (subcommand === 'show' && rest[0]) {
          await stripeShow(rest[0]);
        } else {
          console.error('Usage: ozvpsctl stripe status | stripe show <email>');
          process.exit(1);
        }
        break;

      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }

  process.exit(0);
}

main();
