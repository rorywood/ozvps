#!/bin/bash
set -e

VERSION="1.6.0"
INSTALL_DIR="/opt/ozvps-panel"
CONFIG_FILE="$INSTALL_DIR/.update_config"
SERVICE_NAME="ozvps-panel"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Spinner characters
SPINNER='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

# Create secure temp directory
TEMP_DIR=$(mktemp -d -t ozvps-update.XXXXXXXXXX)
chmod 700 "$TEMP_DIR"

cleanup_temp() {
    if [[ -d "$TEMP_DIR" ]]; then
        rm -rf "$TEMP_DIR"
    fi
}
trap cleanup_temp EXIT

show_header() {
    clear
    echo ""
    echo -e "${CYAN}┌─────────────────────────────────────────┐${NC}"
    echo -e "${CYAN}│${NC}  ${BOLD}OzVPS Panel${NC} ${DIM}Update Tool v${VERSION}${NC}         ${CYAN}│${NC}"
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

run_step() {
    local msg=$1
    shift
    ("$@" > /dev/null 2>&1) &
    spinner $! "$msg"
}

run_step_visible() {
    local msg=$1
    shift
    echo -e "  ${CYAN}○${NC}  ${msg}"
    "$@"
    echo -e "\r  ${GREEN}✓${NC}  ${msg}"
}

error_exit() {
    echo ""
    echo -e "  ${RED}✗${NC}  $1"
    echo ""
    exit 1
}

show_header

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    error_exit "Please run as root: ${BOLD}sudo update-ozvps${NC}"
fi

# Check if OzVPS Panel is installed
if [[ ! -d "$INSTALL_DIR" ]]; then
    error_exit "OzVPS Panel not found. Run the installer first."
fi

cd "$INSTALL_DIR"

# Load saved config
SAVED_URL=""
if [[ -f "$CONFIG_FILE" ]]; then
    source "$CONFIG_FILE"
    SAVED_URL="$REPLIT_URL"
fi

# Get Replit URL
if [[ -n "$SAVED_URL" ]]; then
    echo -e "  ${DIM}Last URL:${NC} ${SAVED_URL}"
    echo ""
    read -p "  Press Enter to use this URL or paste new: " NEW_URL </dev/tty
    if [[ -n "$NEW_URL" ]]; then
        REPLIT_URL="$NEW_URL"
    else
        REPLIT_URL="$SAVED_URL"
    fi
else
    read -p "  Enter Replit URL: " REPLIT_URL </dev/tty
fi

[[ -z "$REPLIT_URL" ]] && error_exit "Replit URL is required"

REPLIT_URL="${REPLIT_URL%/}"

if [[ ! "$REPLIT_URL" =~ ^https:// ]]; then
    error_exit "URL must use HTTPS"
fi

echo "REPLIT_URL=\"$REPLIT_URL\"" > "$CONFIG_FILE"
chmod 600 "$CONFIG_FILE"

echo ""
echo -e "${BOLD}  Updating OzVPS Panel...${NC}"
echo ""

# Download
ARCHIVE_FILE="$TEMP_DIR/ozvps-update.tar.gz"
(curl -fsSL "$REPLIT_URL/download.tar.gz" -o "$ARCHIVE_FILE") &
spinner $! "Downloading latest version"

# Backup
(cp -r "$INSTALL_DIR" "${INSTALL_DIR}.backup.$(date +%Y%m%d%H%M%S)") &
spinner $! "Creating backup"

# Backup configs
cp "$INSTALL_DIR/.env" "$TEMP_DIR/env-backup" 2>/dev/null || true
cp "$INSTALL_DIR/ecosystem.config.cjs" "$TEMP_DIR/ecosystem-backup" 2>/dev/null || true
cp "$INSTALL_DIR/.update_config" "$TEMP_DIR/update-config-backup" 2>/dev/null || true
cp "$INSTALL_DIR/.panel_domain" "$TEMP_DIR/domain-backup" 2>/dev/null || true

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

# Remove bad-words package if present (has ESM/CJS issues)
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
echo -e "${GREEN}│${NC}  ${BOLD}Update Complete!${NC}                       ${GREEN}│${NC}"
echo -e "${GREEN}└─────────────────────────────────────────┘${NC}"
echo ""
echo -e "  ${DIM}Status:${NC} pm2 status"
echo -e "  ${DIM}Logs:${NC}   pm2 logs $SERVICE_NAME"
echo ""
