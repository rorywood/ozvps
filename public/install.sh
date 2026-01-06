#!/usr/bin/env bash
# OzVPS Panel Installation Script
# Usage: curl -fsSL https://your-app.replit.app/install.sh | sudo bash
# Or: sudo bash <(curl -fsSL https://your-app.replit.app/install.sh)

set -e
set -u
set -o pipefail

# Pre-configured values (injected by server)
DOWNLOAD_URL="${OZVPS_DOWNLOAD_URL:-}"
PRECONFIGURED_VIRTFUSION_URL=""

# Configuration
INSTALL_DIR="/opt/ozvps-panel"
SERVICE_NAME="ozvps-panel"
NODE_VERSION="20"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Guard against incomplete download
main() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                                                              ║"
    echo "║              OzVPS Panel Installation Script                 ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""

    log_info() {
        echo -e "${GREEN}[INFO]${NC} $1"
    }

    log_warn() {
        echo -e "${YELLOW}[WARN]${NC} $1"
    }

    log_error() {
        echo -e "${RED}[ERROR]${NC} $1" >&2
    }

    log_step() {
        echo -e "${BLUE}[STEP]${NC} $1"
    }

    # Interactive read function that works when piped from curl
    interactive_read() {
        local prompt="$1"
        local var_name="$2"
        local is_secret="${3:-no}"
        
        if [[ "$is_secret" == "yes" ]]; then
            read -sp "$prompt" "$var_name" < /dev/tty
            echo ""
        else
            read -p "$prompt" "$var_name" < /dev/tty
        fi
    }

    # Interactive confirm that works when piped from curl
    interactive_confirm() {
        local prompt="$1"
        local response
        read -p "$prompt" -n 1 -r response < /dev/tty
        echo ""
        [[ "$response" =~ ^[Yy]$ ]]
    }

    # Check if running as root
    check_root() {
        if [[ $EUID -ne 0 ]]; then
            log_error "This script must be run as root or with sudo"
            log_info "Run: sudo bash install.sh"
            exit 1
        fi
    }

    # Detect OS
    detect_os() {
        if [[ -f /etc/os-release ]]; then
            . /etc/os-release
            OS=$ID
            VERSION=$VERSION_ID
        else
            log_error "Cannot detect operating system"
            exit 1
        fi

        case "$OS" in
            ubuntu|debian)
                log_info "Detected OS: $PRETTY_NAME"
                ;;
            centos|rhel|rocky|almalinux)
                log_info "Detected OS: $PRETTY_NAME"
                ;;
            *)
                log_warn "Unsupported OS: $OS. Installation may not work correctly."
                if interactive_confirm "Continue anyway? (y/N): "; then
                    :
                else
                    exit 1
                fi
                ;;
        esac
    }

    # Disable firewall
    disable_firewall() {
        log_step "Configuring firewall..."
        
        # Disable UFW (Ubuntu/Debian)
        if command -v ufw &> /dev/null; then
            ufw disable 2>/dev/null || true
            log_info "UFW firewall disabled"
        fi
        
        # Disable firewalld (CentOS/RHEL)
        if command -v firewall-cmd &> /dev/null; then
            systemctl stop firewalld 2>/dev/null || true
            systemctl disable firewalld 2>/dev/null || true
            log_info "firewalld disabled"
        fi
        
        # Disable iptables if running as service
        if systemctl is-active --quiet iptables 2>/dev/null; then
            systemctl stop iptables 2>/dev/null || true
            systemctl disable iptables 2>/dev/null || true
            log_info "iptables service disabled"
        fi
        
        log_info "Firewall configured"
    }

    # Collect all configuration upfront
    collect_configuration() {
        log_step "Collecting configuration..."
        
        echo ""
        echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${CYAN}║           Please provide the following information           ║${NC}"
        echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
        echo ""

        # Panel Domain Configuration (for Nginx)
        echo -e "${BLUE}━━━ 1. Panel Domain (for Nginx) ━━━${NC}"
        echo ""
        echo "This is the domain where YOUR OzVPS Panel will be accessible."
        echo "Example: panel.yourdomain.com or vps.yourdomain.com"
        echo ""
        interactive_read "Enter your panel domain: " PANEL_DOMAIN
        
        if [[ -z "$PANEL_DOMAIN" ]]; then
            log_error "Panel domain is required"
            exit 1
        fi
        echo ""

        # Auth0 Configuration
        echo -e "${BLUE}━━━ 2. Auth0 Configuration ━━━${NC}"
        echo ""
        echo "Auth0 is used for user login/registration."
        echo "Get these from: https://manage.auth0.com/ > Applications > Your App"
        echo ""
        interactive_read "Auth0 Domain (e.g., your-tenant.auth0.com): " AUTH0_DOMAIN
        interactive_read "Auth0 Client ID: " AUTH0_CLIENT_ID
        interactive_read "Auth0 Client Secret: " AUTH0_CLIENT_SECRET yes
        echo ""

        # VirtFusion Configuration
        echo -e "${BLUE}━━━ 3. VirtFusion Configuration ━━━${NC}"
        echo ""
        
        # Use pre-configured VirtFusion URL if available
        if [[ -n "$PRECONFIGURED_VIRTFUSION_URL" ]]; then
            echo -e "VirtFusion Panel URL: ${GREEN}$PRECONFIGURED_VIRTFUSION_URL${NC} (pre-configured)"
            VIRTFUSION_PANEL_URL="$PRECONFIGURED_VIRTFUSION_URL"
        else
            interactive_read "VirtFusion Panel URL (e.g., https://panel.example.com): " VIRTFUSION_PANEL_URL
        fi
        
        echo ""
        echo "Get your API token from: VirtFusion Admin Panel > Settings > API"
        interactive_read "VirtFusion API Token: " VIRTFUSION_API_TOKEN yes
        echo ""

        # SSL Email
        echo -e "${BLUE}━━━ 4. SSL Certificate ━━━${NC}"
        echo ""
        if interactive_confirm "Set up SSL with Let's Encrypt? (Y/n): "; then
            SETUP_SSL="yes"
            interactive_read "Email for SSL certificate notifications: " SSL_EMAIL
        else
            SETUP_SSL="no"
            SSL_EMAIL=""
        fi
        echo ""

        log_info "Configuration collected successfully"
        echo ""
        echo -e "${CYAN}━━━ Configuration Summary ━━━${NC}"
        echo "  Panel Domain: $PANEL_DOMAIN"
        echo "  Auth0 Domain: $AUTH0_DOMAIN"
        echo "  VirtFusion URL: $VIRTFUSION_PANEL_URL"
        echo "  SSL Setup: $SETUP_SSL"
        echo ""
        
        if ! interactive_confirm "Proceed with installation? (Y/n): "; then
            log_info "Installation cancelled"
            exit 0
        fi
        echo ""
    }

    # Install Node.js
    install_nodejs() {
        log_step "Installing Node.js ${NODE_VERSION}.x..."

        if command -v node &> /dev/null; then
            CURRENT_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
            if [[ "$CURRENT_VERSION" -ge "$NODE_VERSION" ]]; then
                log_info "Node.js v$(node --version | cut -d'v' -f2) already installed"
                return 0
            fi
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
            *)
                log_error "Cannot install Node.js on this OS automatically"
                log_info "Please install Node.js ${NODE_VERSION}.x manually and re-run this script"
                exit 1
                ;;
        esac

        log_info "Node.js $(node --version) installed successfully"
    }

    # Install dependencies
    install_dependencies() {
        log_step "Installing system dependencies..."

        case "$OS" in
            ubuntu|debian)
                apt-get update
                apt-get install -y git curl nginx certbot python3-certbot-nginx
                ;;
            centos|rhel|rocky|almalinux)
                yum install -y git curl nginx certbot python3-certbot-nginx epel-release
                ;;
        esac

        # Install PM2 globally
        npm install -g pm2
        log_info "Dependencies installed successfully"
    }

    # Download and extract application
    setup_application() {
        log_step "Setting up OzVPS Panel..."

        # Use pre-configured download URL if available
        if [[ -z "$DOWNLOAD_URL" ]]; then
            log_error "No download URL configured. This script should be downloaded from your Replit app."
            log_info "Please run: curl -fsSL https://your-replit-app.replit.app/install.sh | sudo bash"
            exit 1
        fi

        # Create install directory
        mkdir -p "$INSTALL_DIR"
        cd "$INSTALL_DIR"

        # Check for existing installation
        if [[ -f "$INSTALL_DIR/package.json" ]]; then
            log_info "Existing installation found. Backing up..."
            BACKUP_DIR="${INSTALL_DIR}.backup.$(date +%Y%m%d%H%M%S)"
            mv "$INSTALL_DIR" "$BACKUP_DIR" 2>/dev/null || true
            mkdir -p "$INSTALL_DIR"
            cd "$INSTALL_DIR"
            log_info "Backup saved to: $BACKUP_DIR"
        fi

        log_info "Downloading OzVPS Panel..."
        
        # Download and extract
        if ! curl -fsSL "$DOWNLOAD_URL" -o /tmp/ozvps-panel.tar.gz; then
            log_error "Failed to download OzVPS Panel"
            log_info "Please check that your Replit app is running and try again"
            exit 1
        fi

        log_info "Extracting application..."
        tar -xzf /tmp/ozvps-panel.tar.gz -C "$INSTALL_DIR"
        rm -f /tmp/ozvps-panel.tar.gz

        log_info "Installing npm dependencies..."
        npm install

        log_info "Application setup complete"
    }

    # Write environment file
    write_environment() {
        log_step "Writing environment configuration..."

        ENV_FILE="$INSTALL_DIR/.env"

        # Create .env file with collected configuration
        cat > "$ENV_FILE" << EOF
# Auth0 Configuration
AUTH0_DOMAIN=$AUTH0_DOMAIN
AUTH0_CLIENT_ID=$AUTH0_CLIENT_ID
AUTH0_CLIENT_SECRET=$AUTH0_CLIENT_SECRET

# VirtFusion Configuration
VIRTFUSION_PANEL_URL=$VIRTFUSION_PANEL_URL
VIRTFUSION_API_TOKEN=$VIRTFUSION_API_TOKEN

# Application Settings
NODE_ENV=production
PORT=5000
EOF

        chmod 600 "$ENV_FILE"
        
        # Save domain for nginx config
        echo "$PANEL_DOMAIN" > "$INSTALL_DIR/.panel_domain"
        
        log_info "Environment configured successfully"
    }

    # Build application
    build_application() {
        log_step "Building application..."
        cd "$INSTALL_DIR"
        npm run build
        log_info "Application built successfully"
    }

    # Configure Nginx
    configure_nginx() {
        log_step "Configuring Nginx..."

        NGINX_CONF="/etc/nginx/sites-available/$SERVICE_NAME"

        # Create sites-available directory if it doesn't exist (CentOS/RHEL)
        mkdir -p /etc/nginx/sites-available
        mkdir -p /etc/nginx/sites-enabled

        cat > "$NGINX_CONF" << EOF
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

        # Enable site
        ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/
        rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

        # For CentOS/RHEL, include sites-enabled in nginx.conf if not already
        if [[ "$OS" == "centos" || "$OS" == "rhel" || "$OS" == "rocky" || "$OS" == "almalinux" ]]; then
            if ! grep -q "sites-enabled" /etc/nginx/nginx.conf; then
                sed -i '/http {/a \    include /etc/nginx/sites-enabled/*;' /etc/nginx/nginx.conf
            fi
        fi

        # Test and reload nginx
        nginx -t
        systemctl reload nginx
        systemctl enable nginx

        log_info "Nginx configured for: $PANEL_DOMAIN"

        # SSL Certificate
        if [[ "$SETUP_SSL" == "yes" && -n "$SSL_EMAIL" ]]; then
            log_step "Setting up SSL certificate..."
            certbot --nginx -d "$PANEL_DOMAIN" --non-interactive --agree-tos --email "$SSL_EMAIL" || {
                log_warn "Certbot failed. You can run it manually later:"
                log_info "  sudo certbot --nginx -d $PANEL_DOMAIN"
            }
        fi
    }

    # Start application with PM2
    start_application() {
        log_step "Starting application with PM2..."
        cd "$INSTALL_DIR"

        # Stop existing instance if running
        pm2 delete "$SERVICE_NAME" 2>/dev/null || true

        # Create PM2 ecosystem config that loads .env file
        cat > "$INSTALL_DIR/ecosystem.config.cjs" << 'EOFCONFIG'
const fs = require('fs');
const path = require('path');

// Load .env file manually
const envPath = path.join(__dirname, '.env');
const envVars = {};

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key) {
        envVars[key.trim()] = valueParts.join('=').trim();
      }
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
      ...envVars
    },
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000
  }]
};
EOFCONFIG

        # Start with ecosystem config
        pm2 start "$INSTALL_DIR/ecosystem.config.cjs"

        # Save PM2 configuration
        pm2 save

        # Setup startup script
        pm2 startup systemd -u root --hp /root || true

        log_info "Application started successfully"
    }

    # Cleanup on error
    cleanup() {
        if [[ $? -ne 0 ]]; then
            log_error "Installation failed!"
            log_info "Check the error messages above for details."
            log_info "You can re-run this script after fixing any issues."
        fi
    }

    trap cleanup EXIT

    # Main installation flow
    check_root
    detect_os
    collect_configuration      # Get all config FIRST
    disable_firewall           # Disable firewall early
    install_nodejs
    install_dependencies
    setup_application
    write_environment          # Write env after collecting config
    build_application
    configure_nginx
    start_application

    # Success message
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                              ║${NC}"
    echo -e "${GREEN}║          OzVPS Panel Installed Successfully!                 ║${NC}"
    echo -e "${GREEN}║                                                              ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    if [[ "$SETUP_SSL" == "yes" ]]; then
        echo -e "${CYAN}Access your panel at:${NC} https://$PANEL_DOMAIN"
    else
        echo -e "${CYAN}Access your panel at:${NC} http://$PANEL_DOMAIN"
    fi
    echo ""
    echo -e "${YELLOW}Useful Commands:${NC}"
    echo "  pm2 logs $SERVICE_NAME     - View application logs"
    echo "  pm2 restart $SERVICE_NAME  - Restart the application"
    echo "  pm2 status                 - Check PM2 status"
    echo ""
    echo -e "${YELLOW}Configuration:${NC}"
    echo "  Environment file: $INSTALL_DIR/.env"
    echo "  Nginx config: /etc/nginx/sites-available/$SERVICE_NAME"
    echo ""
    echo -e "${YELLOW}To update the panel later, run this script again.${NC}"
    echo ""
}

# Execute main function
main "$@"
