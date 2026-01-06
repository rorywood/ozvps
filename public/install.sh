#!/usr/bin/env bash
# OzVPS Panel Installation Script
# Usage: curl -fsSL https://your-app.replit.app/install.sh | sudo bash
# Or: sudo bash <(curl -fsSL https://your-app.replit.app/install.sh)

set -e
set -u
set -o pipefail

# Configuration
REPO_URL="https://github.com/yourusername/ozvps-panel.git"
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
                read -p "Continue anyway? (y/N): " -n 1 -r
                echo
                if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                    exit 1
                fi
                ;;
        esac
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

    # Clone or update repository
    setup_application() {
        log_step "Setting up OzVPS Panel..."

        if [[ -d "$INSTALL_DIR" ]]; then
            log_info "Existing installation found. Updating..."
            cd "$INSTALL_DIR"
            git pull origin main || git pull origin master || true
        else
            log_info "Cloning repository..."
            mkdir -p "$INSTALL_DIR"
            
            # Check if we have a git repo URL or should prompt
            if [[ "$REPO_URL" == *"yourusername"* ]]; then
                log_warn "No repository URL configured."
                read -p "Enter your OzVPS Panel git repository URL: " REPO_URL
            fi
            
            git clone "$REPO_URL" "$INSTALL_DIR"
            cd "$INSTALL_DIR"
        fi

        log_info "Installing npm dependencies..."
        npm install

        log_info "Application setup complete"
    }

    # Configure environment
    configure_environment() {
        log_step "Configuring environment..."

        ENV_FILE="$INSTALL_DIR/.env"

        if [[ -f "$ENV_FILE" ]]; then
            log_info "Environment file already exists. Skipping configuration."
            log_info "Edit $ENV_FILE to update your settings."
            return 0
        fi

        echo ""
        echo -e "${CYAN}Please provide the following configuration values:${NC}"
        echo ""

        # Auth0 Configuration
        echo -e "${BLUE}Auth0 Configuration${NC}"
        read -p "Auth0 Domain (e.g., your-tenant.auth0.com): " AUTH0_DOMAIN
        read -p "Auth0 Client ID: " AUTH0_CLIENT_ID
        read -sp "Auth0 Client Secret: " AUTH0_CLIENT_SECRET
        echo ""

        # VirtFusion Configuration
        echo -e "${BLUE}VirtFusion Configuration${NC}"
        read -p "VirtFusion Panel URL (e.g., https://panel.example.com): " VIRTFUSION_PANEL_URL
        read -sp "VirtFusion API Token: " VIRTFUSION_API_TOKEN
        echo ""

        # Domain Configuration
        echo -e "${BLUE}Domain Configuration${NC}"
        read -p "Your panel domain (e.g., panel.yourdomain.com): " PANEL_DOMAIN

        # Create .env file
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
        log_info "Environment configured successfully"

        # Save domain for nginx config
        echo "$PANEL_DOMAIN" > "$INSTALL_DIR/.panel_domain"
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

        PANEL_DOMAIN=$(cat "$INSTALL_DIR/.panel_domain" 2>/dev/null || echo "")

        if [[ -z "$PANEL_DOMAIN" ]]; then
            read -p "Enter your panel domain (e.g., panel.yourdomain.com): " PANEL_DOMAIN
        fi

        NGINX_CONF="/etc/nginx/sites-available/$SERVICE_NAME"

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

        # Test and reload nginx
        nginx -t
        systemctl reload nginx
        systemctl enable nginx

        log_info "Nginx configured successfully"

        # SSL Certificate
        echo ""
        read -p "Would you like to set up SSL with Let's Encrypt? (Y/n): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            log_step "Setting up SSL certificate..."
            certbot --nginx -d "$PANEL_DOMAIN" --non-interactive --agree-tos --email admin@$PANEL_DOMAIN || {
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

        # Start application
        pm2 start npm --name "$SERVICE_NAME" -- start

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
    install_nodejs
    install_dependencies
    setup_application
    configure_environment
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
    
    PANEL_DOMAIN=$(cat "$INSTALL_DIR/.panel_domain" 2>/dev/null || echo "your-domain.com")
    
    echo -e "${CYAN}Access your panel at:${NC} https://$PANEL_DOMAIN"
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
    echo -e "${YELLOW}To update the panel:${NC}"
    echo "  cd $INSTALL_DIR && git pull && npm install && npm run build && pm2 restart $SERVICE_NAME"
    echo ""
}

# Execute main function
main "$@"
