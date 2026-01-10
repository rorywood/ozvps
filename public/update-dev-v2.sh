#!/bin/bash
set -e

# OzVPS Development Update Script
# Updates from GitHub dev branch

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

INSTALL_DIR="/opt/ozvps-panel"
SERVICE_NAME="ozvps-panel"
GITHUB_BRANCH="claude/dev-l5488"
GITHUB_REPO="rorywood/ozvps"

echo -e "${CYAN}${BOLD}"
echo "╔════════════════════════════════════════╗"
echo "║   OzVPS Development Update v2         ║"
echo "║   Branch: claude/dev-l5488            ║"
echo "╚════════════════════════════════════════╝"
echo -e "${NC}"

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Must run as root${NC}"
    exit 1
fi

if [ ! -d "$INSTALL_DIR" ]; then
    echo -e "${RED}Error: Installation not found at $INSTALL_DIR${NC}"
    exit 1
fi

cd "$INSTALL_DIR"

# STEP 1: PostgreSQL
echo -e "\n${CYAN}${BOLD}  STEP 1: PostgreSQL${NC}"
if ! command -v psql &>/dev/null; then
    apt-get update && apt-get install -y postgresql postgresql-contrib
fi
systemctl start postgresql || service postgresql start
systemctl enable postgresql || true
sleep 2
sudo -u postgres psql -c "CREATE USER ozvps_dev WITH PASSWORD 'OzVPS_Dev_2024!';" 2>&1 || true
sudo -u postgres psql -c "CREATE DATABASE ozvps_dev OWNER ozvps_dev;" 2>&1 || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ozvps_dev TO ozvps_dev;" 2>&1 || true
[ -f "$INSTALL_DIR/.env" ] && sed -i 's|DATABASE_URL=.*|DATABASE_URL=postgresql://ozvps_dev:OzVPS_Dev_2024!@localhost:5432/ozvps_dev|' "$INSTALL_DIR/.env"
echo -e "${GREEN}✓ Database ready${NC}"

# STEP 2: Download
echo -e "\n${CYAN}${BOLD}  STEP 2: Download Code${NC}"
TEMP_DIR=$(mktemp -d)
cp "$INSTALL_DIR/.env" "$TEMP_DIR/.env" 2>/dev/null || true
cp "$INSTALL_DIR/ecosystem.config.cjs" "$TEMP_DIR/ecosystem.config.cjs" 2>/dev/null || true

SAFE_BRANCH=$(echo "${GITHUB_BRANCH}" | tr '/' '-')
TEMP_ZIP="/tmp/ozvps-update-${SAFE_BRANCH}.zip"
TEMP_EXTRACT="/tmp/ozvps-update-${SAFE_BRANCH}-extract"
curl -fsSL "https://github.com/${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.zip" -o "$TEMP_ZIP"

find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 ! -name 'node_modules' ! -name '.env' ! -name 'ecosystem.config.cjs' -exec rm -rf {} +
rm -rf "$TEMP_EXTRACT" && mkdir -p "$TEMP_EXTRACT"
unzip -q "$TEMP_ZIP" -d "$TEMP_EXTRACT"
EXTRACTED_DIR=$(find "$TEMP_EXTRACT" -mindepth 1 -maxdepth 1 -type d -name "ozvps-*" | head -1)
cp -r "${EXTRACTED_DIR}"/* "$INSTALL_DIR/"
cp -r "${EXTRACTED_DIR}"/.[^.]* "$INSTALL_DIR/" 2>/dev/null || true
cp "$TEMP_DIR/.env" "$INSTALL_DIR/.env" 2>/dev/null || true
cp "$TEMP_DIR/ecosystem.config.cjs" "$INSTALL_DIR/ecosystem.config.cjs" 2>/dev/null || true
rm -rf "$TEMP_DIR" "$TEMP_EXTRACT" "$TEMP_ZIP"
echo -e "${GREEN}✓ Code updated${NC}"

# STEP 3: Build
echo -e "\n${CYAN}${BOLD}  STEP 3: Build${NC}"
cd "$INSTALL_DIR"
npm install && npm run build
echo -e "${GREEN}✓ Built${NC}"

# STEP 4: Migrations
echo -e "\n${CYAN}${BOLD}  STEP 4: Migrations${NC}"
set -a && source "$INSTALL_DIR/.env" && set +a
npx drizzle-kit push --force
echo -e "${GREEN}✓ Migrations done${NC}"

# STEP 5: Restart
echo -e "\n${CYAN}${BOLD}  STEP 5: Restart${NC}"
pm2 delete "$SERVICE_NAME" 2>/dev/null || true
pm2 start "$INSTALL_DIR/ecosystem.config.cjs"
pm2 save --force
sleep 3
echo -e "${GREEN}✓ Running${NC}"

echo -e "\n${GREEN}${BOLD}Update Complete!${NC}\n"
