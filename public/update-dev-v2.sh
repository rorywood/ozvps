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
GITHUB_BRANCH="claude/support-ticket-system-ZXocD"
GITHUB_REPO="rorywood/ozvps"

echo -e "${CYAN}${BOLD}"
echo "╔════════════════════════════════════════╗"
echo "║   OzVPS Development Update v2         ║"
echo "║   Branch: claude/dev-l5488            ║"
echo "╚════════════════════════════════════════╝"
echo -e "${NC}"

# Check root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Must run as root${NC}"
    echo "Usage: sudo update-ozvps-dev"
    exit 1
fi

# Check if installed
if [ ! -d "$INSTALL_DIR" ]; then
    echo -e "${RED}Error: Installation not found at $INSTALL_DIR${NC}"
    echo "Run install script first:"
    echo "  curl -sSL https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/public/install-dev.sh | sudo bash"
    exit 1
fi

cd "$INSTALL_DIR"

# ============================================
# STEP 1: Install PostgreSQL
# ============================================
echo ""
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}${BOLD}  STEP 1: PostgreSQL Installation          ${NC}"
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════${NC}"
echo ""

if ! command -v psql &>/dev/null; then
    echo -e "${YELLOW}→${NC} PostgreSQL not found, installing..."
    apt-get update
    apt-get install -y postgresql postgresql-contrib
    echo -e "${GREEN}✓ PostgreSQL installed${NC}"
else
    echo -e "${GREEN}✓ PostgreSQL already installed${NC}"
fi

# Start PostgreSQL
echo -e "${CYAN}Starting PostgreSQL service...${NC}"
systemctl start postgresql || service postgresql start
systemctl enable postgresql || true
sleep 2

# Verify PostgreSQL is running
if systemctl is-active --quiet postgresql; then
    echo -e "${GREEN}✓ PostgreSQL is running${NC}"
else
    echo -e "${RED}PostgreSQL failed to start, trying again...${NC}"
    systemctl restart postgresql
    sleep 3
fi

# Create database and user
echo ""
echo -e "${CYAN}Setting up database...${NC}"
sudo -u postgres psql -c "CREATE USER ozvps_dev WITH PASSWORD 'OzVPS_Dev_2024!';" 2>&1 || echo "  (user already exists)"
sudo -u postgres psql -c "CREATE DATABASE ozvps_dev OWNER ozvps_dev;" 2>&1 || echo "  (database already exists)"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ozvps_dev TO ozvps_dev;" 2>&1 || true
echo -e "${GREEN}✓ Database ready${NC}"

# Update .env with correct DATABASE_URL
if [ -f "$INSTALL_DIR/.env" ]; then
    sed -i 's|DATABASE_URL=.*|DATABASE_URL=postgresql://ozvps_dev:OzVPS_Dev_2024!@localhost:5432/ozvps_dev|' "$INSTALL_DIR/.env"
    echo -e "${GREEN}✓ Updated DATABASE_URL in .env${NC}"
fi

# ============================================
# STEP 2: Download Latest Code
# ============================================
echo ""
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}${BOLD}  STEP 2: Download Latest Code             ${NC}"
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════${NC}"
echo ""

# Backup config files
echo -e "${CYAN}Backing up configuration...${NC}"
TEMP_DIR=$(mktemp -d)
cp "$INSTALL_DIR/.env" "$TEMP_DIR/.env" 2>/dev/null || true
cp "$INSTALL_DIR/ecosystem.config.cjs" "$TEMP_DIR/ecosystem.config.cjs" 2>/dev/null || true

# Download latest code
echo -e "${CYAN}Downloading from GitHub (${GITHUB_BRANCH} branch)...${NC}"
SAFE_BRANCH=$(echo "${GITHUB_BRANCH}" | tr '/' '-')
TEMP_ZIP="/tmp/ozvps-update-${SAFE_BRANCH}.zip"
TEMP_EXTRACT="/tmp/ozvps-update-${SAFE_BRANCH}-extract"

curl -fsSL "https://github.com/${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.zip" -o "$TEMP_ZIP"
echo -e "${GREEN}✓ Downloaded${NC}"

# Clear old files (except node_modules, .env, backups)
echo -e "${CYAN}Removing old files...${NC}"
find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 \
    ! -name 'node_modules' \
    ! -name '.env' \
    ! -name '.backup.*' \
    ! -name 'ecosystem.config.cjs' \
    -exec rm -rf {} +

# Extract new code
echo -e "${CYAN}Extracting new code...${NC}"
rm -rf "$TEMP_EXTRACT"
mkdir -p "$TEMP_EXTRACT"
unzip -q "$TEMP_ZIP" -d "$TEMP_EXTRACT"

EXTRACTED_DIR=$(find "$TEMP_EXTRACT" -mindepth 1 -maxdepth 1 -type d -name "ozvps-*" | head -1)
if [ -z "$EXTRACTED_DIR" ]; then
    echo -e "${RED}Error: Could not find extracted directory${NC}"
    exit 1
fi

# Copy files
cp -r "${EXTRACTED_DIR}"/* "$INSTALL_DIR/"
cp -r "${EXTRACTED_DIR}"/.[^.]* "$INSTALL_DIR/" 2>/dev/null || true
echo -e "${GREEN}✓ Files copied${NC}"

# Restore config files
cp "$TEMP_DIR/.env" "$INSTALL_DIR/.env" 2>/dev/null || true
cp "$TEMP_DIR/ecosystem.config.cjs" "$INSTALL_DIR/ecosystem.config.cjs" 2>/dev/null || true
rm -rf "$TEMP_DIR" "$TEMP_EXTRACT" "$TEMP_ZIP"

# Verify package.json exists
if [ ! -f "$INSTALL_DIR/package.json" ]; then
    echo -e "${RED}Error: package.json not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Code updated${NC}"

# ============================================
# STEP 3: Build Application
# ============================================
echo ""
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}${BOLD}  STEP 3: Build Application                ${NC}"
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════${NC}"
echo ""

cd "$INSTALL_DIR"

echo -e "${CYAN}Installing dependencies...${NC}"
npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"

echo ""
echo -e "${CYAN}Building application...${NC}"
npm run build
echo -e "${GREEN}✓ Application built${NC}"

# Verify build output
if [ ! -f "$INSTALL_DIR/dist/public/index.html" ]; then
    echo -e "${RED}Error: Build failed - dist/public/index.html not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Build verified${NC}"

# ============================================
# STEP 4: Database Migrations
# ============================================
echo ""
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}${BOLD}  STEP 4: Database Migrations              ${NC}"
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════${NC}"
echo ""

# Load environment variables
echo -e "${CYAN}Loading environment...${NC}"
set -a
source "$INSTALL_DIR/.env"
set +a

echo -e "${CYAN}Running migrations...${NC}"
npx drizzle-kit push --force
echo -e "${GREEN}✓ Migrations complete${NC}"

# ============================================
# STEP 5: Restart Application
# ============================================
echo ""
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}${BOLD}  STEP 5: Restart Application              ${NC}"
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════${NC}"
echo ""

echo -e "${CYAN}Restarting PM2...${NC}"
pm2 delete "$SERVICE_NAME" 2>/dev/null || true
pm2 start "$INSTALL_DIR/ecosystem.config.cjs"
pm2 save --force

# Wait for app to be healthy
echo -e "${CYAN}Waiting for application to start...${NC}"
sleep 3
APP_PORT=$(grep "PORT" "$INSTALL_DIR/.env" | cut -d'=' -f2 | tr -d ' ' || echo "3000")
for i in {1..30}; do
    if curl -s http://127.0.0.1:${APP_PORT}/api/health &>/dev/null; then
        echo -e "${GREEN}✓ Application is running${NC}"
        break
    fi
    sleep 1
done

echo ""
echo -e "${GREEN}${BOLD}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║   Update Complete!                    ║${NC}"
echo -e "${GREEN}${BOLD}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}Useful Commands:${NC}"
echo -e "  Status:  ${BOLD}pm2 status${NC}"
echo -e "  Logs:    ${BOLD}pm2 logs ${SERVICE_NAME}${NC}"
echo -e "  Restart: ${BOLD}pm2 restart ${SERVICE_NAME}${NC}"
echo ""
