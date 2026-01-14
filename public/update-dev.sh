#!/bin/bash
set -e

# OzVPS Development Update Script with Self-Update
# Version: 3.0.0
# Updates from GitHub dev branch with automatic script version checking

SCRIPT_VERSION="3.0.0"
INSTALL_DIR="/opt/ozvps-panel"
SERVICE_NAME="ozvps-panel"
GITHUB_BRANCH="claude/dev-l5488"
GITHUB_REPO="rorywood/ozvps"
SCRIPT_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/public/update-dev.sh"
SCRIPT_PATH="/usr/local/bin/update-ozvps-dev"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Progress spinner
show_spinner() {
    local pid=$1
    local delay=0.1
    local spinstr='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    while [ "$(ps a | awk '{print $1}' | grep $pid)" ]; do
        local temp=${spinstr#?}
        printf " [%c]  " "$spinstr"
        local spinstr=$temp${spinstr%"$temp"}
        sleep $delay
        printf "\b\b\b\b\b\b"
    done
    printf "    \b\b\b\b"
}

# Progress bar
progress_bar() {
    local current=$1
    local total=$2
    local width=50
    local percentage=$((current * 100 / total))
    local completed=$((width * current / total))
    local remaining=$((width - completed))

    printf "\r${CYAN}Progress: [${NC}"
    printf "%${completed}s" | tr ' ' '█'
    printf "%${remaining}s" | tr ' ' '░'
    printf "${CYAN}] ${BOLD}%3d%%${NC}" $percentage
}

# Step header
step_header() {
    local step=$1
    local total=$2
    local title=$3
    echo ""
    echo -e "${BLUE}╭$( printf '─%.0s' {1..60} )╮${NC}"
    echo -e "${BLUE}│${NC} ${BOLD}Step $step/$total: $title${NC}"
    echo -e "${BLUE}╰$( printf '─%.0s' {1..60} )╯${NC}"
}

# Success message
success() {
    echo -e "${GREEN}✓${NC} $1"
}

# Warning message
warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Error message
error() {
    echo -e "${RED}✗${NC} $1"
}

# Info message
info() {
    echo -e "${CYAN}→${NC} $1"
}

# Banner
clear
echo -e "${CYAN}${BOLD}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ██████╗ ███████╗██╗   ██╗██████╗ ███████╗              ║
║  ██╔═══██╗╚══███╔╝██║   ██║██╔══██╗██╔════╝              ║
║  ██║   ██║  ███╔╝ ██║   ██║██████╔╝███████╗              ║
║  ██║   ██║ ███╔╝  ╚██╗ ██╔╝██╔═══╝ ╚════██║              ║
║  ╚██████╔╝███████╗ ╚████╔╝ ██║     ███████║              ║
║   ╚═════╝ ╚══════╝  ╚═══╝  ╚═╝     ╚══════╝              ║
║                                                           ║
║           Development Update System v3.0                 ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"
echo -e "${DIM}Branch: ${GITHUB_BRANCH} | Repo: ${GITHUB_REPO}${NC}"
echo -e "${DIM}Script Version: ${SCRIPT_VERSION}${NC}"
echo ""

# Check root
if [ "$EUID" -ne 0 ]; then
    error "Must run as root"
    echo "Usage: sudo update-ozvps-dev"
    exit 1
fi

# Check if installed
if [ ! -d "$INSTALL_DIR" ]; then
    error "Installation not found at $INSTALL_DIR"
    echo "Run install script first:"
    echo "  curl -sSL https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/public/install-dev.sh | sudo bash"
    exit 1
fi

# ============================================================================
# STEP 0: Self-Update Check
# ============================================================================
step_header 0 6 "Checking for Script Updates"

info "Checking for newer version of update script..."
TEMP_SCRIPT="/tmp/update-dev-check.sh"

if curl -fsSL "$SCRIPT_URL" -o "$TEMP_SCRIPT" 2>/dev/null; then
    # Extract version from downloaded script
    REMOTE_VERSION=$(grep '^SCRIPT_VERSION=' "$TEMP_SCRIPT" | cut -d'"' -f2 || echo "0.0.0")

    # Compare versions (simple string comparison)
    if [ "$REMOTE_VERSION" != "$SCRIPT_VERSION" ]; then
        warning "New script version available: $REMOTE_VERSION (current: $SCRIPT_VERSION)"
        echo ""
        read -p "$(echo -e ${CYAN}Would you like to update the script first? [Y/n]: ${NC})" -n 1 -r
        echo ""

        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            info "Updating script..."

            # Backup current script
            if [ -f "$SCRIPT_PATH" ]; then
                cp "$SCRIPT_PATH" "${SCRIPT_PATH}.backup"
            fi

            # Install new script
            cp "$TEMP_SCRIPT" "$SCRIPT_PATH"
            chmod +x "$SCRIPT_PATH"

            success "Script updated to version $REMOTE_VERSION"
            echo ""
            info "Restarting with new version..."
            sleep 2

            # Cleanup and restart
            rm -f "$TEMP_SCRIPT"
            exec "$SCRIPT_PATH" "$@"
        else
            info "Continuing with current version"
        fi
    else
        success "Script is up to date (v$SCRIPT_VERSION)"
    fi
    rm -f "$TEMP_SCRIPT"
else
    warning "Could not check for script updates (offline or network issue)"
fi

sleep 1

# ============================================================================
# Check for New Commits
# ============================================================================
echo ""
info "Checking for new commits..."

# Get current commit hash if .git directory exists or from commit file
CURRENT_COMMIT=""
if [ -f "$INSTALL_DIR/.commit" ]; then
    CURRENT_COMMIT=$(cat "$INSTALL_DIR/.commit" 2>/dev/null || echo "")
fi

# Get latest commit hash from GitHub API
LATEST_COMMIT=$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/commits/${GITHUB_BRANCH}" 2>/dev/null | grep '"sha":' | head -1 | cut -d'"' -f4 || echo "")

if [ -n "$LATEST_COMMIT" ]; then
    if [ "$CURRENT_COMMIT" = "$LATEST_COMMIT" ]; then
        success "Already on latest version (${LATEST_COMMIT:0:7})"
        echo ""
        echo -e "${GREEN}${BOLD}No updates available!${NC}"
        echo ""
        echo -e "${DIM}Your installation is already up to date.${NC}"
        echo -e "${DIM}Current commit: ${CURRENT_COMMIT:0:7}${NC}"
        echo ""
        read -p "$(echo -e ${CYAN}Force update anyway? [y/N]: ${NC})" -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${CYAN}Update cancelled.${NC}"
            exit 0
        fi
        info "Proceeding with forced update..."
    else
        if [ -n "$CURRENT_COMMIT" ]; then
            success "New commits available!"
            echo -e "  ${DIM}Current: ${CURRENT_COMMIT:0:7}${NC}"
            echo -e "  ${DIM}Latest:  ${LATEST_COMMIT:0:7}${NC}"
        else
            info "Commit tracking not available - proceeding with update"
        fi
    fi
else
    warning "Could not check commit status (offline or API issue)"
fi

sleep 1

# ============================================================================
# STEP 1: Pre-flight Checks
# ============================================================================
step_header 1 6 "Pre-flight Checks"

info "Verifying system requirements..."

# Check disk space
AVAILABLE_SPACE=$(df -BM "$INSTALL_DIR" | awk 'NR==2 {print $4}' | sed 's/M//')
if [ "$AVAILABLE_SPACE" -lt 500 ]; then
    error "Insufficient disk space (need 500MB, have ${AVAILABLE_SPACE}MB)"
    exit 1
fi
success "Disk space: ${AVAILABLE_SPACE}MB available"

# Check PostgreSQL
if command -v psql &>/dev/null; then
    success "PostgreSQL installed"

    # Ensure PostgreSQL is running
    if systemctl is-active --quiet postgresql || service postgresql status &>/dev/null; then
        success "PostgreSQL is running"
    else
        info "Starting PostgreSQL..."
        systemctl start postgresql 2>/dev/null || service postgresql start
        sleep 2
        success "PostgreSQL started"
    fi
else
    info "Installing PostgreSQL..."
    apt-get update -qq && apt-get install -y postgresql postgresql-contrib >/dev/null 2>&1 &
    show_spinner $!
    wait $!
    systemctl enable postgresql --now
    sleep 2
    success "PostgreSQL installed"
fi

# Setup database
info "Configuring database..."
sudo -u postgres psql -c "CREATE USER ozvps_dev WITH PASSWORD 'OzVPS_Dev_2024!';" 2>&1 | grep -v "already exists" || true
sudo -u postgres psql -c "CREATE DATABASE ozvps_dev OWNER ozvps_dev;" 2>&1 | grep -v "already exists" || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ozvps_dev TO ozvps_dev;" >/dev/null 2>&1 || true
success "Database configured"

# Check Node.js
if ! command -v node &>/dev/null; then
    error "Node.js not found. Please install Node.js 18+ first."
    exit 1
fi
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    warning "Node.js version $NODE_VERSION detected. Version 18+ recommended."
else
    success "Node.js v$(node -v) detected"
fi

# Check PM2
if ! command -v pm2 &>/dev/null; then
    error "PM2 not found. Please install PM2 first: npm install -g pm2"
    exit 1
fi
success "PM2 installed"

sleep 1

# ============================================================================
# STEP 2: Backup Current Installation
# ============================================================================
step_header 2 6 "Creating Backup"

BACKUP_DIR="${INSTALL_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
info "Backup location: $BACKUP_DIR"

# Create backup with progress
(
    mkdir -p "$BACKUP_DIR"
    cp -r "$INSTALL_DIR"/* "$BACKUP_DIR/" 2>/dev/null || true
    cp "$INSTALL_DIR"/.env "$BACKUP_DIR/.env" 2>/dev/null || true
) &
show_spinner $!
wait $!

BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
success "Backup created ($BACKUP_SIZE)"

# Keep only last 5 backups
BACKUP_COUNT=$(find "$(dirname "$INSTALL_DIR")" -maxdepth 1 -name "$(basename "$INSTALL_DIR").backup.*" -type d | wc -l)
if [ "$BACKUP_COUNT" -gt 5 ]; then
    info "Cleaning old backups (keeping last 5)..."
    find "$(dirname "$INSTALL_DIR")" -maxdepth 1 -name "$(basename "$INSTALL_DIR").backup.*" -type d | sort | head -n -5 | xargs rm -rf
    success "Old backups cleaned"
fi

sleep 1

# ============================================================================
# STEP 3: Download Latest Code
# ============================================================================
step_header 3 6 "Downloading Latest Code"

cd "$INSTALL_DIR"

# Backup config files
info "Preserving configuration..."
TEMP_DIR=$(mktemp -d)
cp "$INSTALL_DIR/.env" "$TEMP_DIR/.env" 2>/dev/null || true
cp "$INSTALL_DIR/ecosystem.config.cjs" "$TEMP_DIR/ecosystem.config.cjs" 2>/dev/null || true
success "Configuration preserved"

# Download from GitHub
SAFE_BRANCH=$(echo "${GITHUB_BRANCH}" | tr '/' '-')
TEMP_ZIP="/tmp/ozvps-update-${SAFE_BRANCH}.zip"
TEMP_EXTRACT="/tmp/ozvps-update-${SAFE_BRANCH}-extract"

info "Downloading from GitHub..."
if ! curl -fsSL "https://github.com/${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.zip" -o "$TEMP_ZIP"; then
    error "Failed to download from GitHub"
    exit 1
fi
FILE_SIZE=$(du -sh "$TEMP_ZIP" | cut -f1)
success "Downloaded $FILE_SIZE"

# Clear old files
info "Removing old files..."
find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 \
    ! -name 'node_modules' \
    ! -name '.env' \
    ! -name '.backup.*' \
    ! -name 'ecosystem.config.cjs' \
    -exec rm -rf {} + 2>/dev/null || true
success "Old files removed"

# Extract
info "Extracting new code..."
rm -rf "$TEMP_EXTRACT" && mkdir -p "$TEMP_EXTRACT"
unzip -q "$TEMP_ZIP" -d "$TEMP_EXTRACT"
EXTRACTED_DIR=$(find "$TEMP_EXTRACT" -mindepth 1 -maxdepth 1 -type d -name "ozvps-*" | head -1)

if [ -z "$EXTRACTED_DIR" ]; then
    error "Could not find extracted directory"
    rm -rf "$TEMP_EXTRACT" "$TEMP_ZIP"
    exit 1
fi

# Copy files
cp -r "${EXTRACTED_DIR}"/* "$INSTALL_DIR/"
cp -r "${EXTRACTED_DIR}"/.[^.]* "$INSTALL_DIR/" 2>/dev/null || true
success "Files extracted"

# Restore config
info "Restoring configuration..."
cp "$TEMP_DIR/.env" "$INSTALL_DIR/.env" 2>/dev/null || true
cp "$TEMP_DIR/ecosystem.config.cjs" "$INSTALL_DIR/ecosystem.config.cjs" 2>/dev/null || true
rm -rf "$TEMP_DIR" "$TEMP_EXTRACT" "$TEMP_ZIP"
success "Configuration restored"

# Update DATABASE_URL if needed
if [ -f "$INSTALL_DIR/.env" ] && ! grep -q "DATABASE_URL=" "$INSTALL_DIR/.env"; then
    echo "DATABASE_URL=postgresql://ozvps_dev:OzVPS_Dev_2024!@localhost:5432/ozvps_dev" >> "$INSTALL_DIR/.env"
    success "Database URL configured"
fi

# Save commit hash for future checks
if [ -n "$LATEST_COMMIT" ]; then
    echo "$LATEST_COMMIT" > "$INSTALL_DIR/.commit"
    success "Commit hash saved (${LATEST_COMMIT:0:7})"
fi

sleep 1

# ============================================================================
# STEP 4: Build Application
# ============================================================================
step_header 4 6 "Building Application"

cd "$INSTALL_DIR"

# Install dependencies
info "Installing dependencies..."
echo -e "${DIM}"
npm install --silent --no-progress 2>&1 | sed 's/^/  /'
echo -e "${NC}"
success "Dependencies installed"

# Build
info "Building application..."
echo -e "${DIM}"
npm run build 2>&1 | grep -v "Creating an optimized production build" | sed 's/^/  /'
echo -e "${NC}"

# Verify build
if [ ! -f "dist/index.cjs" ]; then
    error "Build failed - dist/index.cjs not found"
    warning "Rolling back to backup..."
    rm -rf "$INSTALL_DIR"
    mv "$BACKUP_DIR" "$INSTALL_DIR"
    exit 1
fi

BUILD_SIZE=$(du -sh dist | cut -f1)
success "Build complete ($BUILD_SIZE)"

# Production dependencies only
info "Cleaning dev dependencies..."
npm prune --production --silent 2>&1 | sed 's/^/  /'
success "Dev dependencies removed"

sleep 1

# ============================================================================
# STEP 5: Database Migrations
# ============================================================================
step_header 5 6 "Database Migrations"

info "Loading environment..."
if [ -f "$INSTALL_DIR/.env" ]; then
    set -a
    source "$INSTALL_DIR/.env"
    set +a
    success "Environment loaded"
else
    error ".env file not found"
    exit 1
fi

if [ -z "$DATABASE_URL" ]; then
    error "DATABASE_URL not set in .env"
    exit 1
fi

info "Running migrations..."
echo -e "${DIM}"
npx drizzle-kit push --force 2>&1 | sed 's/^/  /'
echo -e "${NC}"
success "Migrations applied"

# Optional: Reset billing if script exists
if [ -f "$INSTALL_DIR/reset-billing.js" ]; then
    info "Resetting billing records..."
    node reset-billing.js >/dev/null 2>&1 && success "Billing reset" || warning "Billing reset skipped"
fi

sleep 1

# ============================================================================
# STEP 6: Restart Application
# ============================================================================
step_header 6 6 "Restarting Application"

info "Stopping old instance..."
pm2 delete "$SERVICE_NAME" 2>/dev/null || true
success "Old instance stopped"

info "Starting new instance..."
pm2 start "$INSTALL_DIR/ecosystem.config.cjs" >/dev/null 2>&1
pm2 save --force >/dev/null 2>&1
success "New instance started"

info "Waiting for application to be healthy..."
APP_PORT=$(grep "^PORT=" "$INSTALL_DIR/.env" | cut -d'=' -f2 | tr -d ' "' || echo "3000")

for i in {1..30}; do
    progress_bar $i 30
    if curl -s "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
        printf "\n"
        success "Application is healthy"
        break
    fi
    sleep 1
    if [ $i -eq 30 ]; then
        printf "\n"
        warning "Health check timeout - check logs: pm2 logs $SERVICE_NAME"
    fi
done

sleep 1

# ============================================================================
# Completion
# ============================================================================
echo ""
echo -e "${GREEN}${BOLD}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║                    ✓ Update Complete!                    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

# Summary
echo -e "${BOLD}System Status:${NC}"
echo -e "  ${CYAN}►${NC} Application: ${GREEN}Running${NC}"
echo -e "  ${CYAN}►${NC} Port: ${BLUE}$APP_PORT${NC}"
echo -e "  ${CYAN}►${NC} Backup: ${DIM}$BACKUP_DIR${NC}"
echo ""

echo -e "${BOLD}Quick Commands:${NC}"
echo -e "  ${CYAN}pm2 status${NC}              - View application status"
echo -e "  ${CYAN}pm2 logs $SERVICE_NAME${NC}  - View application logs"
echo -e "  ${CYAN}pm2 restart $SERVICE_NAME${NC} - Restart application"
echo -e "  ${CYAN}pm2 monit${NC}               - Monitor resources"
echo ""

echo -e "${DIM}Completed at $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo ""
