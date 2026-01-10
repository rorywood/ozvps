#!/bin/bash
set -e

# OzVPS Development Update Script
# Updates from GitHub dev branch

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

INSTALL_DIR="/opt/ozvps-panel"
SERVICE_NAME="ozvps-panel"
GITHUB_BRANCH="claude/dev-l5488"
GITHUB_REPO="rorywood/ozvps"

echo -e "${CYAN}${BOLD}"
echo "╔═════════════════════════════════════════════════════════╗"
echo "║              OzVPS Development Update                  ║"
echo "╚═════════════════════════════════════════════════════════╝"
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
printf "${CYAN}[1/7]${NC} Creating backup... "
BACKUP_DIR="${INSTALL_DIR}.backup.$(date +%Y%m%d%H%M%S)"
cp -r "$INSTALL_DIR" "$BACKUP_DIR" 2>&1 | grep -v "omitting directory" | grep -v "cannot stat" || true
echo -e "${GREEN}✓${NC}"

# Backup config files
TEMP_DIR=$(mktemp -d)
cp "$INSTALL_DIR/.env" "$TEMP_DIR/.env" 2>/dev/null || true
cp "$INSTALL_DIR/ecosystem.config.cjs" "$TEMP_DIR/ecosystem.config.cjs" 2>/dev/null || true

# Download latest code
printf "${CYAN}[2/7]${NC} Downloading from GitHub... "
SAFE_BRANCH=$(echo "${GITHUB_BRANCH}" | tr '/' '-')
TEMP_ZIP="/tmp/ozvps-update-${SAFE_BRANCH}.zip"
TEMP_EXTRACT="/tmp/ozvps-update-${SAFE_BRANCH}-extract"

if ! curl -fsSL "https://github.com/${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.zip" -o "$TEMP_ZIP" 2>/dev/null; then
    echo -e "${RED}✗${NC}"
    echo -e "${RED}Error: Failed to download from GitHub${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC}"

# Clear old files and extract
printf "${CYAN}[3/7]${NC} Updating files... "
find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 \
    ! -name 'node_modules' \
    ! -name '.env' \
    ! -name '.backup.*' \
    ! -name 'ecosystem.config.cjs' \
    -exec rm -rf {} + 2>/dev/null

mkdir -p "$TEMP_EXTRACT"
if ! unzip -q "$TEMP_ZIP" -d "$TEMP_EXTRACT" 2>/dev/null; then
    echo -e "${RED}✗${NC}"
    echo -e "${RED}Error: Failed to extract${NC}"
    rm -f "$TEMP_ZIP"
    exit 1
fi

EXTRACTED_DIR=$(find "$TEMP_EXTRACT" -mindepth 1 -maxdepth 1 -type d -name "ozvps-*" | head -1)
if [ -z "$EXTRACTED_DIR" ]; then
    echo -e "${RED}✗${NC}"
    echo -e "${RED}Error: Could not find extracted directory${NC}"
    rm -rf "$TEMP_EXTRACT" "$TEMP_ZIP"
    exit 1
fi

cp -r "${EXTRACTED_DIR}"/* "$INSTALL_DIR/" 2>/dev/null
cp -r "${EXTRACTED_DIR}"/.[^.]* "$INSTALL_DIR/" 2>/dev/null || true

if [ ! -f "$INSTALL_DIR/package.json" ]; then
    echo -e "${RED}✗${NC}"
    echo -e "${RED}Error: package.json not found${NC}"
    rm -rf "$TEMP_EXTRACT" "$TEMP_ZIP"
    exit 1
fi

rm -rf "$TEMP_EXTRACT" "$TEMP_ZIP"
cp "$TEMP_DIR/.env" "$INSTALL_DIR/.env" 2>/dev/null || true
cp "$TEMP_DIR/ecosystem.config.cjs" "$INSTALL_DIR/ecosystem.config.cjs" 2>/dev/null || true
rm -rf "$TEMP_DIR"
echo -e "${GREEN}✓${NC}"

# Update dependencies and build
printf "${CYAN}[4/7]${NC} Installing dependencies... "
if npm install --silent --no-progress > /tmp/npm-install.log 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    echo -e "${RED}Error installing dependencies. Log:${NC}"
    tail -20 /tmp/npm-install.log
    exit 1
fi

printf "${CYAN}[5/7]${NC} Building application... "
if npm run build > /tmp/npm-build.log 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    echo -e "${RED}Error building. Log:${NC}"
    tail -20 /tmp/npm-build.log
    exit 1
fi

printf "${CYAN}[6/7]${NC} Running migrations... "
# Load environment variables for migrations
if [ -f "$INSTALL_DIR/.env" ]; then
  set -a
  source "$INSTALL_DIR/.env" > /dev/null 2>&1
  set +a
fi

if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}✗${NC}"
  echo -e "${RED}ERROR: DATABASE_URL not set in .env${NC}"
  exit 1
fi

if npx drizzle-kit push --force > /tmp/migrations.log 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    echo -e "${RED}Error with migrations. Log:${NC}"
    tail -20 /tmp/migrations.log
    exit 1
fi

npm prune --production --silent > /dev/null 2>&1 || true

# Restart application
printf "${CYAN}[7/7]${NC} Restarting application... "
pm2 delete "$SERVICE_NAME" > /dev/null 2>&1 || true
pm2 start "$INSTALL_DIR/ecosystem.config.cjs" > /dev/null 2>&1
pm2 save --force > /dev/null 2>&1

# Wait for app to be healthy
sleep 2
APP_PORT=$(grep "PORT" "$INSTALL_DIR/.env" | cut -d'=' -f2 | tr -d ' ' || echo "3000")
for i in {1..30}; do
    if curl -s http://127.0.0.1:${APP_PORT}/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${YELLOW}⚠${NC}"
        echo -e "${YELLOW}Warning: Health check timeout${NC}"
    fi
    sleep 1
done

echo ""
echo -e "${GREEN}${BOLD}✓ Update Complete!${NC}"
echo ""
echo -e "${DIM}Logs: pm2 logs ${SERVICE_NAME}  |  Backup: ${BACKUP_DIR}${NC}"
echo ""
