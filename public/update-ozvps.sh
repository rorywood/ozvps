#!/bin/bash
set -e

INSTALL_DIR="/opt/ozvps-panel"
CONFIG_FILE="$INSTALL_DIR/.update_config"
SERVICE_NAME="ozvps-panel"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Spinner
SPINNER='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

# Temp directory
TEMP_DIR=$(mktemp -d -t ozvps-update.XXXXXXXXXX)
chmod 700 "$TEMP_DIR"
LOG_FILE="$TEMP_DIR/update.log"

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
        echo ""
        echo -e "  ${RED}Error details:${NC}"
        tail -10 "$LOG_FILE" 2>/dev/null | sed 's/^/    /'
        echo ""
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

echo ""

# Check server is reachable
if ! curl -fsSL "$REPLIT_URL/api/health" &>/dev/null; then
    error_exit "Could not connect to server. Is your Replit app running?"
fi

# Ask to proceed
if ! confirm "Download and install latest update? (Y/n):"; then
    echo "  Update cancelled."
    exit 0
fi

echo ""
echo -e "${BOLD}  Updating...${NC}"
echo ""

# Download
ARCHIVE_FILE="$TEMP_DIR/ozvps-update.tar.gz"
(curl -fsSL "$REPLIT_URL/download.tar.gz" -o "$ARCHIVE_FILE" 2>>"$LOG_FILE") &
spinner $! "Downloading"

# Backup
(cp -r "$INSTALL_DIR" "${INSTALL_DIR}.backup.$(date +%Y%m%d%H%M%S)" 2>>"$LOG_FILE") &
spinner $! "Creating backup"

# Backup configs
cp "$INSTALL_DIR/.env" "$TEMP_DIR/env-backup" 2>/dev/null || true
cp "$INSTALL_DIR/ecosystem.config.cjs" "$TEMP_DIR/ecosystem-backup" 2>/dev/null || true
cp "$INSTALL_DIR/.update_config" "$TEMP_DIR/update-config-backup" 2>/dev/null || true
cp "$INSTALL_DIR/.panel_domain" "$TEMP_DIR/domain-backup" 2>/dev/null || true

# Clean and extract
(
    rm -rf "$INSTALL_DIR/client" "$INSTALL_DIR/server" "$INSTALL_DIR/shared" "$INSTALL_DIR/public" "$INSTALL_DIR/script"
    rm -f "$INSTALL_DIR/package.json" "$INSTALL_DIR/package-lock.json" "$INSTALL_DIR/tsconfig.json"
    rm -f "$INSTALL_DIR/vite.config.ts" "$INSTALL_DIR/vite-plugin-meta-images.ts" "$INSTALL_DIR/postcss.config.js"
    rm -f "$INSTALL_DIR/drizzle.config.ts" "$INSTALL_DIR/tailwind.config.ts" "$INSTALL_DIR/components.json"
    tar -xzf "$ARCHIVE_FILE" -C "$INSTALL_DIR"
) >>"$LOG_FILE" 2>&1 &
spinner $! "Extracting files"

# Restore configs
cp "$TEMP_DIR/env-backup" "$INSTALL_DIR/.env" 2>/dev/null || true
cp "$TEMP_DIR/ecosystem-backup" "$INSTALL_DIR/ecosystem.config.cjs" 2>/dev/null || true
cp "$TEMP_DIR/update-config-backup" "$INSTALL_DIR/.update_config" 2>/dev/null || true
cp "$TEMP_DIR/domain-backup" "$INSTALL_DIR/.panel_domain" 2>/dev/null || true

# Remove bad-words and install dependencies
(
    cd "$INSTALL_DIR"
    if grep -q '"bad-words"' "$INSTALL_DIR/package.json" 2>/dev/null; then
        npm uninstall bad-words 2>/dev/null || true
    fi
    npm install
) >>"$LOG_FILE" 2>&1 &
spinner $! "Installing dependencies"

# Detect OS for package management
if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    UPDATE_OS=$ID
else
    UPDATE_OS="unknown"
fi

# Ensure PostgreSQL is installed
(
    if ! command -v psql &>/dev/null; then
        echo "PostgreSQL not found, installing..."
        case "$UPDATE_OS" in
            ubuntu|debian)
                apt-get update
                apt-get install -y postgresql postgresql-contrib
                ;;
            centos|rhel|rocky|almalinux)
                yum install -y postgresql-server postgresql-contrib
                postgresql-setup --initdb 2>/dev/null || true
                ;;
            *)
                echo "WARNING: Unknown OS, cannot auto-install PostgreSQL"
                ;;
        esac
    fi
    
    # Start PostgreSQL if not running
    if ! systemctl is-active postgresql &>/dev/null; then
        systemctl start postgresql 2>/dev/null || true
        systemctl enable postgresql 2>/dev/null || true
    fi
    
    # Wait for PostgreSQL to be ready
    for i in {1..30}; do
        if sudo -u postgres psql -c "SELECT 1" &>/dev/null; then
            echo "PostgreSQL is ready"
            break
        fi
        sleep 1
    done
) >>"$LOG_FILE" 2>&1 &
spinner $! "Checking PostgreSQL"

# Auto-configure DATABASE_URL if missing
if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    touch "$INSTALL_DIR/.env"
    chmod 600 "$INSTALL_DIR/.env"
fi

if ! grep -q "^DATABASE_URL=" "$INSTALL_DIR/.env"; then
    echo -e "  ${YELLOW}!${NC}  DATABASE_URL missing - auto-configuring..."
    
    # Generate secure password
    if command -v openssl &>/dev/null; then
        AUTO_DB_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    else
        AUTO_DB_PASS=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 24)
    fi
    AUTO_DB_USER="ozvps"
    AUTO_DB_NAME="ozvps"
    
    # Create database user and database (idempotent)
    (
        # Wait for PostgreSQL to be ready
        for i in {1..30}; do
            if sudo -u postgres psql -c "SELECT 1" &>/dev/null; then
                break
            fi
            sleep 1
        done
        
        # Create or update user
        if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$AUTO_DB_USER'" | grep -q 1; then
            sudo -u postgres psql -c "ALTER USER $AUTO_DB_USER WITH PASSWORD '$AUTO_DB_PASS';"
        else
            sudo -u postgres psql -c "CREATE USER $AUTO_DB_USER WITH PASSWORD '$AUTO_DB_PASS';"
        fi
        
        # Create database if not exists
        if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$AUTO_DB_NAME'" | grep -q 1; then
            sudo -u postgres psql -c "CREATE DATABASE $AUTO_DB_NAME OWNER $AUTO_DB_USER;"
        fi
        sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $AUTO_DB_NAME TO $AUTO_DB_USER;"
        
        # Configure pg_hba.conf for password auth
        PG_HBA=$(sudo -u postgres psql -t -c "SHOW hba_file;" 2>/dev/null | tr -d ' ')
        if [[ -n "$PG_HBA" && -f "$PG_HBA" ]]; then
            if ! grep -q "host.*$AUTO_DB_NAME.*$AUTO_DB_USER" "$PG_HBA"; then
                echo "host    $AUTO_DB_NAME    $AUTO_DB_USER    127.0.0.1/32    md5" >> "$PG_HBA"
                echo "host    $AUTO_DB_NAME    $AUTO_DB_USER    ::1/128         md5" >> "$PG_HBA"
                systemctl reload postgresql 2>/dev/null || true
            fi
        fi
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Creating database"
    
    # Add DATABASE_URL to .env
    echo "DATABASE_URL=postgresql://$AUTO_DB_USER:$AUTO_DB_PASS@localhost:5432/$AUTO_DB_NAME" >> "$INSTALL_DIR/.env"
    echo -e "  ${GREEN}✓${NC}  Database configured automatically"
fi

# Database migrations
(
    cd "$INSTALL_DIR"
    set -a
    source "$INSTALL_DIR/.env"
    set +a
    
    # Extract connection params from DATABASE_URL for psql check
    # URL format: postgresql://user:pass@host:port/dbname
    DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
    DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
    DB_NAME=$(echo "$DATABASE_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')
    DB_USER=$(echo "$DATABASE_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')
    DB_PASS=$(echo "$DATABASE_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
    
    # Wait for database to be ready
    DB_READY=false
    for i in {1..30}; do
        if PGPASSWORD="$DB_PASS" psql -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" &>/dev/null; then
            DB_READY=true
            break
        fi
        sleep 1
    done
    
    if [[ "$DB_READY" == "true" ]]; then
        npx drizzle-kit push --force
    else
        echo "WARNING: Could not connect to database after 30s"
        echo "Check your DATABASE_URL in .env and PostgreSQL status"
    fi
) >>"$LOG_FILE" 2>&1 &
spinner $! "Updating database schema"

# Use pre-built dist from package (always included now)
if [[ ! -f "$INSTALL_DIR/dist/index.cjs" ]]; then
    echo ""
    echo -e "  ${RED}✗${NC}  Application package incomplete - dist/index.cjs missing"
    echo ""
    echo -e "  ${DIM}The download may have failed. Try running update again.${NC}"
    echo ""
    exit 1
fi
echo -e "  ${GREEN}✓${NC}  Application ready"

# Check Stripe configuration
if ! grep -q "^STRIPE_SECRET_KEY=" "$INSTALL_DIR/.env" || ! grep -q "^STRIPE_PUBLISHABLE_KEY=" "$INSTALL_DIR/.env"; then
    echo ""
    echo -e "  ${YELLOW}!${NC}  Stripe API keys not configured"
    echo -e "  ${DIM}Add STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY to .env for payments${NC}"
    echo -e "  ${DIM}Get keys from dashboard.stripe.com/apikeys${NC}"
    echo ""
fi

# Update the update command and CLI tools
(
    if [[ -f "$INSTALL_DIR/public/update-ozvps.sh" ]]; then
        cp "$INSTALL_DIR/public/update-ozvps.sh" /usr/local/bin/update-ozvps
        chmod +x /usr/local/bin/update-ozvps
    fi
    
    # Install/update admin CLI tool
    if [[ -f "$INSTALL_DIR/script/ozvpsctl.sh" ]]; then
        cp "$INSTALL_DIR/script/ozvpsctl.sh" /usr/local/bin/ozvpsctl
        chmod +x /usr/local/bin/ozvpsctl
    fi
) >>"$LOG_FILE" 2>&1 &
spinner $! "Updating tools"

# Restart service
(
    cd "$INSTALL_DIR"
    # Stop any existing instance
    pm2 delete "$SERVICE_NAME" 2>/dev/null || true
    # Start fresh from ecosystem config
    pm2 start "$INSTALL_DIR/ecosystem.config.cjs" --update-env
    pm2 save --force
    
    # Wait for app to be healthy (max 30 seconds)
    for i in {1..30}; do
        if curl -s http://127.0.0.1:5000/api/health &>/dev/null; then
            echo "App is healthy"
            break
        fi
        sleep 1
    done
) >>"$LOG_FILE" 2>&1 &
spinner $! "Restarting service"

# Force resync plans from VirtFusion (ensures pricing is up to date)
SYNC_SUCCESS=false
(
    for i in {1..10}; do
        SYNC_RESULT=$(curl -s -X POST http://127.0.0.1:5000/api/admin/resync-plans 2>/dev/null)
        if echo "$SYNC_RESULT" | grep -q '"success":true'; then
            SYNCED=$(echo "$SYNC_RESULT" | grep -o '"synced":[0-9]*' | cut -d: -f2)
            echo "Synced $SYNCED plans from VirtFusion"
            echo "SYNC_OK" > "$TEMP_DIR/sync_status"
            break
        fi
        sleep 1
    done
) >>"$LOG_FILE" 2>&1 &
spinner $! "Syncing pricing"

# Check if sync succeeded
if [[ -f "$TEMP_DIR/sync_status" ]] && grep -q "SYNC_OK" "$TEMP_DIR/sync_status"; then
    SYNC_SUCCESS=true
fi

if [[ "$SYNC_SUCCESS" != "true" ]]; then
    echo -e "  ${YELLOW}!${NC}  Plan sync may have failed - check VirtFusion API connection"
fi

# Aggressive cleanup - free up disk space
(
    # Keep only last 2 backups (reduced from 3)
    ls -dt ${INSTALL_DIR}.backup.* 2>/dev/null | tail -n +3 | xargs rm -rf 2>/dev/null || true
    
    # Clean npm cache
    npm cache clean --force 2>/dev/null || true
    
    # Clean old log files (older than 7 days)
    find /var/log -name "*.log" -type f -mtime +7 -delete 2>/dev/null || true
    find /var/log -name "*.gz" -type f -mtime +7 -delete 2>/dev/null || true
    
    # Clean old PM2 logs
    pm2 flush 2>/dev/null || true
    find ~/.pm2/logs -name "*.log" -type f -mtime +3 -delete 2>/dev/null || true
    
    # Clean old tarballs in temp directories
    find /tmp -name "ozvps-*.tar.gz" -type f -mtime +1 -delete 2>/dev/null || true
    find /tmp -name "ozvps-update.*" -type d -mtime +1 -exec rm -rf {} + 2>/dev/null || true
    
    # Clean node_modules/.cache if it exists
    rm -rf "$INSTALL_DIR/node_modules/.cache" 2>/dev/null || true
    
    # Clean old drizzle migration artifacts
    find "$INSTALL_DIR" -name "*.sql.bak" -type f -delete 2>/dev/null || true
    
    # Clean journald logs older than 3 days
    journalctl --vacuum-time=3d 2>/dev/null || true
    
    # Clean apt cache (Debian/Ubuntu)
    apt-get clean 2>/dev/null || true
    apt-get autoremove -y 2>/dev/null || true
    
    # Clean yum cache (RHEL/CentOS)
    yum clean all 2>/dev/null || true
) &
spinner $! "Cleaning up old files"

echo ""
echo -e "${GREEN}┌─────────────────────────────────────────┐${NC}"
echo -e "${GREEN}│${NC}  ${BOLD}Update Complete${NC}                        ${GREEN}│${NC}"
echo -e "${GREEN}└─────────────────────────────────────────┘${NC}"
echo ""
