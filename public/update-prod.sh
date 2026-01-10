#!/bin/bash
set -e

# OzVPS Production Update Script
# Updates from GitHub main branch

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

INSTALL_DIR="/opt/ozvps-panel"
SERVICE_NAME="ozvps-panel"
GITHUB_BRANCH="main"
GITHUB_REPO="rorywood/ozvps"

echo -e "${CYAN}${BOLD}"
echo "╔════════════════════════════════════════╗"
echo "║   OzVPS Production Update             ║"
echo "║   Branch: main                        ║"
echo "╚════════════════════════════════════════╝"
echo -e "${NC}"

# Check root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Must run as root${NC}"
    echo "Usage: sudo update-ozvps-prod"
    exit 1
fi

# Check if installed
if [ ! -d "$INSTALL_DIR" ]; then
    echo -e "${RED}Error: Installation not found at $INSTALL_DIR${NC}"
    echo "Run install script first:"
    echo "  curl -sSL https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/public/install-prod.sh | sudo bash"
    exit 1
fi

cd "$INSTALL_DIR"

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
TEMP_ZIP="/tmp/ozvps-update-${GITHUB_BRANCH}.zip"
curl -fsSL "https://github.com/${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.zip" -o "$TEMP_ZIP"

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
unzip -q "$TEMP_ZIP" -d /tmp/
rsync -a "/tmp/ozvps-${GITHUB_BRANCH}/" "$INSTALL_DIR/"
rm -rf "/tmp/ozvps-${GITHUB_BRANCH}" "$TEMP_ZIP"

# Restore config files
echo -e "${CYAN}Restoring configuration...${NC}"
cp "$TEMP_DIR/.env" "$INSTALL_DIR/.env" 2>/dev/null || true
cp "$TEMP_DIR/ecosystem.config.cjs" "$INSTALL_DIR/ecosystem.config.cjs" 2>/dev/null || true
rm -rf "$TEMP_DIR"

# Update dependencies
echo -e "${CYAN}Updating dependencies...${NC}"
npm install --production >/dev/null 2>&1
echo -e "${GREEN}✓ Dependencies updated${NC}"
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
