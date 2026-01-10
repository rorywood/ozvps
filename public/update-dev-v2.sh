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

# Check and install PostgreSQL if needed
echo -e "${CYAN}Checking PostgreSQL...${NC}"
if ! command -v psql &>/dev/null; then
    echo -e "${YELLOW}→${NC} PostgreSQL not found, installing..."
    apt-get update >/dev/null 2>&1
    apt-get install -y postgresql postgresql-contrib >/dev/null 2>&1
    systemctl start postgresql
    systemctl enable postgresql
    echo -e "${GREEN}✓ PostgreSQL installed${NC}"
else
    echo -e "${GREEN}✓ PostgreSQL already installed${NC}"
    systemctl start postgresql 2>/dev/null || true
fi

# Check if database exists, create if not
echo -e "${CYAN}Checking database...${NC}"
DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='ozvps_dev'" 2>/dev/null || echo "")
if [ "$DB_EXISTS" != "1" ]; then
    echo -e "${YELLOW}→${NC} Creating database and user..."
    # Create user if not exists
    sudo -u postgres psql -c "CREATE USER ozvps_dev WITH PASSWORD 'OzVPS_Dev_2024!';" 2>/dev/null || true
    # Create database
    sudo -u postgres psql -c "CREATE DATABASE ozvps_dev OWNER ozvps_dev;" 2>/dev/null || true
    # Grant privileges
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ozvps_dev TO ozvps_dev;" 2>/dev/null || true
    echo -e "${GREEN}✓ Database created${NC}"

    # Update .env with correct DATABASE_URL
    if [ -f "$INSTALL_DIR/.env" ]; then
        sed -i 's|DATABASE_URL=.*|DATABASE_URL=postgresql://ozvps_dev:OzVPS_Dev_2024!@localhost:5432/ozvps_dev|' "$INSTALL_DIR/.env"
        echo -e "${GREEN}✓ Updated DATABASE_URL in .env${NC}"
    fi
else
    echo -e "${GREEN}✓ Database already exists${NC}"
fi
echo ""

# Create backup
echo -e "${CYAN}Creating backup...${NC}"
BACKUP_DIR="${INSTALL_DIR}.backup.$(date +%Y%m%d%H%M%S)"
cp -r "$INSTALL_DIR" "$BACKUP_DIR"
echo -e "${GREEN}✓ Backup created at $BACKUP_DIR${NC}"
echo ""

# Backup config files
echo -e "${CYAN}Backing up configuration...${NC}"
TEMP_DIR=$(mktemp -d)
cp "$INSTALL_DIR/.env" "$TEMP_DIR/.env" 2>/dev/null || true
cp "$INSTALL_DIR/ecosystem.config.cjs" "$TEMP_DIR/ecosystem.config.cjs" 2>/dev/null || true

# Download latest code
echo -e "${CYAN}Downloading latest code from GitHub (${GITHUB_BRANCH} branch)...${NC}"
SAFE_BRANCH=$(echo "${GITHUB_BRANCH}" | tr '/' '-')
TEMP_ZIP="/tmp/ozvps-update-${SAFE_BRANCH}.zip"
TEMP_EXTRACT="/tmp/ozvps-update-${SAFE_BRANCH}-extract"

if ! curl -fsSL "https://github.com/${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.zip" -o "$TEMP_ZIP"; then
    echo -e "${RED}Error: Failed to download from GitHub${NC}"
    exit 1
fi

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
mkdir -p "$TEMP_EXTRACT"
if ! unzip -q "$TEMP_ZIP" -d "$TEMP_EXTRACT"; then
    echo -e "${RED}Error: Failed to extract zip file${NC}"
    rm -f "$TEMP_ZIP"
    exit 1
fi

EXTRACTED_DIR=$(find "$TEMP_EXTRACT" -mindepth 1 -maxdepth 1 -type d -name "ozvps-*" | head -1)
if [ -z "$EXTRACTED_DIR" ]; then
    echo -e "${RED}Error: Could not find extracted directory${NC}"
    rm -rf "$TEMP_EXTRACT" "$TEMP_ZIP"
    exit 1
fi

echo -e "${CYAN}Copying files from extracted directory...${NC}"
echo "Source: $EXTRACTED_DIR"
echo "Target: $INSTALL_DIR"

# Use cp -r instead of rsync for more reliable copying
cp -r "${EXTRACTED_DIR}"/* "$INSTALL_DIR/"
cp -r "${EXTRACTED_DIR}"/.[^.]* "$INSTALL_DIR/" 2>/dev/null || true

# Verify package.json was copied
if [ ! -f "$INSTALL_DIR/package.json" ]; then
    echo -e "${RED}Error: package.json not found after copy${NC}"
    echo "Checking what was extracted..."
    ls -la "$EXTRACTED_DIR" | head -20
    echo ""
    echo "Checking install directory..."
    ls -la "$INSTALL_DIR" | head -20
    rm -rf "$TEMP_EXTRACT" "$TEMP_ZIP"
    exit 1
fi

echo -e "${GREEN}✓ Files copied successfully${NC}"
rm -rf "$TEMP_EXTRACT" "$TEMP_ZIP"

# Restore config files
echo -e "${CYAN}Restoring configuration...${NC}"
cp "$TEMP_DIR/.env" "$INSTALL_DIR/.env" 2>/dev/null || true
cp "$TEMP_DIR/ecosystem.config.cjs" "$INSTALL_DIR/ecosystem.config.cjs" 2>/dev/null || true
rm -rf "$TEMP_DIR"

# Update dependencies and build
echo -e "${CYAN}Installing dependencies...${NC}"
npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

echo -e "${CYAN}Building application...${NC}"
npm run build
echo -e "${GREEN}✓ Application built${NC}"
echo ""

echo -e "${CYAN}Running database migrations...${NC}"
# Load environment variables for migrations
if [ -f "$INSTALL_DIR/.env" ]; then
  echo "Loading environment from .env..."
  set -a
  source "$INSTALL_DIR/.env"
  set +a
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}ERROR: DATABASE_URL not set in .env${NC}"
  echo "Please check your .env file"
  exit 1
fi

echo "Syncing schema with drizzle-kit..."
if npx drizzle-kit push --force; then
  echo -e "${GREEN}✓ Database schema synchronized${NC}"
else
  echo -e "${RED}✗ Schema sync failed${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Database migrations applied${NC}"
echo ""

echo -e "${CYAN}Cleaning up dev dependencies...${NC}"
npm prune --production
echo -e "${GREEN}✓ Dev dependencies removed${NC}"
echo ""

# Restart application
echo -e "${CYAN}Restarting application...${NC}"
pm2 delete "$SERVICE_NAME" 2>/dev/null || true
pm2 start "$INSTALL_DIR/ecosystem.config.cjs"
pm2 save --force

# Wait for app to be healthy
echo "Waiting for application to start..."
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
echo -e "${YELLOW}Backup location: ${BACKUP_DIR}${NC}"
echo ""
