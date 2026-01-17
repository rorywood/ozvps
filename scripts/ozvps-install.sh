#!/usr/bin/env bash
set -e
set -u
set -o pipefail

# ============================================================================
#  OzVPS Unified Installer
#  Version: 4.0.0
#
#  Usage:
#    sudo bash ozvps-install.sh [--dev|--prod]
#    sudo bash ozvps-install.sh --unattended --config=/path/to/config.env
# ============================================================================

VERSION="4.0.0"
INSTALL_DIR="/opt/ozvps-panel"
SERVICE_NAME="ozvps-panel"
NODE_VERSION="20"
LOG_FILE="/tmp/ozvps-install.log"
GITHUB_REPO="rorywood/ozvps"

# ============================================================================
# Colors and Styling
# ============================================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

SPINNER='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

# ============================================================================
# Self-Update Function
# ============================================================================
self_update() {
    local SELF_PATH="$1"
    shift
    local SCRIPT_ARGS=("$@")

    # Determine branch for self-update (default to main for safety)
    local UPDATE_BRANCH="${GITHUB_BRANCH:-main}"
    local SCRIPT_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/${UPDATE_BRANCH}/scripts/ozvps-install.sh"
    local TEMP_SCRIPT=$(mktemp)

    echo -e "  ${DIM}Checking for installer updates...${NC}"

    if curl -fsSL -H 'Cache-Control: no-cache' "$SCRIPT_URL?t=$(date +%s)" -o "$TEMP_SCRIPT" 2>/dev/null; then
        if head -1 "$TEMP_SCRIPT" | grep -q "^#!/"; then
            local CURRENT_MD5=$(md5sum "$SELF_PATH" 2>/dev/null | cut -d' ' -f1)
            local NEW_MD5=$(md5sum "$TEMP_SCRIPT" 2>/dev/null | cut -d' ' -f1)

            if [ "$CURRENT_MD5" != "$NEW_MD5" ]; then
                echo -e "  ${GREEN}✓${NC} New installer version found, updating..."
                cp "$TEMP_SCRIPT" "$SELF_PATH"
                chmod +x "$SELF_PATH"
                rm -f "$TEMP_SCRIPT"
                exec "$SELF_PATH" --no-self-update "${SCRIPT_ARGS[@]}"
            fi
        fi
    fi

    rm -f "$TEMP_SCRIPT" 2>/dev/null
}

# ============================================================================
# Helper Functions
# ============================================================================
show_header() {
    clear
    echo ""
    echo -e "${CYAN}${BOLD}"
    cat << "EOF"
    ╔═══════════════════════════════════════════════════════════╗
    ║   ██████╗ ███████╗██╗   ██╗██████╗ ███████╗              ║
    ║  ██╔═══██╗╚══███╔╝██║   ██║██╔══██╗██╔════╝              ║
    ║  ██║   ██║  ███╔╝ ██║   ██║██████╔╝███████╗              ║
    ║  ██║   ██║ ███╔╝  ╚██╗ ██╔╝██╔═══╝ ╚════██║              ║
    ║  ╚██████╔╝███████╗ ╚████╔╝ ██║     ███████║              ║
    ║   ╚═════╝ ╚══════╝  ╚═══╝  ╚═╝     ╚══════╝              ║
EOF
    echo -e "    ║            ${NC}${BOLD}Unified Installer v${VERSION}${CYAN}${BOLD}                    ║"
    echo -e "    ╚═══════════════════════════════════════════════════════════╝${NC}"
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
        return 1
    fi
}

error_exit() {
    echo ""
    echo -e "  ${RED}✗${NC}  $1"
    echo ""
    exit 1
}

success() { echo -e "  ${GREEN}✓${NC}  $1"; }
info() { echo -e "  ${CYAN}→${NC}  $1"; }
warning() { echo -e "  ${YELLOW}⚠${NC}  $1"; }

input_field() {
    local prompt=$1
    local var_name=$2
    local default="${3:-}"
    local is_secret="${4:-no}"

    if [[ -n "$default" ]]; then
        prompt="$prompt [$default]"
    fi

    if [[ "$is_secret" == "yes" ]]; then
        read -sp "  $prompt: " "$var_name" < /dev/tty
        echo ""
    else
        read -p "  $prompt: " "$var_name" < /dev/tty
    fi

    # Apply default if empty
    if [[ -z "${!var_name}" && -n "$default" ]]; then
        eval "$var_name=\"$default\""
    fi
}

confirm() {
    local response
    read -p "  $1 " -n 1 -r response < /dev/tty
    echo ""
    [[ "$response" =~ ^[Yy]$ ]]
}

step_header() {
    local step=$1
    local total=$2
    local title=$3
    echo ""
    echo -e "${BLUE}╭$( printf '─%.0s' {1..60} )╮${NC}"
    echo -e "${BLUE}│${NC} ${BOLD}Step $step/$total: $title${NC}"
    echo -e "${BLUE}╰$( printf '─%.0s' {1..60} )╯${NC}"
    echo ""
}

# ============================================================================
# Parse Arguments
# ============================================================================
ENVIRONMENT=""
UNATTENDED=false
CONFIG_FILE=""
SKIP_SELF_UPDATE=false
FORCE_REINSTALL=false

for arg in "$@"; do
    case $arg in
        --dev)
            ENVIRONMENT="development"
            ;;
        --prod|--production)
            ENVIRONMENT="production"
            ;;
        --unattended)
            UNATTENDED=true
            ;;
        --config=*)
            CONFIG_FILE="${arg#*=}"
            ;;
        --no-self-update)
            SKIP_SELF_UPDATE=true
            ;;
        --force)
            FORCE_REINSTALL=true
            ;;
        --help|-h)
            echo "OzVPS Unified Installer v${VERSION}"
            echo ""
            echo "Usage: sudo bash ozvps-install.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --dev           Install development environment"
            echo "  --prod          Install production environment"
            echo "  --unattended    Non-interactive installation"
            echo "  --config=FILE   Load configuration from file"
            echo "  --force         Force reinstall (remove existing)"
            echo "  --help          Show this help message"
            exit 0
            ;;
    esac
done

# Get the path to this script for self-update
SELF_PATH="$(readlink -f "$0" 2>/dev/null || echo "$0")"

# ============================================================================
# Main Installation
# ============================================================================
main() {
    > "$LOG_FILE"

    show_header

    # Check root
    [[ $EUID -ne 0 ]] && error_exit "Please run as root: ${BOLD}sudo bash ozvps-install.sh${NC}"

    # Detect OS
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS=$ID
    else
        error_exit "Cannot detect operating system"
    fi

    echo -e "  ${DIM}Detected:${NC} $PRETTY_NAME"
    echo -e "  ${DIM}Version:${NC}  Installer v${VERSION}"
    echo ""

    # Self-update check (unless skipped)
    if [[ "$SKIP_SELF_UPDATE" == "false" && -f "$SELF_PATH" ]]; then
        self_update "$SELF_PATH" "$@"
    fi

    # ========================================================================
    # Check for existing installation
    # ========================================================================
    if [ -d "$INSTALL_DIR" ]; then
        echo -e "${YELLOW}${BOLD}  Existing installation detected at $INSTALL_DIR${NC}"
        echo ""

        if [[ "$FORCE_REINSTALL" == "true" ]]; then
            CHOICE="2"
        elif [[ "$UNATTENDED" == "true" ]]; then
            error_exit "Installation exists. Use --force to reinstall."
        else
            echo "  Options:"
            echo "    [1] Cancel installation (default)"
            echo "    [2] Remove and reinstall (quick - keeps system packages)"
            echo "    [3] Force full reinstall (uninstall and reinstall everything)"
            echo ""
            read -p "  Choose option [1-3]: " -n 1 -r CHOICE < /dev/tty
            echo ""
            echo ""
        fi

        if [[ "$CHOICE" == "3" ]]; then
            FORCE_REINSTALL=true
            info "Full reinstall selected"
        elif [[ "$CHOICE" == "2" ]]; then
            FORCE_REINSTALL=false
            info "Quick reinstall selected"
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
    fi

    # ========================================================================
    # Step 1: Environment Selection
    # ========================================================================
    step_header 1 7 "Environment Selection"

    if [[ -z "$ENVIRONMENT" ]]; then
        if [[ "$UNATTENDED" == "true" ]]; then
            error_exit "Environment not specified. Use --dev or --prod"
        fi

        echo "  Which environment are you setting up?"
        echo ""
        echo "    ${BOLD}[1]${NC} Production  ${DIM}(app.ozvps.com.au - LIVE Stripe)${NC}"
        echo "    ${BOLD}[2]${NC} Development ${DIM}(dev.ozvps.com.au - TEST Stripe)${NC}"
        echo ""
        read -p "  Choose [1-2]: " -n 1 -r ENV_CHOICE < /dev/tty
        echo ""

        if [[ "$ENV_CHOICE" == "1" ]]; then
            ENVIRONMENT="production"
        elif [[ "$ENV_CHOICE" == "2" ]]; then
            ENVIRONMENT="development"
        else
            error_exit "Invalid choice. Run installer again."
        fi
    fi

    # Set environment-specific defaults
    if [[ "$ENVIRONMENT" == "production" ]]; then
        GITHUB_BRANCH="main"
        DEFAULT_DOMAIN="app.ozvps.com.au"
        STRIPE_MODE="LIVE"
        NODE_ENV="production"
        DEFAULT_DB_NAME="ozvps"
        DEFAULT_DB_USER="ozvps"
        success "Selected: ${BOLD}Production${NC} environment"
    else
        GITHUB_BRANCH="claude/dev-l5488"
        DEFAULT_DOMAIN="dev.ozvps.com.au"
        STRIPE_MODE="TEST"
        NODE_ENV="development"
        DEFAULT_DB_NAME="ozvps_dev"
        DEFAULT_DB_USER="ozvps_dev"
        success "Selected: ${BOLD}Development${NC} environment"
    fi

    echo -e "  ${DIM}Branch: $GITHUB_BRANCH${NC}"

    # ========================================================================
    # Step 2: Domain Configuration
    # ========================================================================
    step_header 2 7 "Domain Configuration"

    if [[ "$UNATTENDED" == "true" && -n "$CONFIG_FILE" ]]; then
        source "$CONFIG_FILE"
    else
        echo -e "  ${CYAN}Panel Domain${NC} ${DIM}(where your panel will be accessible)${NC}"
        input_field "Domain" PANEL_DOMAIN "$DEFAULT_DOMAIN"
        echo ""

        echo -e "  ${CYAN}SSL Certificate${NC}"
        if confirm "Setup SSL with Let's Encrypt? (Y/n):"; then
            SETUP_SSL="yes"
            input_field "Email for SSL notifications" SSL_EMAIL "admin@${PANEL_DOMAIN}"
        else
            SETUP_SSL="no"
            SSL_EMAIL=""
        fi
    fi

    success "Domain: $PANEL_DOMAIN"

    # ========================================================================
    # Step 3: Database Configuration
    # ========================================================================
    step_header 3 7 "Database Configuration"

    if [[ "$UNATTENDED" != "true" ]]; then
        echo "  Database setup options:"
        echo "    ${BOLD}[1]${NC} Install local PostgreSQL ${DIM}(recommended)${NC}"
        echo "    ${BOLD}[2]${NC} Use external database"
        echo ""
        read -p "  Choose [1-2]: " -n 1 -r DB_CHOICE < /dev/tty
        echo ""
        echo ""

        if [[ "$DB_CHOICE" == "2" ]]; then
            input_field "Database Host" DB_HOST "localhost"
            input_field "Database Port" DB_PORT "5432"
        else
            DB_HOST="localhost"
            DB_PORT="5432"
        fi

        input_field "Database Name" DB_NAME "$DEFAULT_DB_NAME"
        input_field "Database User" DB_USER "$DEFAULT_DB_USER"
        input_field "Database Password (blank = auto-generate)" DB_PASS "" "yes"

        if [[ -z "$DB_PASS" ]]; then
            DB_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
            echo -e "  ${DIM}Generated: ${DB_PASS}${NC}"
        fi
    fi

    success "Database: $DB_NAME @ $DB_HOST"

    # ========================================================================
    # Step 4: VirtFusion Configuration
    # ========================================================================
    step_header 4 7 "VirtFusion Configuration"

    if [[ "$UNATTENDED" != "true" ]]; then
        input_field "VirtFusion Panel URL" VIRTFUSION_PANEL_URL "https://panel.ozvps.com.au"
        input_field "VirtFusion API Token" VIRTFUSION_API_TOKEN "" "yes"

        [[ -z "$VIRTFUSION_API_TOKEN" ]] && error_exit "VirtFusion API Token is required"
    fi

    success "VirtFusion: $VIRTFUSION_PANEL_URL"

    # ========================================================================
    # Step 5: Stripe Configuration
    # ========================================================================
    step_header 5 7 "Stripe Configuration"

    if [[ "$UNATTENDED" != "true" ]]; then
        if [[ "$STRIPE_MODE" == "TEST" ]]; then
            echo -e "  ${YELLOW}Using TEST keys for development${NC}"
            echo -e "  ${DIM}Use sk_test_... and pk_test_... keys${NC}"
        else
            echo -e "  ${RED}${BOLD}Using LIVE keys for production!${NC}"
            echo -e "  ${DIM}Use sk_live_... and pk_live_... keys${NC}"
        fi
        echo ""

        input_field "Stripe Secret Key" STRIPE_SECRET_KEY "" "yes"
        input_field "Stripe Publishable Key" STRIPE_PUBLISHABLE_KEY
        input_field "Stripe Webhook Secret" STRIPE_WEBHOOK_SECRET "" "yes"

        [[ -z "$STRIPE_SECRET_KEY" ]] && error_exit "Stripe Secret Key is required"
        [[ -z "$STRIPE_PUBLISHABLE_KEY" ]] && error_exit "Stripe Publishable Key is required"
    fi

    success "Stripe: $STRIPE_MODE mode configured"

    # ========================================================================
    # Step 6: Auth0 Configuration
    # ========================================================================
    step_header 6 7 "Auth0 Configuration"

    if [[ "$UNATTENDED" != "true" ]]; then
        input_field "Auth0 Domain (e.g. your-app.au.auth0.com)" AUTH0_DOMAIN
        # Remove https:// prefix if included
        AUTH0_DOMAIN=$(echo "$AUTH0_DOMAIN" | sed 's|^https://||' | sed 's|/$||')

        input_field "Auth0 Client ID" AUTH0_CLIENT_ID
        input_field "Auth0 Client Secret" AUTH0_CLIENT_SECRET "" "yes"
        input_field "Auth0 Webhook Secret (blank = auto-generate)" AUTH0_WEBHOOK_SECRET "" "yes"

        if [[ -z "$AUTH0_WEBHOOK_SECRET" ]]; then
            AUTH0_WEBHOOK_SECRET=$(openssl rand -hex 32)
        fi

        [[ -z "$AUTH0_DOMAIN" ]] && error_exit "Auth0 Domain is required"
        [[ -z "$AUTH0_CLIENT_ID" ]] && error_exit "Auth0 Client ID is required"
        [[ -z "$AUTH0_CLIENT_SECRET" ]] && error_exit "Auth0 Client Secret is required"
    fi

    success "Auth0: $AUTH0_DOMAIN"

    # ========================================================================
    # Step 7: Optional Services
    # ========================================================================
    step_header 7 7 "Optional Services"

    if [[ "$UNATTENDED" != "true" ]]; then
        input_field "Sentry DSN (blank to skip)" SENTRY_DSN
        input_field "Resend API Key (blank to skip)" RESEND_API_KEY
    fi

    if [[ -n "$SENTRY_DSN" ]]; then
        success "Sentry: Configured"
    else
        echo -e "  ${DIM}Sentry: Skipped${NC}"
    fi

    if [[ -n "$RESEND_API_KEY" ]]; then
        success "Resend: Configured"
    else
        echo -e "  ${DIM}Resend: Skipped${NC}"
    fi

    # ========================================================================
    # Summary and Confirmation
    # ========================================================================
    echo ""
    echo -e "${CYAN}╭$( printf '─%.0s' {1..60} )╮${NC}"
    echo -e "${CYAN}│${NC} ${BOLD}Installation Summary${NC}"
    echo -e "${CYAN}╰$( printf '─%.0s' {1..60} )╯${NC}"
    echo ""
    echo -e "  ${BOLD}Environment:${NC}  $ENVIRONMENT"
    echo -e "  ${BOLD}Branch:${NC}       $GITHUB_BRANCH"
    echo -e "  ${BOLD}Domain:${NC}       $PANEL_DOMAIN"
    echo -e "  ${BOLD}VirtFusion:${NC}   $VIRTFUSION_PANEL_URL"
    echo -e "  ${BOLD}Database:${NC}     $DB_NAME (user: $DB_USER)"
    echo -e "  ${BOLD}Stripe:${NC}       $STRIPE_MODE keys"
    echo -e "  ${BOLD}SSL:${NC}          $SETUP_SSL"
    echo ""

    if [[ "$UNATTENDED" != "true" ]]; then
        if ! confirm "Continue with installation? (Y/n):"; then
            echo "  Installation cancelled."
            exit 0
        fi
    fi

    # ========================================================================
    # Installation Phase
    # ========================================================================
    echo ""
    echo -e "${CYAN}${BOLD}╔$( printf '═%.0s' {1..60} )╗${NC}"
    echo -e "${CYAN}${BOLD}║${NC}                    ${BOLD}Installing...${NC}                         ${CYAN}${BOLD}║${NC}"
    echo -e "${CYAN}${BOLD}╚$( printf '═%.0s' {1..60} )╝${NC}"
    echo ""

    # Install Node.js
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
        success "Node.js $(node --version) (already installed)"
    else
        (
            case "$OS" in
                ubuntu|debian)
                    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x -o /tmp/node_setup.sh
                    bash /tmp/node_setup.sh
                    rm -f /tmp/node_setup.sh
                    apt-get install -y nodejs
                    ;;
                centos|rhel|rocky|almalinux)
                    curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x -o /tmp/node_setup.sh
                    bash /tmp/node_setup.sh
                    rm -f /tmp/node_setup.sh
                    yum install -y nodejs
                    ;;
            esac
        ) >>"$LOG_FILE" 2>&1 &
        spinner $! "Installing Node.js ${NODE_VERSION}"
    fi

    # Install PM2
    if [[ "$FORCE_REINSTALL" == "true" ]] && command -v pm2 &>/dev/null; then
        (npm uninstall -g pm2) >>"$LOG_FILE" 2>&1 &
        spinner $! "Uninstalling existing PM2"
    fi

    if command -v pm2 &>/dev/null && [[ "$FORCE_REINSTALL" != "true" ]]; then
        success "PM2 v$(pm2 --version) (already installed)"
    else
        (npm install -g pm2) >>"$LOG_FILE" 2>&1 &
        spinner $! "Installing PM2"
    fi

    # Install system dependencies
    (
        case "$OS" in
            ubuntu|debian)
                apt-get update
                apt-get install -y nginx certbot python3-certbot-nginx postgresql postgresql-contrib unzip rsync curl
                ;;
            centos|rhel|rocky|almalinux)
                yum install -y epel-release
                yum install -y nginx certbot python3-certbot-nginx postgresql-server postgresql-contrib unzip rsync curl
                postgresql-setup --initdb 2>/dev/null || true
                ;;
        esac
        systemctl start nginx 2>/dev/null || true
        systemctl enable nginx 2>/dev/null || true
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Installing system dependencies"

    # Configure PostgreSQL
    if [[ "$DB_HOST" == "localhost" ]]; then
        (
            set -e

            if ! systemctl is-active postgresql &>/dev/null; then
                systemctl start postgresql 2>/dev/null || true
            fi
            systemctl enable postgresql 2>/dev/null || true

            # Wait for PostgreSQL
            for i in {1..30}; do
                sudo -u postgres psql -c "SELECT 1" &>/dev/null && break
                sleep 1
            done

            # Create user and database
            sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null || \
                sudo -u postgres psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASS';"
            sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || true
            sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

            # Configure pg_hba.conf for md5 auth
            PG_HBA=$(sudo -u postgres psql -t -c "SHOW hba_file;" 2>/dev/null | tr -d ' ')
            if [[ -n "$PG_HBA" && -f "$PG_HBA" ]]; then
                if ! grep -q "host.*$DB_NAME.*$DB_USER" "$PG_HBA"; then
                    echo "host    $DB_NAME    $DB_USER    127.0.0.1/32    md5" >> "$PG_HBA"
                    echo "host    $DB_NAME    $DB_USER    ::1/128         md5" >> "$PG_HBA"
                    systemctl reload postgresql 2>/dev/null || true
                fi
            fi
        ) >>"$LOG_FILE" 2>&1 &
        spinner $! "Configuring PostgreSQL"
    fi

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

        SAFE_BRANCH=$(echo "${GITHUB_BRANCH}" | tr '/' '-')
        TEMP_ZIP="/tmp/ozvps-${SAFE_BRANCH}.zip"
        TEMP_EXTRACT="/tmp/ozvps-${SAFE_BRANCH}-extract"

        curl -fsSL "https://github.com/${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.zip" -o "$TEMP_ZIP"

        rm -rf "$TEMP_EXTRACT"
        mkdir -p "$TEMP_EXTRACT"
        unzip -q "$TEMP_ZIP" -d "$TEMP_EXTRACT"

        EXTRACTED_DIR=$(find "$TEMP_EXTRACT" -mindepth 1 -maxdepth 1 -type d -name "ozvps-*" | head -1)
        [[ -z "$EXTRACTED_DIR" ]] && exit 1

        cp -r "${EXTRACTED_DIR}"/* "$INSTALL_DIR/"
        cp -r "${EXTRACTED_DIR}"/.[^.]* "$INSTALL_DIR/" 2>/dev/null || true

        rm -rf "$TEMP_EXTRACT" "$TEMP_ZIP"
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Downloading from GitHub ($GITHUB_BRANCH)"

    # Verify download
    if [ ! -f "$INSTALL_DIR/package.json" ]; then
        error_exit "Download failed - package.json not found"
    fi

    # Create .env configuration
    (
        DATABASE_URL="postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME"

        cat > "$INSTALL_DIR/.env" << EOF
# OzVPS Configuration
# Generated by installer v${VERSION}
# Environment: ${ENVIRONMENT}

# Database
DATABASE_URL=${DATABASE_URL}

# VirtFusion API
VIRTFUSION_PANEL_URL=${VIRTFUSION_PANEL_URL}
VIRTFUSION_API_TOKEN=${VIRTFUSION_API_TOKEN}

# Stripe (${STRIPE_MODE} KEYS)
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
STRIPE_PUBLISHABLE_KEY=${STRIPE_PUBLISHABLE_KEY}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET:-}

# Auth0
AUTH0_DOMAIN=${AUTH0_DOMAIN}
AUTH0_CLIENT_ID=${AUTH0_CLIENT_ID}
AUTH0_CLIENT_SECRET=${AUTH0_CLIENT_SECRET}
AUTH0_WEBHOOK_SECRET=${AUTH0_WEBHOOK_SECRET}

# Application
NODE_ENV=${NODE_ENV}
PORT=3000
EOF

        # Add optional services
        if [[ -n "$SENTRY_DSN" ]]; then
            echo "" >> "$INSTALL_DIR/.env"
            echo "# Error Tracking" >> "$INSTALL_DIR/.env"
            echo "SENTRY_DSN=${SENTRY_DSN}" >> "$INSTALL_DIR/.env"
        fi

        if [[ -n "$RESEND_API_KEY" ]]; then
            echo "" >> "$INSTALL_DIR/.env"
            echo "# Email Service" >> "$INSTALL_DIR/.env"
            echo "RESEND_API_KEY=${RESEND_API_KEY}" >> "$INSTALL_DIR/.env"
        fi

        chmod 600 "$INSTALL_DIR/.env"
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Writing configuration"

    # Save environment marker
    echo "$ENVIRONMENT" > "$INSTALL_DIR/.ozvps-env"
    echo "$GITHUB_BRANCH" > "$INSTALL_DIR/.ozvps-branch"

    # Install npm dependencies
    echo ""
    info "Installing npm packages..."
    (
        cd "$INSTALL_DIR"
        npm install
    )
    success "npm packages installed"

    # Build application
    echo ""
    info "Building application..."
    (
        cd "$INSTALL_DIR"
        npm run build
    )
    success "Application built"

    # Run database migrations
    echo ""
    info "Running database migrations..."
    (
        cd "$INSTALL_DIR"
        set -a && source .env && set +a
        npx drizzle-kit push --force
    )
    success "Database migrations applied"

    # Prune dev dependencies
    (
        cd "$INSTALL_DIR"
        npm prune --production 2>/dev/null || true
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Cleaning up dev dependencies"

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
      NODE_ENV: envVars.NODE_ENV || 'production',
      PORT: envVars.PORT || '3000',
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

    # Setup NGINX
    (
        set -e

        NGINX_CONF_NAME="ozvps-${ENVIRONMENT}"
        ERROR_PAGES_DIR="/var/www/ozvps-errors"
        mkdir -p "$ERROR_PAGES_DIR"

        # Copy error pages if they exist
        if [[ -d "$INSTALL_DIR/deploy/nginx-error-pages" ]]; then
            cp "$INSTALL_DIR/deploy/nginx-error-pages"/*.html "$ERROR_PAGES_DIR/" 2>/dev/null || true
            chmod 644 "$ERROR_PAGES_DIR"/*.html 2>/dev/null || true
        fi

        cat > "/etc/nginx/sites-available/$NGINX_CONF_NAME" << EOF
server {
    listen 80;
    server_name $PANEL_DOMAIN;

    error_page 404 /404.html;
    error_page 500 /500.html;
    error_page 502 /502.html;
    error_page 503 /503.html;

    location ~ ^/(404|500|502|503)\.html\$ {
        root $ERROR_PAGES_DIR;
        internal;
    }

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
        ln -sf "/etc/nginx/sites-available/$NGINX_CONF_NAME" /etc/nginx/sites-enabled/

        # Include sites-enabled for RHEL-based systems
        if [[ "$OS" == "centos" || "$OS" == "rhel" || "$OS" == "rocky" || "$OS" == "almalinux" ]]; then
            grep -q "sites-enabled" /etc/nginx/nginx.conf || \
                sed -i '/http {/a \    include /etc/nginx/sites-enabled/*;' /etc/nginx/nginx.conf
        fi

        nginx -t
        systemctl reload nginx
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Configuring NGINX"

    # Setup SSL
    if [[ "$SETUP_SSL" == "yes" ]]; then
        (
            set -e
            if command -v certbot &>/dev/null && [[ -n "$SSL_EMAIL" ]]; then
                certbot --nginx -d "$PANEL_DOMAIN" --non-interactive --agree-tos --email "$SSL_EMAIL" --redirect 2>&1
            fi
        ) >>"$LOG_FILE" 2>&1 &
        spinner $! "Setting up SSL"
    fi

    # Start application
    (
        cd "$INSTALL_DIR"
        pm2 delete "$SERVICE_NAME" 2>/dev/null || true
        pm2 start ecosystem.config.cjs
        pm2 save --force
        pm2 startup systemd -u root --hp /root 2>/dev/null || true
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Starting application"

    # Install ozvps control command
    (
        set -e
        curl -fsSL -H 'Cache-Control: no-cache' \
            "https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/scripts/ozvps?t=$(date +%s)" \
            -o /usr/local/bin/ozvps
        chmod +x /usr/local/bin/ozvps
    ) >>"$LOG_FILE" 2>&1 &
    spinner $! "Installing ozvps control command"

    # Wait for application health
    echo ""
    info "Waiting for application to start..."
    sleep 3

    for i in {1..30}; do
        if curl -s http://127.0.0.1:3000/api/health &>/dev/null; then
            success "Application is running"
            break
        fi
        sleep 1
    done

    # ========================================================================
    # Installation Complete
    # ========================================================================
    echo ""
    echo -e "${GREEN}${BOLD}"
    cat << "EOF"
    ╔═══════════════════════════════════════════════════════════╗
    ║               Installation Complete!                      ║
    ╚═══════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"

    echo -e "  ${BOLD}Environment:${NC}  $ENVIRONMENT"
    if [[ "$SETUP_SSL" == "yes" ]]; then
        echo -e "  ${BOLD}Panel URL:${NC}    https://$PANEL_DOMAIN"
    else
        echo -e "  ${BOLD}Panel URL:${NC}    http://$PANEL_DOMAIN"
    fi
    echo ""
    echo -e "  ${BOLD}Control Panel:${NC}"
    echo -e "    ${CYAN}ozvps${NC}           - Open control panel menu"
    echo -e "    ${CYAN}ozvps --update${NC}  - Direct update to latest version"
    echo -e "    ${CYAN}ozvps --help${NC}    - Show all options"
    echo ""
    echo -e "  ${BOLD}Quick Commands:${NC}"
    echo -e "    ${CYAN}pm2 status${NC}              - Check service status"
    echo -e "    ${CYAN}pm2 logs $SERVICE_NAME${NC}  - View application logs"
    echo ""
    echo -e "  ${YELLOW}Database Password:${NC} $DB_PASS"
    echo -e "  ${DIM}(save this password securely)${NC}"
    echo ""
}

main "$@"
