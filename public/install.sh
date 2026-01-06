#!/usr/bin/env bash
set -e
set -u
set -o pipefail

DOWNLOAD_URL="${OZVPS_DOWNLOAD_URL:-}"
PRECONFIGURED_VIRTFUSION_URL=""
INSTALL_DIR="/opt/ozvps-panel"
SERVICE_NAME="ozvps-panel"
NODE_VERSION="20"
LOG_FILE="/tmp/ozvps-install.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

SPINNER='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

main() {
    > "$LOG_FILE"

    show_header() {
        clear
        echo ""
        echo -e "${CYAN}┌─────────────────────────────────────────┐${NC}"
        echo -e "${CYAN}│${NC}  ${BOLD}OzVPS Panel${NC} ${DIM}Installer${NC}                  ${CYAN}│${NC}"
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
            echo -e "  ${RED}Error:${NC}"
            tail -10 "$LOG_FILE" 2>/dev/null | sed 's/^/    /'
            echo ""
            exit 1
        fi
    }

    error_exit() {
        echo ""
        echo -e "  ${RED}✗${NC}  $1"
        echo ""
        exit 1
    }

    input_field() {
        local prompt=$1
        local var_name=$2
        local is_secret="${3:-no}"
        if [[ "$is_secret" == "yes" ]]; then
            read -sp "  $prompt: " "$var_name" < /dev/tty
            echo ""
        else
            read -p "  $prompt: " "$var_name" < /dev/tty
        fi
    }

    confirm() {
        local response
        read -p "  $1 " -n 1 -r response < /dev/tty
        echo ""
        [[ "$response" =~ ^[Yy]$ ]]
    }

    show_header

    [[ $EUID -ne 0 ]] && error_exit "Please run as root: ${BOLD}sudo bash install.sh${NC}"

    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS=$ID
    else
        error_exit "Cannot detect operating system"
    fi

    echo -e "  ${DIM}Detected:${NC} $PRETTY_NAME"
    echo ""

    echo -e "${BOLD}  Configuration${NC}"
    echo -e "  ${DIM}─────────────────────────────────────${NC}"
    echo ""
    
    echo -e "  ${CYAN}Panel Domain${NC} ${DIM}(where your panel will be accessible)${NC}"
    input_field "Domain" PANEL_DOMAIN
    [[ -z "$PANEL_DOMAIN" ]] && error_exit "Domain is required"
    echo ""

    echo -e "  ${CYAN}Auth0${NC} ${DIM}(from manage.auth0.com)${NC}"
    input_field "Domain" AUTH0_DOMAIN
    input_field "Client ID" AUTH0_CLIENT_ID
    input_field "Client Secret" AUTH0_CLIENT_SECRET yes
    echo ""

    echo -e "  ${CYAN}VirtFusion${NC}"
    if [[ -n "$PRECONFIGURED_VIRTFUSION_URL" ]]; then
        echo -e "  ${DIM}Panel URL:${NC} $PRECONFIGURED_VIRTFUSION_URL"
        VIRTFUSION_PANEL_URL="$PRECONFIGURED_VIRTFUSION_URL"
    else
        input_field "Panel URL" VIRTFUSION_PANEL_URL
    fi
    input_field "API Token" VIRTFUSION_API_TOKEN yes
    echo ""

    echo -e "  ${CYAN}PostgreSQL Database${NC} ${DIM}(for billing & wallets)${NC}"
    echo -e "  ${DIM}Leave blank to auto-generate secure password${NC}"
    input_field "Database Name (default: ozvps)" DB_NAME
    [[ -z "$DB_NAME" ]] && DB_NAME="ozvps"
    input_field "Database User (default: ozvps)" DB_USER
    [[ -z "$DB_USER" ]] && DB_USER="ozvps"
    input_field "Database Password" DB_PASS yes
    if [[ -z "$DB_PASS" ]]; then
        DB_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
        echo -e "  ${DIM}Generated secure password${NC}"
    fi
    echo ""

    echo -e "  ${CYAN}Stripe Payments${NC} ${DIM}(for wallet top-ups)${NC}"
    echo -e "  ${DIM}Get keys from dashboard.stripe.com/apikeys${NC}"
    input_field "Publishable Key (pk_...)" STRIPE_PUBLISHABLE_KEY
    input_field "Secret Key (sk_...)" STRIPE_SECRET_KEY yes
    echo ""

    echo -e "  ${CYAN}SSL Certificate${NC}"
    if confirm "Setup SSL with Let's Encrypt? (Y/n):"; then
        SETUP_SSL="yes"
        input_field "Email for SSL" SSL_EMAIL
    else
        SETUP_SSL="no"
        SSL_EMAIL=""
    fi
    echo ""

    echo -e "  ${DIM}─────────────────────────────────────${NC}"
    echo -e "  ${DIM}Domain:${NC}      $PANEL_DOMAIN"
    echo -e "  ${DIM}Auth0:${NC}       $AUTH0_DOMAIN"
    echo -e "  ${DIM}VirtFusion:${NC}  $VIRTFUSION_PANEL_URL"
    echo -e "  ${DIM}Database:${NC}    $DB_NAME (user: $DB_USER)"
    echo -e "  ${DIM}SSL:${NC}         $SETUP_SSL"
    echo ""

    if ! confirm "Continue with installation? (Y/n):"; then
        echo "  Installation cancelled."
        exit 0
    fi

    echo ""
    echo -e "${BOLD}  Installing...${NC}"
    echo ""

    # Node.js
    (
        if command -v node &> /dev/null; then
            CURRENT=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
            [[ "$CURRENT" -ge "$NODE_VERSION" ]] && exit 0
        fi
        case "$OS" in
            ubuntu|debian)
                curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
                apt-get install -y nodejs
                ;;
            centos|rhel|rocky|almalinux)
                curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x | bash -
                yum install -y nodejs
                ;;
        esac
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Installing Node.js"

    # Dependencies (including PostgreSQL)
    (
        case "$OS" in
            ubuntu|debian)
                apt-get update
                apt-get install -y git curl nginx certbot python3-certbot-nginx postgresql postgresql-contrib
                ;;
            centos|rhel|rocky|almalinux)
                yum install -y git curl nginx certbot python3-certbot-nginx epel-release postgresql-server postgresql-contrib
                postgresql-setup --initdb 2>/dev/null || true
                ;;
        esac
        npm install -g pm2
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Installing dependencies"

    # PostgreSQL setup
    (
        set -e
        
        # On Debian/Ubuntu, the 'postgresql' service is a wrapper that manages all clusters
        # On RHEL/CentOS, 'postgresql' is the main service (may need initdb first)
        
        # Try to start postgresql service (works on most systems)
        if ! systemctl is-active postgresql &>/dev/null; then
            systemctl start postgresql 2>/dev/null || true
        fi
        systemctl enable postgresql 2>/dev/null || true
        
        # Wait for PostgreSQL to be ready (max 30 seconds)
        PG_READY=false
        for i in {1..30}; do
            if sudo -u postgres psql -c "SELECT 1" &>/dev/null; then
                PG_READY=true
                break
            fi
            sleep 1
        done
        
        if [[ "$PG_READY" != "true" ]]; then
            echo "ERROR: PostgreSQL failed to start after 30 seconds" >&2
            exit 1
        fi
        
        # Create database user and database
        sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null || \
            sudo -u postgres psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASS';"
        sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || true
        sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
        
        # Allow password auth for local connections
        PG_HBA=$(sudo -u postgres psql -t -c "SHOW hba_file;" 2>/dev/null | tr -d ' ')
        if [[ -n "$PG_HBA" && -f "$PG_HBA" ]]; then
            if ! grep -q "host.*$DB_NAME.*$DB_USER" "$PG_HBA"; then
                echo "host    $DB_NAME    $DB_USER    127.0.0.1/32    md5" >> "$PG_HBA"
                echo "host    $DB_NAME    $DB_USER    ::1/128         md5" >> "$PG_HBA"
                # Reload PostgreSQL to apply pg_hba changes
                sudo -u postgres pg_ctl reload -D "$(sudo -u postgres psql -t -c "SHOW data_directory;" | tr -d ' ')" 2>/dev/null || \
                    systemctl reload postgresql 2>/dev/null || true
            fi
        fi
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Configuring PostgreSQL"

    # Firewall
    (
        if command -v ufw &> /dev/null; then
            ufw --force enable 2>/dev/null || true
            ufw allow 22/tcp 2>/dev/null || true
            ufw allow 80/tcp 2>/dev/null || true
            ufw allow 443/tcp 2>/dev/null || true
            ufw reload 2>/dev/null || true
        elif command -v firewall-cmd &> /dev/null; then
            systemctl start firewalld 2>/dev/null || true
            firewall-cmd --permanent --add-service=http 2>/dev/null || true
            firewall-cmd --permanent --add-service=https 2>/dev/null || true
            firewall-cmd --permanent --add-service=ssh 2>/dev/null || true
            firewall-cmd --reload 2>/dev/null || true
        fi
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Configuring firewall"

    [[ -z "$DOWNLOAD_URL" ]] && error_exit "No download URL. Run from your Replit app."

    mkdir -p "$INSTALL_DIR"
    
    # Download
    (
        curl -fsSL "$DOWNLOAD_URL" -o /tmp/ozvps-panel.tar.gz
        tar -xzf /tmp/ozvps-panel.tar.gz -C "$INSTALL_DIR"
        rm -f /tmp/ozvps-panel.tar.gz
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Downloading OzVPS Panel"

    # Config
    (
        cat > "$INSTALL_DIR/.env" << EOF
AUTH0_DOMAIN=$AUTH0_DOMAIN
AUTH0_CLIENT_ID=$AUTH0_CLIENT_ID
AUTH0_CLIENT_SECRET=$AUTH0_CLIENT_SECRET
VIRTFUSION_PANEL_URL=$VIRTFUSION_PANEL_URL
VIRTFUSION_API_TOKEN=$VIRTFUSION_API_TOKEN
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME
STRIPE_PUBLISHABLE_KEY=$STRIPE_PUBLISHABLE_KEY
STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY
NODE_ENV=production
PORT=5000
EOF
        chmod 600 "$INSTALL_DIR/.env"
        echo "$PANEL_DOMAIN" > "$INSTALL_DIR/.panel_domain"
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Writing configuration"

    # NPM install
    (
        cd "$INSTALL_DIR"
        if grep -q '"bad-words"' "$INSTALL_DIR/package.json" 2>/dev/null; then
            npm uninstall bad-words 2>/dev/null || true
        fi
        npm install
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Installing packages"

    # Database migrations
    (
        set -e
        cd "$INSTALL_DIR"
        export DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"
        
        # Verify database connection before migration
        DB_READY=false
        for i in {1..15}; do
            if PGPASSWORD="$DB_PASS" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" &>/dev/null; then
                DB_READY=true
                break
            fi
            sleep 1
        done
        
        if [[ "$DB_READY" != "true" ]]; then
            echo "ERROR: Cannot connect to database after 15 seconds" >&2
            exit 1
        fi
        
        npx drizzle-kit push --force
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Setting up database schema"

    # Build
    (cd "$INSTALL_DIR" && npm run build) >>"$LOG_FILE" 2>&1 &
    spinner $! "Building application"

    # Nginx
    (
        mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
        cat > "/etc/nginx/sites-available/$SERVICE_NAME" << EOF
server {
    listen 80;
    server_name $PANEL_DOMAIN;
    location / {
        proxy_pass http://127.0.0.1:5000;
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
EOF
        ln -sf "/etc/nginx/sites-available/$SERVICE_NAME" /etc/nginx/sites-enabled/
        rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
        if [[ "$OS" == "centos" || "$OS" == "rhel" || "$OS" == "rocky" || "$OS" == "almalinux" ]]; then
            grep -q "sites-enabled" /etc/nginx/nginx.conf || sed -i '/http {/a \    include /etc/nginx/sites-enabled/*;' /etc/nginx/nginx.conf
        fi
        nginx -t
        systemctl reload nginx
        systemctl enable nginx
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Configuring Nginx"

    # SSL
    if [[ "$SETUP_SSL" == "yes" && -n "$SSL_EMAIL" ]]; then
        (certbot --nginx -d "$PANEL_DOMAIN" --non-interactive --agree-tos --email "$SSL_EMAIL") >>"$LOG_FILE" 2>&1 &
        spinner $! "Setting up SSL" || echo -e "  ${YELLOW}!${NC}  SSL failed - run manually: certbot --nginx -d $PANEL_DOMAIN"
    fi

    # PM2
    (
        cd "$INSTALL_DIR"
        pm2 delete "$SERVICE_NAME" 2>/dev/null || true
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
    name: 'ozvps-panel',
    script: 'npm',
    args: 'start',
    cwd: __dirname,
    env: { NODE_ENV: 'production', ...envVars },
    autorestart: true,
    max_restarts: 10
  }]
};
PMEOF
        pm2 start "$INSTALL_DIR/ecosystem.config.cjs"
        pm2 save
        pm2 startup systemd -u root --hp /root 2>/dev/null || true
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Starting service"

    # Update command and CLI tools
    (
        UPDATE_URL="${DOWNLOAD_URL%/download.tar.gz}/update-ozvps.sh"
        curl -fsSL "$UPDATE_URL" -o /usr/local/bin/update-ozvps 2>/dev/null || exit 0
        chmod +x /usr/local/bin/update-ozvps
        REPLIT_BASE="${DOWNLOAD_URL%/download.tar.gz}"
        echo "REPLIT_URL=\"$REPLIT_BASE\"" > "$INSTALL_DIR/.update_config"
        chmod 600 "$INSTALL_DIR/.update_config"
        
        # Install ozvpsctl CLI
        if [[ -f "$INSTALL_DIR/script/ozvpsctl.sh" ]]; then
            cp "$INSTALL_DIR/script/ozvpsctl.sh" /usr/local/bin/ozvpsctl
            chmod +x /usr/local/bin/ozvpsctl
        fi
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Installing tools"

    echo ""
    echo -e "${GREEN}┌─────────────────────────────────────────┐${NC}"
    echo -e "${GREEN}│${NC}  ${BOLD}Installation Complete${NC}                  ${GREEN}│${NC}"
    echo -e "${GREEN}└─────────────────────────────────────────┘${NC}"
    echo ""
    if [[ "$SETUP_SSL" == "yes" ]]; then
        echo -e "  ${BOLD}Panel:${NC}  https://$PANEL_DOMAIN"
    else
        echo -e "  ${BOLD}Panel:${NC}  http://$PANEL_DOMAIN"
    fi
    echo ""
    echo -e "  ${DIM}Commands:${NC}"
    echo -e "    ${DIM}update-ozvps${NC}  - Update to latest version"
    echo -e "    ${DIM}ozvpsctl${NC}      - Admin management tool"
    echo -e "    ${DIM}pm2 logs${NC}      - View application logs"
    echo -e "    ${DIM}pm2 status${NC}    - Check service status"
    echo ""
}

main "$@"
