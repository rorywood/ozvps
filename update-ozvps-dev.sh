#!/bin/bash

# OzVPS Development Update Script
# Version: 3.2.0

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

INSTALL_DIR="/opt/ozvps-panel"
SERVICE_NAME="ozvps-panel"
GITHUB_BRANCH="claude/dev-l5488"
GITHUB_REPO="rorywood/ozvps"
SCRIPT_NAME="update-ozvps-dev.sh"
SCRIPT_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${SCRIPT_NAME}"

error() { echo -e "${RED}✗${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
info() { echo -e "${CYAN}→${NC} $1"; }
warning() { echo -e "${YELLOW}⚠${NC} $1"; }

step_header() {
    echo ""
    echo -e "${BLUE}╭$( printf '─%.0s' {1..60} )╮${NC}"
    echo -e "${BLUE}│${NC} ${BOLD}Step $1/$2: $3${NC}"
    echo -e "${BLUE}╰$( printf '─%.0s' {1..60} )╯${NC}"
}

# Self-update function - updates the script itself before running
self_update() {
    local SELF_PATH="$1"
    local TEMP_SCRIPT=$(mktemp)

    info "Checking for script updates..."

    if curl -fsSL "$SCRIPT_URL" -o "$TEMP_SCRIPT" 2>/dev/null; then
        # Check if downloaded file is valid (starts with shebang)
        if head -1 "$TEMP_SCRIPT" | grep -q "^#!/bin/bash"; then
            # Compare checksums
            local CURRENT_MD5=$(md5sum "$SELF_PATH" 2>/dev/null | cut -d' ' -f1)
            local NEW_MD5=$(md5sum "$TEMP_SCRIPT" 2>/dev/null | cut -d' ' -f1)

            if [ "$CURRENT_MD5" != "$NEW_MD5" ]; then
                success "New script version found, updating..."
                cp "$TEMP_SCRIPT" "$SELF_PATH"
                chmod +x "$SELF_PATH"
                rm -f "$TEMP_SCRIPT"

                # Re-execute the updated script with --no-self-update flag
                exec "$SELF_PATH" --no-self-update "$@"
            else
                success "Script is up to date"
            fi
        else
            warning "Downloaded script appears invalid, skipping self-update"
        fi
    else
        warning "Could not check for script updates, continuing..."
    fi

    rm -f "$TEMP_SCRIPT" 2>/dev/null
}

# Check for --no-self-update flag (used after self-update to prevent loop)
SKIP_SELF_UPDATE=false
SCRIPT_ARGS=()
for arg in "$@"; do
    if [ "$arg" = "--no-self-update" ]; then
        SKIP_SELF_UPDATE=true
    else
        SCRIPT_ARGS+=("$arg")
    fi
done

# Get the path to this script
SELF_PATH="$(readlink -f "$0" 2>/dev/null || echo "$0")"

# Perform self-update if not skipped
if [ "$SKIP_SELF_UPDATE" = false ] && [ -f "$SELF_PATH" ]; then
    self_update "$SELF_PATH" "${SCRIPT_ARGS[@]}"
fi

clear
echo -e "${CYAN}${BOLD}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════╗
║   ██████╗ ███████╗██╗   ██╗██████╗ ███████╗              ║
║  ██╔═══██╗╚══███╔╝██║   ██║██╔══██╗██╔════╝              ║
║  ██║   ██║  ███╔╝ ██║   ██║██████╔╝███████╗              ║
║  ██║   ██║ ███╔╝  ╚██╗ ██╔╝██╔═══╝ ╚════██║              ║
║  ╚██████╔╝███████╗ ╚████╔╝ ██║     ███████║              ║
║   ╚═════╝ ╚══════╝  ╚═══╝  ╚═╝     ╚══════╝              ║
║           Development Update System v3.2                 ║
╚═══════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"
echo -e "${DIM}Branch: ${GITHUB_BRANCH}${NC}"
echo ""

if [ "$EUID" -ne 0 ]; then
    error "Must run as root"
    exit 1
fi

if [ ! -d "$INSTALL_DIR" ]; then
    error "Installation not found at $INSTALL_DIR"
    exit 1
fi

# Check for new commits
echo ""
info "Checking for new commits..."

CURRENT_COMMIT=""
if [ -f "$INSTALL_DIR/.commit" ]; then
    CURRENT_COMMIT=$(cat "$INSTALL_DIR/.commit" 2>/dev/null || echo "")
fi

LATEST_COMMIT=$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/commits/${GITHUB_BRANCH}" 2>/dev/null | grep '"sha":' | head -1 | cut -d'"' -f4 || echo "")

if [ -n "$LATEST_COMMIT" ] && [ -n "$CURRENT_COMMIT" ] && [ "$CURRENT_COMMIT" = "$LATEST_COMMIT" ]; then
    success "Already on latest version (${LATEST_COMMIT:0:7})"
    echo ""
    read -p "$(echo -e ${CYAN}Force update anyway? [y/N]: ${NC})" -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${CYAN}Update cancelled.${NC}"
        exit 0
    fi
    info "Proceeding with forced update..."
else
    if [ -n "$CURRENT_COMMIT" ] && [ -n "$LATEST_COMMIT" ]; then
        success "New commits available!"
        echo -e "  ${DIM}Current: ${CURRENT_COMMIT:0:7}${NC}"
        echo -e "  ${DIM}Latest:  ${LATEST_COMMIT:0:7}${NC}"
    fi
fi

sleep 1

# ============================================================================
step_header 1 6 "Pre-flight Checks"

info "Checking PostgreSQL..."
if ! command -v psql &>/dev/null; then
    info "Installing PostgreSQL..."
    apt-get update -qq && apt-get install -y postgresql postgresql-contrib >/dev/null 2>&1
fi
systemctl start postgresql 2>/dev/null || service postgresql start
systemctl enable postgresql >/dev/null 2>&1 || true
sleep 2

sudo -u postgres psql -c "CREATE USER ozvps_dev WITH PASSWORD 'OzVPS_Dev_2024!';" 2>&1 | grep -v "already exists" || true
sudo -u postgres psql -c "CREATE DATABASE ozvps_dev OWNER ozvps_dev;" 2>&1 | grep -v "already exists" || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ozvps_dev TO ozvps_dev;" >/dev/null 2>&1 || true
success "PostgreSQL ready"

if ! command -v node &>/dev/null; then
    error "Node.js not found"
    exit 1
fi
success "Node.js $(node -v) detected"

if ! command -v pm2 &>/dev/null; then
    error "PM2 not found"
    exit 1
fi
success "PM2 installed"

sleep 1

# ============================================================================
step_header 2 6 "Creating Backup"

BACKUP_DIR="${INSTALL_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
info "Backup location: $BACKUP_DIR"

mkdir -p "$BACKUP_DIR"
cp -r "$INSTALL_DIR"/* "$BACKUP_DIR/" 2>/dev/null || true
cp "$INSTALL_DIR"/.env "$BACKUP_DIR/.env" 2>/dev/null || true

BACKUP_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1 || echo "unknown")
success "Backup created ($BACKUP_SIZE)"

# Keep only last 3 backups
BACKUP_COUNT=$(find "$(dirname "$INSTALL_DIR")" -maxdepth 1 -name "$(basename "$INSTALL_DIR").backup.*" -type d 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt 3 ]; then
    info "Cleaning old backups (keeping last 3)..."
    find "$(dirname "$INSTALL_DIR")" -maxdepth 1 -name "$(basename "$INSTALL_DIR").backup.*" -type d 2>/dev/null | sort | head -n -3 | xargs rm -rf
fi

sleep 1

# ============================================================================
step_header 3 6 "Downloading Latest Code"

cd "$INSTALL_DIR"

TEMP_DIR=$(mktemp -d)
cp "$INSTALL_DIR/.env" "$TEMP_DIR/.env" 2>/dev/null || true
cp "$INSTALL_DIR/ecosystem.config.cjs" "$TEMP_DIR/ecosystem.config.cjs" 2>/dev/null || true

SAFE_BRANCH=$(echo "${GITHUB_BRANCH}" | tr '/' '-')
TEMP_ZIP="/tmp/ozvps-update-${SAFE_BRANCH}.zip"
TEMP_EXTRACT="/tmp/ozvps-update-${SAFE_BRANCH}-extract"

info "Downloading from GitHub..."
if ! curl -fsSL "https://github.com/${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.zip" -o "$TEMP_ZIP"; then
    error "Failed to download from GitHub"
    exit 1
fi
FILE_SIZE=$(du -sh "$TEMP_ZIP" 2>/dev/null | cut -f1 || echo "unknown")
success "Downloaded $FILE_SIZE"

info "Extracting..."
find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 ! -name 'node_modules' ! -name '.env' ! -name '.backup.*' ! -name 'ecosystem.config.cjs' -exec rm -rf {} + 2>/dev/null || true

rm -rf "$TEMP_EXTRACT" && mkdir -p "$TEMP_EXTRACT"
unzip -q "$TEMP_ZIP" -d "$TEMP_EXTRACT"
EXTRACTED_DIR=$(find "$TEMP_EXTRACT" -mindepth 1 -maxdepth 1 -type d -name "ozvps-*" | head -1)

if [ -z "$EXTRACTED_DIR" ]; then
    error "Could not find extracted directory"
    rm -rf "$TEMP_EXTRACT" "$TEMP_ZIP"
    exit 1
fi

cp -r "${EXTRACTED_DIR}"/* "$INSTALL_DIR/"
cp -r "${EXTRACTED_DIR}"/.[^.]* "$INSTALL_DIR/" 2>/dev/null || true

cp "$TEMP_DIR/.env" "$INSTALL_DIR/.env" 2>/dev/null || true
cp "$TEMP_DIR/ecosystem.config.cjs" "$INSTALL_DIR/ecosystem.config.cjs" 2>/dev/null || true
rm -rf "$TEMP_DIR" "$TEMP_EXTRACT" "$TEMP_ZIP"

# Add SENTRY_DSN if not present
info "Checking Sentry configuration..."
if [ -f "$INSTALL_DIR/.env" ]; then
    if ! grep -q "SENTRY_DSN" "$INSTALL_DIR/.env"; then
        echo "" >> "$INSTALL_DIR/.env"
        echo "# Error Tracking (Sentry)" >> "$INSTALL_DIR/.env"
        echo "SENTRY_DSN=https://d4f992b86441210c3eae4f04bf3924b8@o4510719188074496.ingest.us.sentry.io/4510719196004352" >> "$INSTALL_DIR/.env"
        success "Added Sentry DSN to .env"
    else
        success "Sentry DSN already configured"
    fi
else
    warning ".env file not found, will add Sentry DSN later"
fi

# Ensure ecosystem.config.cjs exists (create if missing from repo)
if [ ! -f "$INSTALL_DIR/ecosystem.config.cjs" ]; then
    info "Creating ecosystem.config.cjs..."
    cat > "$INSTALL_DIR/ecosystem.config.cjs" << 'EOFCONFIG'
module.exports = {
  apps: [{
    name: 'ozvps-panel',
    script: 'npm',
    args: 'start',
    cwd: '/opt/ozvps-panel',
    env: {
      NODE_ENV: 'development'
    },
    env_file: '/opt/ozvps-panel/.env',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    error_file: '/root/.pm2/logs/ozvps-panel-error.log',
    out_file: '/root/.pm2/logs/ozvps-panel-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
EOFCONFIG
    success "ecosystem.config.cjs created"
fi

if [ -n "$LATEST_COMMIT" ]; then
    echo "$LATEST_COMMIT" > "$INSTALL_DIR/.commit"
fi

success "Code updated"

sleep 1

# ============================================================================
step_header 4 6 "Building Application"

cd "$INSTALL_DIR"

info "Cleaning old dependencies..."
rm -rf node_modules package-lock.json

info "Installing dependencies..."
if npm install 2>&1 | tee /tmp/npm-install.log | grep -v "^npm " | grep -v "added\|removed\|packages" | tail -5; then
    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        success "Dependencies installed"
    else
        error "Failed to install dependencies"
        cat /tmp/npm-install.log | tail -30
        exit 1
    fi
else
    error "Failed to install dependencies"
    cat /tmp/npm-install.log | tail -30
    exit 1
fi

info "Building application..."
BUILD_OUTPUT=$(npm run build 2>&1)
BUILD_EXIT=$?

if [ $BUILD_EXIT -eq 0 ]; then
    # Verify server build
    if [ ! -f "dist/index.cjs" ]; then
        error "Build verification failed - dist/index.cjs not found"
        exit 1
    fi

    # Verify client build
    if [ ! -f "dist/public/index.html" ]; then
        error "Build verification failed - dist/public/index.html not found"
        error "Client build may have failed"
        npm run build 2>&1 | tail -20
        exit 1
    fi

    BUILD_SIZE=$(du -sh dist 2>/dev/null | cut -f1 || echo "unknown")
    success "Build complete ($BUILD_SIZE)"
else
    error "Build failed"
    echo -e "${DIM}$BUILD_OUTPUT${NC}" | tail -50
    exit 1
fi

sleep 1

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
MIGRATION_OUTPUT=$(npx drizzle-kit push --force 2>&1)
MIGRATION_EXIT=$?

if [ $MIGRATION_EXIT -ne 0 ]; then
    error "Migrations failed"
    echo -e "${DIM}$MIGRATION_OUTPUT${NC}"
    exit 1
fi

if echo "$MIGRATION_OUTPUT" | grep -q "Cannot find module"; then
    error "drizzle-kit not found"
    echo -e "${DIM}$MIGRATION_OUTPUT${NC}"
    exit 1
fi

success "Migrations applied"

if [ -f "$INSTALL_DIR/reset-billing.js" ]; then
    info "Resetting billing records..."
    node reset-billing.js >/dev/null 2>&1 && success "Billing reset" || warning "Billing reset skipped"
fi

sleep 1

# ============================================================================
step_header 6 6 "Restarting Application"

# Final check - ensure SENTRY_DSN is configured (failsafe for bootstrap issue)
if [ -f "$INSTALL_DIR/.env" ] && ! grep -q "SENTRY_DSN" "$INSTALL_DIR/.env"; then
    echo "" >> "$INSTALL_DIR/.env"
    echo "# Error Tracking (Sentry)" >> "$INSTALL_DIR/.env"
    echo "SENTRY_DSN=https://d4f992b86441210c3eae4f04bf3924b8@o4510719188074496.ingest.us.sentry.io/4510719196004352" >> "$INSTALL_DIR/.env"
    success "Added Sentry DSN to .env (failsafe)"
fi

info "Stopping old instance..."
pm2 delete "$SERVICE_NAME" 2>/dev/null || true
success "Stopped"

info "Starting new instance..."
if pm2 start "$INSTALL_DIR/ecosystem.config.cjs" >/dev/null 2>&1; then
    pm2 save --force >/dev/null 2>&1
    success "Started"
else
    error "Failed to start application"
    pm2 logs "$SERVICE_NAME" --lines 20 --nostream
    exit 1
fi

info "Waiting for application to be healthy..."
APP_PORT=$(grep "^PORT=" "$INSTALL_DIR/.env" 2>/dev/null | cut -d'=' -f2 | tr -d ' "' || echo "3000")

for i in {1..30}; do
    if curl -s "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
        success "Application is healthy"
        break
    fi
    sleep 1
    if [ $i -eq 30 ]; then
        warning "Health check timeout"
        echo -e "${DIM}Check logs: pm2 logs $SERVICE_NAME${NC}"
    fi
done

sleep 1

# ============================================================================
echo ""
echo -e "${GREEN}${BOLD}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════╗
║                    ✓ Update Complete!                    ║
╚═══════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

echo -e "${BOLD}Quick Commands:${NC}"
echo -e "  ${CYAN}pm2 status${NC}              - View application status"
echo -e "  ${CYAN}pm2 logs $SERVICE_NAME${NC}  - View application logs"
echo -e "  ${CYAN}pm2 restart $SERVICE_NAME${NC} - Restart application"
echo ""
echo -e "${DIM}Completed at $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo ""
