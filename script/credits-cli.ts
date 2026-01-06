import * as readline from 'readline';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq, desc, sql } from 'drizzle-orm';
import * as schema from '../shared/schema';
const { wallets, walletTransactions } = schema;

const RED = '\x1b[0;31m';
const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[1;33m';
const CYAN = '\x1b[0;36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const NC = '\x1b[0m';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)} AUD`;
}

function showHeader() {
  console.clear();
  console.log('');
  console.log(`${CYAN}┌─────────────────────────────────────────┐${NC}`);
  console.log(`${CYAN}│${NC}  ${BOLD}OzVPS Panel${NC} ${DIM}Credit Management${NC}          ${CYAN}│${NC}`);
  console.log(`${CYAN}└─────────────────────────────────────────┘${NC}`);
  console.log('');
}

async function listUsers() {
  showHeader();
  console.log(`  ${BOLD}User Wallets${NC}`);
  console.log(`  ${DIM}─────────────────────────────────────${NC}`);
  console.log('');

  const allWallets = await db
    .select()
    .from(wallets)
    .orderBy(desc(wallets.balanceCents));

  if (allWallets.length === 0) {
    console.log(`  ${DIM}No users found.${NC}`);
  } else {
    console.log(`  ${DIM}#   Balance          Auth0 User ID${NC}`);
    console.log(`  ${DIM}─────────────────────────────────────────────────────${NC}`);
    allWallets.forEach((wallet, index) => {
      const balance = formatCurrency(wallet.balanceCents);
      const paddedBalance = balance.padEnd(16);
      console.log(`  ${(index + 1).toString().padStart(2)}  ${GREEN}${paddedBalance}${NC}${wallet.auth0UserId}`);
    });
  }

  console.log('');
  await prompt(`  ${DIM}Press Enter to continue...${NC}`);
}

async function viewUserDetails() {
  showHeader();
  console.log(`  ${BOLD}View User Details${NC}`);
  console.log('');

  const auth0UserId = await prompt(`  Enter Auth0 User ID: `);
  if (!auth0UserId) return;

  const wallet = await db.query.wallets.findFirst({
    where: eq(wallets.auth0UserId, auth0UserId),
  });

  if (!wallet) {
    console.log('');
    console.log(`  ${RED}✗${NC}  User not found: ${auth0UserId}`);
    console.log('');
    await prompt(`  ${DIM}Press Enter to continue...${NC}`);
    return;
  }

  const transactions = await db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.auth0UserId, auth0UserId))
    .orderBy(desc(walletTransactions.createdAt))
    .limit(20);

  console.log('');
  console.log(`  ${DIM}─────────────────────────────────────${NC}`);
  console.log(`  ${DIM}Auth0 User ID:${NC}   ${wallet.auth0UserId}`);
  console.log(`  ${DIM}Stripe Customer:${NC} ${wallet.stripeCustomerId || 'Not linked'}`);
  console.log(`  ${DIM}Balance:${NC}         ${GREEN}${formatCurrency(wallet.balanceCents)}${NC}`);
  console.log(`  ${DIM}Created:${NC}         ${wallet.createdAt.toISOString()}`);
  console.log(`  ${DIM}─────────────────────────────────────${NC}`);
  console.log('');

  if (transactions.length > 0) {
    console.log(`  ${BOLD}Recent Transactions${NC} (last 20)`);
    console.log(`  ${DIM}Date                 Type        Amount${NC}`);
    console.log(`  ${DIM}────────────────────────────────────────${NC}`);
    transactions.forEach((tx) => {
      const date = tx.createdAt.toISOString().substring(0, 19).replace('T', ' ');
      const type = tx.type.padEnd(10);
      const amount = tx.amountCents >= 0
        ? `${GREEN}+${formatCurrency(tx.amountCents)}${NC}`
        : `${RED}${formatCurrency(tx.amountCents)}${NC}`;
      console.log(`  ${date}  ${type}  ${amount}`);
    });
  } else {
    console.log(`  ${DIM}No transactions found.${NC}`);
  }

  console.log('');
  await prompt(`  ${DIM}Press Enter to continue...${NC}`);
}

async function addCredits() {
  showHeader();
  console.log(`  ${BOLD}Add Credits${NC}`);
  console.log('');

  const auth0UserId = await prompt(`  Enter Auth0 User ID: `);
  if (!auth0UserId) return;

  const wallet = await db.query.wallets.findFirst({
    where: eq(wallets.auth0UserId, auth0UserId),
  });

  if (!wallet) {
    console.log('');
    console.log(`  ${RED}✗${NC}  User not found: ${auth0UserId}`);
    console.log('');
    await prompt(`  ${DIM}Press Enter to continue...${NC}`);
    return;
  }

  console.log(`  ${DIM}Current balance:${NC} ${GREEN}${formatCurrency(wallet.balanceCents)}${NC}`);
  console.log('');

  const amountStr = await prompt(`  Amount to add (in dollars, e.g., 10.50): $`);
  const amount = parseFloat(amountStr);

  if (isNaN(amount) || amount <= 0) {
    console.log('');
    console.log(`  ${RED}✗${NC}  Invalid amount`);
    console.log('');
    await prompt(`  ${DIM}Press Enter to continue...${NC}`);
    return;
  }

  const amountCents = Math.round(amount * 100);
  const reason = await prompt(`  Reason (optional): `);

  console.log('');
  console.log(`  ${DIM}─────────────────────────────────────${NC}`);
  console.log(`  ${DIM}User:${NC}    ${auth0UserId}`);
  console.log(`  ${DIM}Amount:${NC}  ${GREEN}+${formatCurrency(amountCents)}${NC}`);
  console.log(`  ${DIM}Reason:${NC}  ${reason || 'Admin adjustment'}`);
  console.log(`  ${DIM}─────────────────────────────────────${NC}`);
  console.log('');

  const confirm = await prompt(`  Confirm? (y/N): `);
  if (confirm.toLowerCase() !== 'y') {
    console.log(`  ${YELLOW}Cancelled${NC}`);
    await prompt(`  ${DIM}Press Enter to continue...${NC}`);
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(wallets)
      .set({
        balanceCents: sql`${wallets.balanceCents} + ${amountCents}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.auth0UserId, auth0UserId));

    await tx.insert(walletTransactions).values({
      auth0UserId,
      type: 'adjustment',
      amountCents,
      metadata: {
        reason: reason || 'Admin adjustment',
        adminAction: 'credit',
        timestamp: new Date().toISOString(),
      },
    });
  });

  const updatedWallet = await db.query.wallets.findFirst({
    where: eq(wallets.auth0UserId, auth0UserId),
  });

  console.log('');
  console.log(`  ${GREEN}✓${NC}  Credits added successfully`);
  console.log(`  ${DIM}New balance:${NC} ${GREEN}${formatCurrency(updatedWallet?.balanceCents ?? 0)}${NC}`);
  console.log('');
  await prompt(`  ${DIM}Press Enter to continue...${NC}`);
}

async function removeCredits() {
  showHeader();
  console.log(`  ${BOLD}Remove Credits${NC}`);
  console.log('');

  const auth0UserId = await prompt(`  Enter Auth0 User ID: `);
  if (!auth0UserId) return;

  const wallet = await db.query.wallets.findFirst({
    where: eq(wallets.auth0UserId, auth0UserId),
  });

  if (!wallet) {
    console.log('');
    console.log(`  ${RED}✗${NC}  User not found: ${auth0UserId}`);
    console.log('');
    await prompt(`  ${DIM}Press Enter to continue...${NC}`);
    return;
  }

  console.log(`  ${DIM}Current balance:${NC} ${GREEN}${formatCurrency(wallet.balanceCents)}${NC}`);
  console.log('');

  const amountStr = await prompt(`  Amount to remove (in dollars, e.g., 10.50): $`);
  const amount = parseFloat(amountStr);

  if (isNaN(amount) || amount <= 0) {
    console.log('');
    console.log(`  ${RED}✗${NC}  Invalid amount`);
    console.log('');
    await prompt(`  ${DIM}Press Enter to continue...${NC}`);
    return;
  }

  const amountCents = Math.round(amount * 100);

  if (amountCents > wallet.balanceCents) {
    console.log('');
    console.log(`  ${RED}✗${NC}  Insufficient balance. User has ${formatCurrency(wallet.balanceCents)}`);
    console.log('');
    await prompt(`  ${DIM}Press Enter to continue...${NC}`);
    return;
  }

  const reason = await prompt(`  Reason (optional): `);

  console.log('');
  console.log(`  ${DIM}─────────────────────────────────────${NC}`);
  console.log(`  ${DIM}User:${NC}    ${auth0UserId}`);
  console.log(`  ${DIM}Amount:${NC}  ${RED}-${formatCurrency(amountCents)}${NC}`);
  console.log(`  ${DIM}Reason:${NC}  ${reason || 'Admin adjustment'}`);
  console.log(`  ${DIM}─────────────────────────────────────${NC}`);
  console.log('');

  const confirm = await prompt(`  Confirm? (y/N): `);
  if (confirm.toLowerCase() !== 'y') {
    console.log(`  ${YELLOW}Cancelled${NC}`);
    await prompt(`  ${DIM}Press Enter to continue...${NC}`);
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(wallets)
      .set({
        balanceCents: sql`${wallets.balanceCents} - ${amountCents}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.auth0UserId, auth0UserId));

    await tx.insert(walletTransactions).values({
      auth0UserId,
      type: 'adjustment',
      amountCents: -amountCents,
      metadata: {
        reason: reason || 'Admin adjustment',
        adminAction: 'debit',
        timestamp: new Date().toISOString(),
      },
    });
  });

  const updatedWallet = await db.query.wallets.findFirst({
    where: eq(wallets.auth0UserId, auth0UserId),
  });

  console.log('');
  console.log(`  ${GREEN}✓${NC}  Credits removed successfully`);
  console.log(`  ${DIM}New balance:${NC} ${GREEN}${formatCurrency(updatedWallet?.balanceCents ?? 0)}${NC}`);
  console.log('');
  await prompt(`  ${DIM}Press Enter to continue...${NC}`);
}

async function setBalance() {
  showHeader();
  console.log(`  ${BOLD}Set Balance${NC}`);
  console.log('');

  const auth0UserId = await prompt(`  Enter Auth0 User ID: `);
  if (!auth0UserId) return;

  const wallet = await db.query.wallets.findFirst({
    where: eq(wallets.auth0UserId, auth0UserId),
  });

  if (!wallet) {
    console.log('');
    console.log(`  ${RED}✗${NC}  User not found: ${auth0UserId}`);
    console.log('');
    await prompt(`  ${DIM}Press Enter to continue...${NC}`);
    return;
  }

  console.log(`  ${DIM}Current balance:${NC} ${GREEN}${formatCurrency(wallet.balanceCents)}${NC}`);
  console.log('');

  const amountStr = await prompt(`  New balance (in dollars, e.g., 50.00): $`);
  const amount = parseFloat(amountStr);

  if (isNaN(amount) || amount < 0) {
    console.log('');
    console.log(`  ${RED}✗${NC}  Invalid amount`);
    console.log('');
    await prompt(`  ${DIM}Press Enter to continue...${NC}`);
    return;
  }

  const newBalanceCents = Math.round(amount * 100);
  const difference = newBalanceCents - wallet.balanceCents;
  const reason = await prompt(`  Reason (optional): `);

  console.log('');
  console.log(`  ${DIM}─────────────────────────────────────${NC}`);
  console.log(`  ${DIM}User:${NC}        ${auth0UserId}`);
  console.log(`  ${DIM}Old Balance:${NC} ${formatCurrency(wallet.balanceCents)}`);
  console.log(`  ${DIM}New Balance:${NC} ${GREEN}${formatCurrency(newBalanceCents)}${NC}`);
  console.log(`  ${DIM}Change:${NC}      ${difference >= 0 ? GREEN + '+' : RED}${formatCurrency(difference)}${NC}`);
  console.log(`  ${DIM}Reason:${NC}      ${reason || 'Admin balance set'}`);
  console.log(`  ${DIM}─────────────────────────────────────${NC}`);
  console.log('');

  const confirm = await prompt(`  Confirm? (y/N): `);
  if (confirm.toLowerCase() !== 'y') {
    console.log(`  ${YELLOW}Cancelled${NC}`);
    await prompt(`  ${DIM}Press Enter to continue...${NC}`);
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(wallets)
      .set({
        balanceCents: newBalanceCents,
        updatedAt: new Date(),
      })
      .where(eq(wallets.auth0UserId, auth0UserId));

    await tx.insert(walletTransactions).values({
      auth0UserId,
      type: 'adjustment',
      amountCents: difference,
      metadata: {
        reason: reason || 'Admin balance set',
        adminAction: 'set_balance',
        previousBalance: wallet.balanceCents,
        newBalance: newBalanceCents,
        timestamp: new Date().toISOString(),
      },
    });
  });

  console.log('');
  console.log(`  ${GREEN}✓${NC}  Balance updated successfully`);
  console.log(`  ${DIM}New balance:${NC} ${GREEN}${formatCurrency(newBalanceCents)}${NC}`);
  console.log('');
  await prompt(`  ${DIM}Press Enter to continue...${NC}`);
}

async function mainMenu() {
  while (true) {
    showHeader();
    console.log(`  ${BOLD}Main Menu${NC}`);
    console.log('');
    console.log(`  ${CYAN}1${NC}  List all users and balances`);
    console.log(`  ${CYAN}2${NC}  View user details & transactions`);
    console.log(`  ${CYAN}3${NC}  Add credits to user`);
    console.log(`  ${CYAN}4${NC}  Remove credits from user`);
    console.log(`  ${CYAN}5${NC}  Set user balance`);
    console.log(`  ${CYAN}q${NC}  Exit`);
    console.log('');

    const choice = await prompt(`  Select option: `);

    switch (choice.toLowerCase()) {
      case '1':
        await listUsers();
        break;
      case '2':
        await viewUserDetails();
        break;
      case '3':
        await addCredits();
        break;
      case '4':
        await removeCredits();
        break;
      case '5':
        await setBalance();
        break;
      case 'q':
      case 'exit':
      case 'quit':
        console.log('');
        console.log(`  ${DIM}Goodbye!${NC}`);
        console.log('');
        rl.close();
        await pool.end();
        process.exit(0);
      default:
        console.log(`  ${YELLOW}Invalid option${NC}`);
        await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

mainMenu().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
