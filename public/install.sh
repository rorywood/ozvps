#!/usr/bin/env bash
set -e
set -u
set -o pipefail

# OzVPS Unified Installer
# Supports both Production and Development environments

INSTALL_DIR="/opt/ozvps-panel"
SERVICE_NAME="ozvps-panel"
NODE_VERSION="20"
LOG_FILE="/tmp/ozvps-install.log"
GITHUB_REPO="rorywood/ozvps"

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

    # Check if already installed
    if [ -d "$INSTALL_DIR" ]; then
        echo -e "${YELLOW}${BOLD}⚠ Warning: Installation already exists at $INSTALL_DIR${NC}"
        echo ""
        echo "  Options:"
        echo "    [1] Cancel installation (default)"
        echo "    [2] Remove and reinstall (quick - keeps system packages)"
        echo "    [3] Force full reinstall (uninstall and reinstall everything)"
        echo ""
        read -p "  Choose option [1-3]: " -n 1 -r CHOICE < /dev/tty
        echo ""
        echo ""

        if [[ "$CHOICE" == "3" ]]; then
            FORCE_REINSTALL=true
            echo -e "${CYAN}${BOLD}Full reinstall selected - will uninstall and reinstall all dependencies${NC}"
            echo ""
        elif [[ "$CHOICE" == "2" ]]; then
            FORCE_REINSTALL=false
            echo -e "${CYAN}Quick reinstall selected${NC}"
            echo ""
        else
            echo "  Installation cancelled."
            exit 0
        fi

        # Stop and remove existing service
        (
            pm2 delete $SERVICE_NAME 2>/dev/null || true
            pm2 save --force 2>/dev/null || true
            rm -rf "$INSTALL_DIR"
        ) >>"$LOG_FILE" 2>&1 &
        spinner $! "Removing existing installation"
        echo ""
    else
        FORCE_REINSTALL=false
    fi

    # Ask for environment FIRST
    echo -e "${BOLD}  Environment${NC}"
    echo -e "  ${DIM}─────────────────────────────────────${NC}"
    echo ""
    echo "  Which environment are you setting up?"
    echo "    [1] Production  (app.ozvps.com.au - LIVE Stripe keys)"
    echo "    [2] Development (dev.ozvps.com.au - TEST Stripe keys)"
    echo ""
    read -p "  Choose [1-2]: " -n 1 -r ENV_CHOICE < /dev/tty
    echo ""
    echo ""

    if [[ "$ENV_CHOICE" == "1" ]]; then
        ENVIRONMENT="production"
        GITHUB_BRANCH="main"
        DEFAULT_DOMAIN="app.ozvps.com.au"
        STRIPE_MODE="LIVE"
        NODE_ENV="production"
        UPDATE_SCRIPT="update-ozvps-prod"
        echo -e "  ${GREEN}✓${NC} Selected: ${BOLD}Production${NC} environment"
    elif [[ "$ENV_CHOICE" == "2" ]]; then
        ENVIRONMENT="development"
        GITHUB_BRANCH="claude/dev-l5488"
        DEFAULT_DOMAIN="dev.ozvps.com.au"
        STRIPE_MODE="TEST"
        NODE_ENV="development"
        UPDATE_SCRIPT="update-ozvps-dev"
        echo -e "  ${GREEN}✓${NC} Selected: ${BOLD}Development${NC} environment"
    else
        error_exit "Invalid choice. Run installer again."
    fi
    echo ""

    # Collect ALL configuration
    echo -e "${BOLD}  Configuration${NC}"
    echo -e "  ${DIM}─────────────────────────────────────${NC}"
    echo ""

    echo -e "  ${CYAN}Panel Domain${NC} ${DIM}(where your panel will be accessible)${NC}"
    input_field "Domain [$DEFAULT_DOMAIN]" PANEL_DOMAIN
    [[ -z "$PANEL_DOMAIN" ]] && PANEL_DOMAIN="$DEFAULT_DOMAIN"
    echo ""

    echo -e "  ${CYAN}VirtFusion${NC}"
    input_field "Panel URL [https://panel.ozvps.com.au]" VIRTFUSION_PANEL_URL
    [[ -z "$VIRTFUSION_PANEL_URL" ]] && VIRTFUSION_PANEL_URL="https://panel.ozvps.com.au"
    input_field "API Key" VIRTFUSION_API_KEY yes
    [[ -z "$VIRTFUSION_API_KEY" ]] && error_exit "VirtFusion API Key is required"
    echo ""

    echo -e "  ${CYAN}PostgreSQL Database${NC} ${DIM}(for billing & wallets)${NC}"
    if [[ "$ENVIRONMENT" == "production" ]]; then
        DEFAULT_DB_NAME="ozvps"
        DEFAULT_DB_USER="ozvps"
    else
        DEFAULT_DB_NAME="ozvps_dev"
        DEFAULT_DB_USER="ozvps_dev"
    fi
    input_field "Database Name [$DEFAULT_DB_NAME]" DB_NAME
    [[ -z "$DB_NAME" ]] && DB_NAME="$DEFAULT_DB_NAME"
    input_field "Database User [$DEFAULT_DB_USER]" DB_USER
    [[ -z "$DB_USER" ]] && DB_USER="$DEFAULT_DB_USER"
    input_field "Database Password (leave blank to auto-generate)" DB_PASS yes
    if [[ -z "$DB_PASS" ]]; then
        DB_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
        echo -e "  ${DIM}Generated secure password: ${DB_PASS}${NC}"
    fi
    echo ""

    echo -e "  ${CYAN}Stripe Payments${NC} ${DIM}(${STRIPE_MODE} keys for ${ENVIRONMENT})${NC}"
    if [[ "$STRIPE_MODE" == "TEST" ]]; then
        echo -e "  ${YELLOW}⚠ Use TEST keys (sk_test_..., pk_test_...) not LIVE keys!${NC}"
        input_field "Secret Key (sk_test_...)" STRIPE_SECRET_KEY yes
        input_field "Publishable Key (pk_test_...)" STRIPE_PUBLISHABLE_KEY
        input_field "Webhook Secret (whsec_...)" STRIPE_WEBHOOK_SECRET yes
    else
        echo -e "  ${YELLOW}⚠ Use LIVE keys (sk_live_..., pk_live_...) for production!${NC}"
        input_field "Secret Key (sk_live_...)" STRIPE_SECRET_KEY yes
        input_field "Publishable Key (pk_live_...)" STRIPE_PUBLISHABLE_KEY
        input_field "Webhook Secret (whsec_...)" STRIPE_WEBHOOK_SECRET yes
    fi
    [[ -z "$STRIPE_SECRET_KEY" ]] && error_exit "Stripe Secret Key is required"
    [[ -z "$STRIPE_PUBLISHABLE_KEY" ]] && error_exit "Stripe Publishable Key is required"
    echo ""

    echo -e "  ${CYAN}Auth0 Configuration${NC}"
    input_field "Auth0 Secret" AUTH0_SECRET yes
    input_field "Auth0 Issuer Base URL (https://your-tenant.auth0.com)" AUTH0_ISSUER
    input_field "Auth0 Client ID" AUTH0_CLIENT_ID
    input_field "Auth0 Client Secret" AUTH0_CLIENT_SECRET yes
    [[ -z "$AUTH0_SECRET" ]] && error_exit "Auth0 Secret is required"
    [[ -z "$AUTH0_ISSUER" ]] && error_exit "Auth0 Issuer is required"
    [[ -z "$AUTH0_CLIENT_ID" ]] && error_exit "Auth0 Client ID is required"
    [[ -z "$AUTH0_CLIENT_SECRET" ]] && error_exit "Auth0 Client Secret is required"
    echo ""

    echo -e "  ${CYAN}SSL Certificate${NC}"
    if confirm "Setup SSL with Let's Encrypt? (Y/n):"; then
        SETUP_SSL="yes"
        input_field "Email for SSL notifications" SSL_EMAIL
        [[ -z "$SSL_EMAIL" ]] && SSL_EMAIL="admin@${PANEL_DOMAIN}"
    else
        SETUP_SSL="no"
        SSL_EMAIL=""
    fi
    echo ""

    # Show summary
    echo -e "  ${DIM}─────────────────────────────────────${NC}"
    echo -e "  ${BOLD}Summary:${NC}"
    echo -e "  ${DIM}Environment:${NC}  $ENVIRONMENT"
    echo -e "  ${DIM}Branch:${NC}       $GITHUB_BRANCH"
    echo -e "  ${DIM}Domain:${NC}       $PANEL_DOMAIN"
    echo -e "  ${DIM}VirtFusion:${NC}   $VIRTFUSION_PANEL_URL"
    echo -e "  ${DIM}Database:${NC}     $DB_NAME (user: $DB_USER)"
    echo -e "  ${DIM}Stripe:${NC}       $STRIPE_MODE keys"
    echo -e "  ${DIM}SSL:${NC}          $SETUP_SSL"
    echo -e "  ${DIM}─────────────────────────────────────${NC}"
    echo ""

    if ! confirm "Continue with installation? (Y/n):"; then
        echo "  Installation cancelled."
        exit 0
    fi

    echo ""
    echo -e "${BOLD}  Installing...${NC}"
    echo ""

    # Install/Check Node.js
    if [[ "$FORCE_REINSTALL" == "true" ]] && command -v node &>/dev/null; then
        (
            case "$OS" in
                ubuntu|debian)
                    apt-get remove -y nodejs
                    apt-get autoremove -y
                    ;;
                centos|rhel|rocky|almalinux)
                    yum remove -y nodejs
                    ;;
            esac
        ) >>"$LOG_FILE" 2>&1 &
        spinner $! "Uninstalling existing Node.js"
    fi

    if command -v node &>/dev/null && [[ "$FORCE_REINSTALL" != "true" ]]; then
        NODE_VERSION_CURRENT=$(node --version)
        echo -e "  ${GREEN}✓${NC}  Node.js $NODE_VERSION_CURRENT (already installed)"
    else
        (
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
    fi

    # Install/Check PM2
    if [[ "$FORCE_REINSTALL" == "true" ]] && command -v pm2 &>/dev/null; then
        (npm uninstall -g pm2) >>"$LOG_FILE" 2>&1 &
        spinner $! "Uninstalling existing PM2"
    fi

    if command -v pm2 &>/dev/null && [[ "$FORCE_REINSTALL" != "true" ]]; then
        PM2_VERSION=$(pm2 --version)
        echo -e "  ${GREEN}✓${NC}  PM2 v$PM2_VERSION (already installed)"
    else
        (npm install -g pm2) >>"$LOG_FILE" 2>&1 &
        spinner $! "Installing PM2"
    fi

    # Install system dependencies
    (
        case "$OS" in
            ubuntu|debian)
                apt-get update
                apt-get install -y nginx certbot python3-certbot-nginx postgresql postgresql-contrib unzip rsync
                ;;
            centos|rhel|rocky|almalinux)
                yum install -y nginx certbot python3-certbot-nginx postgresql-server postgresql-contrib unzip rsync
                postgresql-setup --initdb 2>/dev/null || true
                ;;
        esac
        systemctl start nginx 2>/dev/null || true
        systemctl enable nginx 2>/dev/null || true
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Installing system dependencies"

    # Configure PostgreSQL
    (
        set -e

        if ! systemctl is-active postgresql &>/dev/null; then
            systemctl start postgresql 2>/dev/null || true
        fi
        systemctl enable postgresql 2>/dev/null || true

        # Wait for PostgreSQL to be ready
        PG_READY=false
        for i in {1..30}; do
            if sudo -u postgres psql -c "SELECT 1" &>/dev/null; then
                PG_READY=true
                break
            fi
            sleep 1
        done

        [[ "$PG_READY" != "true" ]] && exit 1

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
                sudo -u postgres pg_ctl reload -D "$(sudo -u postgres psql -t -c "SHOW data_directory;" | tr -d ' ')" 2>/dev/null || \
                    systemctl reload postgresql 2>/dev/null || true
            fi
        fi
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Configuring PostgreSQL"

    # Configure firewall
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

    # Download from GitHub
    (
        set -e
        mkdir -p "$INSTALL_DIR"
        cd "$INSTALL_DIR"

        SAFE_BRANCH=$(echo "${GITHUB_BRANCH}" | tr '/' '-')
        TEMP_ZIP="/tmp/ozvps-${SAFE_BRANCH}.zip"
        TEMP_EXTRACT="/tmp/ozvps-${SAFE_BRANCH}-extract"

        curl -fsSL "https://github.com/${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.zip" -o "$TEMP_ZIP"

        mkdir -p "$TEMP_EXTRACT"
        unzip -q "$TEMP_ZIP" -d "$TEMP_EXTRACT"

        EXTRACTED_DIR=$(find "$TEMP_EXTRACT" -maxdepth 1 -type d -name "ozvps-*" | head -1)
        [[ -z "$EXTRACTED_DIR" ]] && exit 1

        rsync -a "${EXTRACTED_DIR}/" "$INSTALL_DIR/"
        rm -rf "$TEMP_EXTRACT" "$TEMP_ZIP"
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Downloading from GitHub ($GITHUB_BRANCH)"

    # Create configuration file
    (
        cat > "$INSTALL_DIR/.env" << EOF
# Database Configuration
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME

# VirtFusion API
VIRTFUSION_API_URL=$VIRTFUSION_PANEL_URL
VIRTFUSION_API_KEY=$VIRTFUSION_API_KEY

# Stripe Configuration ($STRIPE_MODE KEYS)
STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY
STRIPE_PUBLISHABLE_KEY=$STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET:-}

# Auth0 Configuration
AUTH0_SECRET=$AUTH0_SECRET
AUTH0_BASE_URL=https://$PANEL_DOMAIN
AUTH0_ISSUER_BASE_URL=$AUTH0_ISSUER
AUTH0_CLIENT_ID=$AUTH0_CLIENT_ID
AUTH0_CLIENT_SECRET=$AUTH0_CLIENT_SECRET

# Application Settings
NODE_ENV=$NODE_ENV
PORT=3000
EOF
        chmod 600 "$INSTALL_DIR/.env"
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Writing configuration"

    # Install npm dependencies
    (
        cd "$INSTALL_DIR"
        npm install --production
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Installing npm packages"

    # Create PM2 ecosystem file
    (
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
    env: {
      NODE_ENV: 'production',
      PORT: '3000',
      ...envVars
    },
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '500M'
  }]
};
PMEOF
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Configuring PM2"

    # Configure NGINX
    (
        set -e
        if [[ "$ENVIRONMENT" == "production" ]]; then
            NGINX_CONF="ozvps-prod"
        else
            NGINX_CONF="ozvps-dev"
        fi

        cat > "/etc/nginx/sites-available/$NGINX_CONF" << EOF
server {
    listen 80;
    server_name $PANEL_DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:3000;
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
        client_max_body_size 100M;
    }
}
EOF

        mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
        ln -sf "/etc/nginx/sites-available/$NGINX_CONF" /etc/nginx/sites-enabled/

        if [[ "$OS" == "centos" || "$OS" == "rhel" || "$OS" == "rocky" || "$OS" == "almalinux" ]]; then
            grep -q "sites-enabled" /etc/nginx/nginx.conf || sed -i '/http {/a \    include /etc/nginx/sites-enabled/*;' /etc/nginx/nginx.conf
        fi

        nginx -t
        systemctl reload nginx
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Configuring NGINX"

    # Setup SSL
    if [[ "$SETUP_SSL" == "yes" && -n "$SSL_EMAIL" ]]; then
        (certbot --nginx -d "$PANEL_DOMAIN" --non-interactive --agree-tos --email "$SSL_EMAIL" --redirect) >>"$LOG_FILE" 2>&1 &
        spinner $! "Setting up SSL" || echo -e "  ${YELLOW}!${NC}  SSL failed - run manually: certbot --nginx -d $PANEL_DOMAIN"
    fi

    # Start PM2 service
    (
        cd "$INSTALL_DIR"
        pm2 delete "$SERVICE_NAME" 2>/dev/null || true
        pm2 start ecosystem.config.cjs
        pm2 save --force
        pm2 startup systemd -u root --hp /root 2>/dev/null || true
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Starting application"

    # Install update script
    (
        set -e
        if [[ "$ENVIRONMENT" == "production" ]]; then
            UPDATE_SCRIPT_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/public/update-prod.sh"
        else
            UPDATE_SCRIPT_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/public/update-dev.sh"
        fi

        curl -fsSL "$UPDATE_SCRIPT_URL" -o "/usr/local/bin/$UPDATE_SCRIPT"
        chmod +x "/usr/local/bin/$UPDATE_SCRIPT"
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Installing update script"

    # Wait for application to be ready
    echo ""
    echo -e "  ${DIM}Waiting for application to start...${NC}"
    sleep 3
    for i in {1..30}; do
        if curl -s http://127.0.0.1:3000/api/health &>/dev/null; then
            echo -e "  ${GREEN}✓${NC}  Application is running"
            break
        fi
        sleep 1
    done

    echo ""
    echo -e "${GREEN}┌─────────────────────────────────────────┐${NC}"
    echo -e "${GREEN}│${NC}  ${BOLD}Installation Complete!${NC}                 ${GREEN}│${NC}"
    echo -e "${GREEN}└─────────────────────────────────────────┘${NC}"
    echo ""
    echo -e "  ${BOLD}Environment:${NC} $ENVIRONMENT"
    if [[ "$SETUP_SSL" == "yes" ]]; then
        echo -e "  ${BOLD}Panel URL:${NC}   https://$PANEL_DOMAIN"
    else
        echo -e "  ${BOLD}Panel URL:${NC}   http://$PANEL_DOMAIN"
    fi
    echo ""
    echo -e "  ${DIM}Commands:${NC}"
    echo -e "    ${BOLD}$UPDATE_SCRIPT${NC}  - Update to latest version"
    echo -e "    ${BOLD}pm2 status${NC}              - Check service status"
    echo -e "    ${BOLD}pm2 logs $SERVICE_NAME${NC}  - View application logs"
    echo -e "    ${BOLD}pm2 restart $SERVICE_NAME${NC} - Restart application"
    echo ""
    echo -e "  ${YELLOW}Database Password:${NC} $DB_PASS"
    echo -e "  ${DIM}(save this password securely)${NC}"
    echo ""
}

main "$@"
