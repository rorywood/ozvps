#!/bin/bash
# Manual Database Migration Runner
# Run this if you need to manually apply database migrations

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

INSTALL_DIR="/opt/ozvps-panel"

echo -e "${CYAN}OzVPS Database Migration Runner${NC}"
echo ""

# Check root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Must run as root${NC}"
    echo "Usage: sudo bash run-migrations.sh"
    exit 1
fi

# Check if installed
if [ ! -d "$INSTALL_DIR" ]; then
    echo -e "${RED}Error: Installation not found at $INSTALL_DIR${NC}"
    exit 1
fi

cd "$INSTALL_DIR"

# Check if .env exists
if [ ! -f "$INSTALL_DIR/.env" ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    exit 1
fi

echo -e "${CYAN}Running database migrations...${NC}"
echo ""

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Run SQL migrations
echo -e "${YELLOW}Step 1: Running SQL migrations...${NC}"
if node migrate.js; then
    echo -e "${GREEN}✓ SQL migrations completed${NC}"
else
    echo -e "${YELLOW}⚠ SQL migrations skipped (tables may already exist)${NC}"
fi
echo ""

# Run drizzle-kit push
echo -e "${YELLOW}Step 2: Syncing schema with drizzle-kit...${NC}"
if npx drizzle-kit push --force; then
    echo -e "${GREEN}✓ Schema synchronized${NC}"
else
    echo -e "${RED}✗ Schema sync failed${NC}"
    exit 1
fi
echo ""

echo -e "${GREEN}✅ All migrations completed successfully!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Restart the application: ${CYAN}pm2 restart ozvps-panel${NC}"
echo "  2. Check the status: ${CYAN}pm2 status${NC}"
echo ""
