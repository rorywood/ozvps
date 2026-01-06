#!/bin/bash
set -e

INSTALL_DIR="/opt/ozvps-panel"
CONFIG_FILE="$INSTALL_DIR/.update_config"
SERVICE_NAME="ozvps-panel"
VERSION_FILE="$INSTALL_DIR/.version"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Spinner
SPINNER='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

# Temp directory
TEMP_DIR=$(mktemp -d -t ozvps-update.XXXXXXXXXX)
chmod 700 "$TEMP_DIR"

cleanup_temp() {
    [[ -d "$TEMP_DIR" ]] && rm -rf "$TEMP_DIR"
}
trap cleanup_temp EXIT

show_header() {
    clear
    echo ""
    echo -e "${CYAN}┌─────────────────────────────────────────┐${NC}"
    echo -e "${CYAN}│${NC}  ${BOLD}OzVPS Panel${NC} ${DIM}Update Tool${NC}                ${CYAN}│${NC}"
    echo -e "${CYAN}└─────────────────────────────────────────┘${NC}"
    echo ""
}

spinner() {
    local pid=$1
    local msg=$2
    local i=0
    while kill -0 $pid 2>/dev/null; do
        printf "\r  ${CYAN}${SPINNER:i++%${#SPINNER}:1}${NC}  ${msg}"
        sleep 0.1
    done
    wait $pid
    local exit_code=$?
    if [[ $exit_code -eq 0 ]]; then
        printf "\r  ${GREEN}✓${NC}  ${msg}\n"
    else
        printf "\r  ${RED}✗${NC}  ${msg}\n"
        return $exit_code
    fi
}

error_exit() {
    echo ""
    echo -e "  ${RED}✗${NC}  $1"
    echo ""
    exit 1
}

confirm() {
    local response
    read -p "  $1 " -n 1 -r response < /dev/tty
    echo ""
    [[ "$response" =~ ^[Yy]$ ]]
}

show_header

# Root check
[[ $EUID -ne 0 ]] && error_exit "Please run as root: ${BOLD}sudo update-ozvps${NC}"

# Check installation
[[ ! -d "$INSTALL_DIR" ]] && error_exit "OzVPS Panel not found. Run the installer first."

cd "$INSTALL_DIR"

# Load saved URL
SAVED_URL=""
[[ -f "$CONFIG_FILE" ]] && source "$CONFIG_FILE" && SAVED_URL="$REPLIT_URL"

# Get Replit URL
if [[ -n "$SAVED_URL" ]]; then
    echo -e "  ${DIM}Server:${NC} ${SAVED_URL}"
    echo ""
    read -p "  Press Enter to use this or paste new URL: " NEW_URL </dev/tty
    [[ -n "$NEW_URL" ]] && REPLIT_URL="$NEW_URL" || REPLIT_URL="$SAVED_URL"
else
    read -p "  Enter Replit URL: " REPLIT_URL </dev/tty
fi

[[ -z "$REPLIT_URL" ]] && error_exit "Replit URL is required"
REPLIT_URL="${REPLIT_URL%/}"
[[ ! "$REPLIT_URL" =~ ^https:// ]] && error_exit "URL must use HTTPS"

echo "REPLIT_URL=\"$REPLIT_URL\"" > "$CONFIG_FILE"
chmod 600 "$CONFIG_FILE"

# Get current installed version
CURRENT_VERSION="unknown"
[[ -f "$VERSION_FILE" ]] && CURRENT_VERSION=$(cat "$VERSION_FILE")

echo ""
echo -e "  ${DIM}Checking for updates...${NC}"

# Fetch remote version
REMOTE_VERSION_JSON=$(curl -fsSL "$REPLIT_URL/api/version" 2>/dev/null || echo '{}')

if [[ "$REMOTE_VERSION_JSON" == "{}" ]] || [[ -z "$REMOTE_VERSION_JSON" ]]; then
    error_exit "Could not connect to server. Is your Replit app running?"
fi

REMOTE_VERSION=$(echo "$REMOTE_VERSION_JSON" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
REMOTE_DATE=$(echo "$REMOTE_VERSION_JSON" | grep -o '"date":"[^"]*"' | cut -d'"' -f4)

if [[ -z "$REMOTE_VERSION" ]]; then
    error_exit "Could not fetch version info from server"
fi

echo ""
echo -e "  ${DIM}Installed:${NC}  ${BOLD}$CURRENT_VERSION${NC}"
echo -e "  ${DIM}Available:${NC}  ${BOLD}$REMOTE_VERSION${NC} ${DIM}($REMOTE_DATE)${NC}"
echo ""

# Compare versions
if [[ "$CURRENT_VERSION" == "$REMOTE_VERSION" ]]; then
    echo -e "${GREEN}┌─────────────────────────────────────────┐${NC}"
    echo -e "${GREEN}│${NC}  ${BOLD}Already up to date!${NC}                    ${GREEN}│${NC}"
    echo -e "${GREEN}└─────────────────────────────────────────┘${NC}"
    echo ""
    exit 0
fi

# Show what's new
echo -e "  ${CYAN}What's new in v${REMOTE_VERSION}:${NC}"
echo "$REMOTE_VERSION_JSON" | grep -o '"changes":\[[^]]*\]' | sed 's/"changes":\[//;s/\]$//' | tr ',' '\n' | sed 's/"//g;s/^/    • /'
echo ""

# Ask to proceed
if ! confirm "Download and install v${REMOTE_VERSION}? (Y/n):"; then
    echo "  Update cancelled."
    exit 0
fi

echo ""
echo -e "${BOLD}  Updating to v${REMOTE_VERSION}...${NC}"
echo ""

# Download
ARCHIVE_FILE="$TEMP_DIR/ozvps-update.tar.gz"
(curl -fsSL "$REPLIT_URL/download.tar.gz" -o "$ARCHIVE_FILE") &
spinner $! "Downloading v${REMOTE_VERSION}"

# Backup
(cp -r "$INSTALL_DIR" "${INSTALL_DIR}.backup.$(date +%Y%m%d%H%M%S)") &
spinner $! "Creating backup"

# Backup configs
cp "$INSTALL_DIR/.env" "$TEMP_DIR/env-backup" 2>/dev/null || true
cp "$INSTALL_DIR/ecosystem.config.cjs" "$TEMP_DIR/ecosystem-backup" 2>/dev/null || true
cp "$INSTALL_DIR/.update_config" "$TEMP_DIR/update-config-backup" 2>/dev/null || true
cp "$INSTALL_DIR/.panel_domain" "$TEMP_DIR/domain-backup" 2>/dev/null || true
cp "$INSTALL_DIR/.version" "$TEMP_DIR/version-backup" 2>/dev/null || true

# Clean old files
(
    rm -rf "$INSTALL_DIR/client" "$INSTALL_DIR/server" "$INSTALL_DIR/shared" "$INSTALL_DIR/public" "$INSTALL_DIR/script"
    rm -f "$INSTALL_DIR/package.json" "$INSTALL_DIR/package-lock.json" "$INSTALL_DIR/tsconfig.json"
    rm -f "$INSTALL_DIR/vite.config.ts" "$INSTALL_DIR/vite-plugin-meta-images.ts" "$INSTALL_DIR/postcss.config.js"
    rm -f "$INSTALL_DIR/drizzle.config.ts" "$INSTALL_DIR/tailwind.config.ts" "$INSTALL_DIR/components.json"
) &
spinner $! "Removing old files"

# Extract
(tar -xzf "$ARCHIVE_FILE" -C "$INSTALL_DIR") &
spinner $! "Extracting update"

# Restore configs
cp "$TEMP_DIR/env-backup" "$INSTALL_DIR/.env" 2>/dev/null || true
cp "$TEMP_DIR/ecosystem-backup" "$INSTALL_DIR/ecosystem.config.cjs" 2>/dev/null || true
cp "$TEMP_DIR/update-config-backup" "$INSTALL_DIR/.update_config" 2>/dev/null || true
cp "$TEMP_DIR/domain-backup" "$INSTALL_DIR/.panel_domain" 2>/dev/null || true

# Save new version
echo "$REMOTE_VERSION" > "$VERSION_FILE"

# Remove bad-words package if present
if grep -q '"bad-words"' "$INSTALL_DIR/package.json" 2>/dev/null; then
    (cd "$INSTALL_DIR" && npm uninstall bad-words 2>/dev/null || true) &
    spinner $! "Removing incompatible packages"
fi

# Install dependencies
echo -e "  ${CYAN}○${NC}  Installing dependencies..."
cd "$INSTALL_DIR"
if ! npm install 2>"$TEMP_DIR/npm-error.log"; then
    echo -e "\r  ${RED}✗${NC}  Installing dependencies"
    cat "$TEMP_DIR/npm-error.log"
    exit 1
fi
echo -e "\r  ${GREEN}✓${NC}  Installing dependencies"

# Build
echo -e "  ${CYAN}○${NC}  Building application..."
if ! npm run build 2>"$TEMP_DIR/build-error.log"; then
    echo -e "\r  ${RED}✗${NC}  Building application"
    cat "$TEMP_DIR/build-error.log"
    exit 1
fi
echo -e "\r  ${GREEN}✓${NC}  Building application"

# Update the update command
if [[ -f "$INSTALL_DIR/public/update-ozvps.sh" ]]; then
    (cp "$INSTALL_DIR/public/update-ozvps.sh" /usr/local/bin/update-ozvps && chmod +x /usr/local/bin/update-ozvps) &
    spinner $! "Updating update command"
fi

# Restart
(pm2 restart "$SERVICE_NAME" 2>/dev/null || pm2 start "$INSTALL_DIR/ecosystem.config.cjs"; pm2 save 2>/dev/null) &
spinner $! "Restarting application"

# Cleanup old backups (keep last 3)
(ls -dt ${INSTALL_DIR}.backup.* 2>/dev/null | tail -n +4 | xargs rm -rf 2>/dev/null || true) &
spinner $! "Cleaning up old backups"

echo ""
echo -e "${GREEN}┌─────────────────────────────────────────┐${NC}"
echo -e "${GREEN}│${NC}  ${BOLD}Updated to v${REMOTE_VERSION}!${NC}                      ${GREEN}│${NC}"
echo -e "${GREEN}└─────────────────────────────────────────┘${NC}"
echo ""
echo -e "  ${DIM}Status:${NC} pm2 status"
echo -e "  ${DIM}Logs:${NC}   pm2 logs $SERVICE_NAME"
echo ""
