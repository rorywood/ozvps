#!/bin/bash
set -e

# Multi-environment support
# Usage: update-ozvps [dev]
ENVIRONMENT="${1:-prod}"

if [[ "$ENVIRONMENT" == "dev" ]]; then
    INSTALL_DIR="/opt/ozvps-panel-dev"
    SERVICE_NAME="ozvps-panel-dev"
    APP_PORT="5001"
    ENV_LABEL="Development"
elif [[ "$ENVIRONMENT" == "prod" ]]; then
    INSTALL_DIR="/opt/ozvps-panel"
    SERVICE_NAME="ozvps-panel"
    APP_PORT="5000"
    ENV_LABEL="Production"
else
    echo "Error: Invalid environment. Use 'update-ozvps' or 'update-ozvps dev'"
    exit 1
fi

CONFIG_FILE="$INSTALL_DIR/.update_config"

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
    echo -e "${CYAN}│${NC}  ${DIM}Environment:${NC} ${BOLD}${ENV_LABEL}${NC}                    ${CYAN}│${NC}"
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

# Function to setup NGINX for this environment if needed
setup_nginx_if_needed() {
    local domain=$1
    local port=$2
    local config_name=$3
    local email=$4

    # Check if NGINX config already exists
    if [[ -f "/etc/nginx/sites-available/${config_name}" ]]; then
        return 0
    fi

    echo ""
    echo -e "  ${YELLOW}!${NC}  NGINX not configured for ${ENV_LABEL} environment"
    echo -e "  ${DIM}Setting up NGINX and SSL for ${domain}...${NC}"
    echo ""

    # Install nginx if not present
    if ! command -v nginx &>/dev/null; then
        echo -e "  ${CYAN}Installing NGINX...${NC}"
        apt-get update >/dev/null 2>&1
        apt-get install -y nginx >/dev/null 2>&1
        systemctl start nginx
        systemctl enable nginx
    fi

    # Install certbot if not present
    if ! command -v certbot &>/dev/null; then
        echo -e "  ${CYAN}Installing Certbot...${NC}"
        apt-get install -y certbot python3-certbot-nginx >/dev/null 2>&1
    fi

    # Create nginx configuration
    echo -e "  ${CYAN}Creating NGINX configuration for ${domain}...${NC}"
    cat > /etc/nginx/sites-available/${config_name} << NGINX_CONFIG
server {
    listen 80;
    server_name ${domain};

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
NGINX_CONFIG

    # Enable the site
    ln -sf /etc/nginx/sites-available/${config_name} /etc/nginx/sites-enabled/

    # Test and reload nginx
    if nginx -t >/dev/null 2>&1; then
        systemctl reload nginx
        echo -e "  ${GREEN}✓${NC}  NGINX configured"
    else
        echo -e "  ${RED}✗${NC}  NGINX configuration error"
        return 1
    fi

    # Get SSL certificate
    echo -e "  ${CYAN}Obtaining SSL certificate for ${domain}...${NC}"
    if certbot --nginx -d "${domain}" --non-interactive --agree-tos -m "${email}" --redirect >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC}  SSL certificate obtained"
        echo -e "  ${GREEN}✓${NC}  ${domain} is now ready"
    else
        echo -e "  ${YELLOW}!${NC}  SSL setup failed. Run manually: ${BOLD}certbot --nginx -d ${domain}${NC}"
    fi

    echo ""
}

# Auto-detect domain and email for NGINX setup
if [[ "$ENVIRONMENT" == "dev" ]]; then
    AUTO_DOMAIN="dev.ozvps.com.au"
    NGINX_CONFIG_NAME="ozvps-dev"
elif [[ "$ENVIRONMENT" == "prod" ]]; then
    AUTO_DOMAIN="app.ozvps.com.au"
    NGINX_CONFIG_NAME="ozvps-prod"
fi

# Check if we have a saved domain
DOMAIN_FILE="$INSTALL_DIR/.panel_domain"
if [[ -f "$DOMAIN_FILE" ]]; then
    SAVED_DOMAIN=$(cat "$DOMAIN_FILE")
    AUTO_DOMAIN="${SAVED_DOMAIN}"
fi

AUTO_EMAIL="admin@${AUTO_DOMAIN}"

# Check installation - create directory if it doesn't exist (for new environments)
if [[ ! -d "$INSTALL_DIR" ]]; then
    echo -e "  ${YELLOW}!${NC}  ${ENV_LABEL} environment not found at $INSTALL_DIR"
    echo ""
    if confirm "  Create new ${ENV_LABEL} environment? (Y/n):"; then
        mkdir -p "$INSTALL_DIR"
        echo -e "  ${GREEN}✓${NC}  Created $INSTALL_DIR"
        echo ""

        # Auto-setup NGINX for new environment
        setup_nginx_if_needed "$AUTO_DOMAIN" "$APP_PORT" "$NGINX_CONFIG_NAME" "$AUTO_EMAIL"
    else
        error_exit "Installation cancelled."
    fi
else
    # Check if NGINX is configured even for existing installations
    setup_nginx_if_needed "$AUTO_DOMAIN" "$APP_PORT" "$NGINX_CONFIG_NAME" "$AUTO_EMAIL"
fi

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
cp "$TEMP_DIR/update-config-backup" "$INSTALL_DIR/.update_config" 2>/dev/null || true
cp "$TEMP_DIR/domain-backup" "$INSTALL_DIR/.panel_domain" 2>/dev/null || true

# Save domain for this environment if not already saved
if [[ ! -f "$INSTALL_DIR/.panel_domain" ]]; then
    echo "$AUTO_DOMAIN" > "$INSTALL_DIR/.panel_domain"
    chmod 600 "$INSTALL_DIR/.panel_domain"
fi

# Create or update ecosystem.config.cjs with correct service name and port
cat > "$INSTALL_DIR/ecosystem.config.cjs" << 'PMEOF'
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '.env');
const envVars = {};
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const [key, ...val] = line.split('=');
      if (key) envVars[key.trim()] = val.join('=').trim();
    }
  });
}
module.exports = {
  apps: [{
    name: 'SERVICE_NAME_PLACEHOLDER',
    script: 'npm',
    args: 'start',
    cwd: __dirname,
    env: { NODE_ENV: 'production', PORT: 'PORT_PLACEHOLDER', ...envVars },
    autorestart: true,
    max_restarts: 10
  }]
};
PMEOF

# Replace placeholders with actual values
sed -i "s/SERVICE_NAME_PLACEHOLDER/${SERVICE_NAME}/g" "$INSTALL_DIR/ecosystem.config.cjs"
sed -i "s/PORT_PLACEHOLDER/${APP_PORT}/g" "$INSTALL_DIR/ecosystem.config.cjs"

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
        if curl -s http://127.0.0.1:${APP_PORT}/api/health &>/dev/null; then
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
        SYNC_RESULT=$(curl -s -X POST http://127.0.0.1:${APP_PORT}/api/admin/resync-plans 2>/dev/null)
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
