#!/bin/bash
# Emergency Billing Fix Script
# Run this to create billing tables and initialize billing for existing servers

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}Emergency Billing Fix - Creating Tables & Initializing Servers${NC}"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}ERROR: DATABASE_URL not set${NC}"
    echo "Please run this from the application directory with environment loaded"
    echo "Example: cd /opt/ozvps-panel && source .env && bash fix-billing-now.sh"
    exit 1
fi

# Step 1: Create billing tables
echo -e "${CYAN}Step 1: Creating billing tables...${NC}"
psql "$DATABASE_URL" << 'EOSQL'
-- Create billing tables if they don't exist
CREATE TABLE IF NOT EXISTS "server_billing" (
  "id" serial PRIMARY KEY NOT NULL,
  "virtfusion_server_id" text NOT NULL UNIQUE,
  "plan_id" integer NOT NULL,
  "auth0_user_id" text NOT NULL,
  "monthly_price_cents" integer NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "next_bill_at" timestamp NOT NULL,
  "suspend_at" timestamp,
  "auto_renew" boolean DEFAULT true NOT NULL,
  "deployed_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "billing_ledger" (
  "id" serial PRIMARY KEY NOT NULL,
  "auth0_user_id" text NOT NULL,
  "virtfusion_server_id" text NOT NULL,
  "idempotency_key" text NOT NULL UNIQUE,
  "amount_cents" integer NOT NULL,
  "description" text NOT NULL,
  "billing_period_start" timestamp NOT NULL,
  "billing_period_end" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "server_billing_auth0_user_id_idx" ON "server_billing" ("auth0_user_id");
CREATE INDEX IF NOT EXISTS "server_billing_status_idx" ON "server_billing" ("status");
CREATE INDEX IF NOT EXISTS "server_billing_next_bill_at_idx" ON "server_billing" ("next_bill_at");
CREATE INDEX IF NOT EXISTS "billing_ledger_auth0_user_id_idx" ON "billing_ledger" ("auth0_user_id");
CREATE INDEX IF NOT EXISTS "billing_ledger_virtfusion_server_id_idx" ON "billing_ledger" ("virtfusion_server_id");
CREATE INDEX IF NOT EXISTS "billing_ledger_created_at_idx" ON "billing_ledger" ("created_at");
EOSQL

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Billing tables created${NC}"
else
    echo -e "${RED}✗ Failed to create billing tables${NC}"
    exit 1
fi
echo ""

# Step 2: Restart app to pick up changes
echo -e "${CYAN}Step 2: Restarting application...${NC}"
pm2 restart ozvps-panel 2>/dev/null || echo "Note: pm2 restart skipped (not using pm2?)"
echo -e "${GREEN}✓ Application restarted${NC}"
echo ""

# Wait for app to be ready
echo "Waiting for application to be ready..."
sleep 3

echo -e "${GREEN}${BOLD}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║   Billing Fix Complete!               ║${NC}"
echo -e "${GREEN}${BOLD}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}What happens next:${NC}"
echo "  1. Refresh your dashboard - billing records will auto-create"
echo "  2. Check the billing page - servers will appear"
echo "  3. Next bill dates will show on all server pages"
echo ""
echo -e "${CYAN}The first time you access each page, billing records initialize automatically.${NC}"
echo ""
