#!/bin/bash
# Test Migration Script - See what's actually happening

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}Testing Migration System${NC}"
echo ""

# Check current directory
echo -e "${CYAN}1. Checking current directory:${NC}"
pwd
echo ""

# Check if .env exists
echo -e "${CYAN}2. Checking for .env file:${NC}"
if [ -f ".env" ]; then
  echo -e "${GREEN}✓ .env file exists${NC}"
  echo "Loading environment..."
  set -a
  source .env
  set +a
else
  echo -e "${RED}✗ .env file NOT FOUND${NC}"
  exit 1
fi
echo ""

# Check DATABASE_URL
echo -e "${CYAN}3. Checking DATABASE_URL:${NC}"
if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}✗ DATABASE_URL is NOT set${NC}"
  echo "Your .env file doesn't have DATABASE_URL or it's empty"
  exit 1
else
  echo -e "${GREEN}✓ DATABASE_URL is set${NC}"
  # Show first 30 chars (don't reveal full password)
  echo "Value: ${DATABASE_URL:0:30}..."
fi
echo ""

# Check if migrate.js exists
echo -e "${CYAN}4. Checking for migrate.js:${NC}"
if [ -f "migrate.js" ]; then
  echo -e "${GREEN}✓ migrate.js exists${NC}"
else
  echo -e "${RED}✗ migrate.js NOT FOUND${NC}"
  exit 1
fi
echo ""

# Check migrations directory
echo -e "${CYAN}5. Checking migrations directory:${NC}"
if [ -d "migrations" ]; then
  echo -e "${GREEN}✓ migrations directory exists${NC}"
  echo "SQL files:"
  ls -la migrations/*.sql 2>/dev/null || echo "  No .sql files found"
else
  echo -e "${RED}✗ migrations directory NOT FOUND${NC}"
  exit 1
fi
echo ""

# Try running migrate.js
echo -e "${CYAN}6. Running migrate.js:${NC}"
if node migrate.js; then
  echo -e "${GREEN}✓ Migrations ran successfully${NC}"
else
  echo -e "${RED}✗ Migration failed${NC}"
  echo "Check the error above"
  exit 1
fi
echo ""

# Check if billing tables exist
echo -e "${CYAN}7. Checking if billing tables exist:${NC}"
if node check-billing-status.js; then
  echo -e "${GREEN}✓ Billing check completed${NC}"
else
  echo -e "${YELLOW}⚠ Could not check billing status${NC}"
fi
echo ""

echo -e "${GREEN}All tests completed!${NC}"
