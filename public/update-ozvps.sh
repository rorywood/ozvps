#!/bin/bash
set -e

# OzVPS Panel Update Script
# Run with: update-ozvps

VERSION="1.4.0"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

INSTALL_DIR="/opt/ozvps-panel"
CONFIG_FILE="$INSTALL_DIR/.update_config"
SERVICE_NAME="ozvps-panel"

# Create secure temp directory
TEMP_DIR=$(mktemp -d -t ozvps-update.XXXXXXXXXX)
chmod 700 "$TEMP_DIR"

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "\n${CYAN}==>${NC} $1"; }

# Cleanup function to remove temp files on exit
cleanup_temp() {
    if [[ -d "$TEMP_DIR" ]]; then
        rm -rf "$TEMP_DIR"
    fi
}
trap cleanup_temp EXIT

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    log_error "This script must be run as root (use sudo)"
    exit 1
fi

# Check if OzVPS Panel is installed
if [[ ! -d "$INSTALL_DIR" ]]; then
    log_error "OzVPS Panel is not installed at $INSTALL_DIR"
    log_info "Please run the installer first"
    exit 1
fi

cd "$INSTALL_DIR"

# Load saved config if exists
SAVED_URL=""
if [[ -f "$CONFIG_FILE" ]]; then
    source "$CONFIG_FILE"
    SAVED_URL="$REPLIT_URL"
fi

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║              OzVPS Panel Update Script                        ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Ask for Replit URL
if [[ -n "$SAVED_URL" ]]; then
    echo -e "Last used Replit URL: ${GREEN}$SAVED_URL${NC}"
    read -p "Press Enter to use this URL, or paste a new one: " NEW_URL </dev/tty
    if [[ -n "$NEW_URL" ]]; then
        REPLIT_URL="$NEW_URL"
    else
        REPLIT_URL="$SAVED_URL"
    fi
else
    echo -e "${YELLOW}Enter your Replit development URL${NC}"
    echo -e "Example: https://8d85f4f1-9822-43d8-8fef-61748f2aba09-00-3565k9mtun2wb.worf.replit.dev/"
    read -p "Replit URL: " REPLIT_URL </dev/tty
fi

# Validate URL
if [[ -z "$REPLIT_URL" ]]; then
    log_error "Replit URL is required"
    exit 1
fi

# Remove trailing slash if present
REPLIT_URL="${REPLIT_URL%/}"

# Enforce HTTPS for security
if [[ ! "$REPLIT_URL" =~ ^https:// ]]; then
    log_error "URL must use HTTPS for security"
    log_info "Example: https://your-app.replit.dev/"
    exit 1
fi

# Save URL for next time
echo "REPLIT_URL=\"$REPLIT_URL\"" > "$CONFIG_FILE"
chmod 600 "$CONFIG_FILE"

DOWNLOAD_URL="$REPLIT_URL/download.tar.gz"

log_step "Downloading latest OzVPS Panel..."
log_info "From: $DOWNLOAD_URL"

# Download archive to secure temp directory
ARCHIVE_FILE="$TEMP_DIR/ozvps-update.tar.gz"
if ! curl -fsSL "$DOWNLOAD_URL" -o "$ARCHIVE_FILE"; then
    log_error "Failed to download update"
    log_info "Make sure your Replit app is running and the URL is correct"
    exit 1
fi

log_step "Backing up current installation..."
BACKUP_DIR="${INSTALL_DIR}.backup.$(date +%Y%m%d%H%M%S)"
cp -r "$INSTALL_DIR" "$BACKUP_DIR"
log_info "Backup saved to: $BACKUP_DIR"

log_step "Extracting update..."

# Backup config files to secure temp directory
cp "$INSTALL_DIR/.env" "$TEMP_DIR/env-backup" 2>/dev/null || true
cp "$INSTALL_DIR/ecosystem.config.cjs" "$TEMP_DIR/ecosystem-backup" 2>/dev/null || true
cp "$INSTALL_DIR/.update_config" "$TEMP_DIR/update-config-backup" 2>/dev/null || true
cp "$INSTALL_DIR/.panel_domain" "$TEMP_DIR/domain-backup" 2>/dev/null || true

# Remove old source files but keep node_modules for faster install
rm -rf "$INSTALL_DIR/client" "$INSTALL_DIR/server" "$INSTALL_DIR/shared" "$INSTALL_DIR/public" "$INSTALL_DIR/script"
rm -f "$INSTALL_DIR/package.json" "$INSTALL_DIR/package-lock.json" "$INSTALL_DIR/tsconfig.json"
rm -f "$INSTALL_DIR/vite.config.ts" "$INSTALL_DIR/vite-plugin-meta-images.ts" "$INSTALL_DIR/postcss.config.js"
rm -f "$INSTALL_DIR/drizzle.config.ts" "$INSTALL_DIR/tailwind.config.ts" "$INSTALL_DIR/components.json"

# Extract new files
tar -xzf "$ARCHIVE_FILE" -C "$INSTALL_DIR"

# Restore config files
cp "$TEMP_DIR/env-backup" "$INSTALL_DIR/.env" 2>/dev/null || true
cp "$TEMP_DIR/ecosystem-backup" "$INSTALL_DIR/ecosystem.config.cjs" 2>/dev/null || true
cp "$TEMP_DIR/update-config-backup" "$INSTALL_DIR/.update_config" 2>/dev/null || true
cp "$TEMP_DIR/domain-backup" "$INSTALL_DIR/.panel_domain" 2>/dev/null || true

log_step "Applying compatibility fixes..."

# Remove bad-words package if present (has ESM/CJS issues)
if grep -q '"bad-words"' "$INSTALL_DIR/package.json" 2>/dev/null; then
    cd "$INSTALL_DIR"
    npm uninstall bad-words 2>/dev/null || true
    log_info "Removed incompatible bad-words package"
fi

log_step "Installing dependencies..."
cd "$INSTALL_DIR"
npm install

log_step "Building application..."
npm run build

log_step "Updating the update command..."
# Self-update: copy the new update script to /usr/local/bin
if [[ -f "$INSTALL_DIR/public/update-ozvps.sh" ]]; then
    cp "$INSTALL_DIR/public/update-ozvps.sh" /usr/local/bin/update-ozvps
    chmod +x /usr/local/bin/update-ozvps
    log_info "Update command refreshed"
fi

log_step "Restarting application..."
pm2 restart "$SERVICE_NAME" 2>/dev/null || pm2 start "$INSTALL_DIR/ecosystem.config.cjs"
pm2 save

# Cleanup old backups (keep last 3)
log_step "Cleaning up old backups..."
ls -dt ${INSTALL_DIR}.backup.* 2>/dev/null | tail -n +4 | xargs rm -rf 2>/dev/null || true

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}║           OzVPS Panel Updated Successfully!                   ║${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Saved Replit URL:${NC} $REPLIT_URL"
echo -e "${YELLOW}(You can change this on next update)${NC}"
echo ""
echo -e "${YELLOW}To check status:${NC} pm2 status"
echo -e "${YELLOW}To view logs:${NC} pm2 logs $SERVICE_NAME"
echo ""
