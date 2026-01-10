#!/bin/bash
set -e

# OzVPS Panel - Multi-Environment Nginx & SSL Setup Script
# Run this on your server to set up nginx reverse proxy with SSL for multiple environments
# Supports both production (app.ozvps.com.au) and dev (dev.ozvps.com.au)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║      OzVPS Panel - Multi-Environment Nginx & SSL Setup    ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Please run this script as root (sudo ./setup-nginx-multi.sh)${NC}"
    exit 1
fi

# Function to prompt for required input
prompt_required() {
    local prompt="$1"
    local var_name="$2"
    local value=""

    while [ -z "$value" ]; do
        read -p "$prompt: " value
        if [ -z "$value" ]; then
            echo -e "${RED}This field is required. Please enter a value.${NC}"
        fi
    done

    eval "$var_name=\"$value\""
}

# Function to prompt for optional input
prompt_optional() {
    local prompt="$1"
    local var_name="$2"
    local default="$3"
    local value=""

    read -p "$prompt [$default]: " value
    if [ -z "$value" ]; then
        value="$default"
    fi

    eval "$var_name=\"$value\""
}

# Function to prompt yes/no
prompt_yes_no() {
    local prompt="$1"
    local response=""

    while true; do
        read -p "$prompt (y/n): " response
        case "$response" in
            [Yy]* ) return 0;;
            [Nn]* ) return 1;;
            * ) echo -e "${RED}Please answer y or n.${NC}";;
        esac
    done
}

echo -e "${YELLOW}=== Configuration ===${NC}"
echo ""

# Ask which environment to set up
echo -e "${CYAN}Which environment do you want to set up?${NC}"
echo "  1) Production (app.ozvps.com.au)"
echo "  2) Development (dev.ozvps.com.au)"
echo "  3) Both"
echo ""

read -p "Enter your choice (1-3): " ENV_CHOICE

case "$ENV_CHOICE" in
    1)
        SETUP_PROD=true
        SETUP_DEV=false
        ;;
    2)
        SETUP_PROD=false
        SETUP_DEV=true
        ;;
    3)
        SETUP_PROD=true
        SETUP_DEV=true
        ;;
    *)
        echo -e "${RED}Invalid choice. Exiting.${NC}"
        exit 1
        ;;
esac

echo ""

# Get configuration for production
if [ "$SETUP_PROD" = true ]; then
    echo -e "${CYAN}=== Production Configuration ===${NC}"
    prompt_required "Production domain name" PROD_DOMAIN
    prompt_optional "Production backend port" PROD_PORT "5000"
    echo ""
fi

# Get configuration for dev
if [ "$SETUP_DEV" = true ]; then
    echo -e "${CYAN}=== Development Configuration ===${NC}"
    prompt_required "Development domain name" DEV_DOMAIN
    prompt_optional "Development backend port" DEV_PORT "5001"
    echo ""
fi

# SSL email (shared)
if [ "$SETUP_PROD" = true ]; then
    DEFAULT_EMAIL="admin@${PROD_DOMAIN}"
elif [ "$SETUP_DEV" = true ]; then
    DEFAULT_EMAIL="admin@${DEV_DOMAIN}"
fi
prompt_optional "Email for SSL certificate notifications" SSL_EMAIL "$DEFAULT_EMAIL"

echo ""
echo -e "${YELLOW}=== Step 1: Installing Nginx ===${NC}"
echo ""

# Update package list
apt-get update

# Install nginx
if command -v nginx &> /dev/null; then
    echo -e "${GREEN}Nginx is already installed.${NC}"
else
    echo "Installing Nginx..."
    apt-get install -y nginx
    systemctl start nginx
    systemctl enable nginx
    echo -e "${GREEN}Nginx installed successfully.${NC}"
fi

echo ""
echo -e "${YELLOW}=== Step 2: Installing Certbot ===${NC}"
echo ""

# Install certbot
if command -v certbot &> /dev/null; then
    echo -e "${GREEN}Certbot is already installed.${NC}"
else
    echo "Installing Certbot..."
    apt-get install -y certbot python3-certbot-nginx
    echo -e "${GREEN}Certbot installed successfully.${NC}"
fi

echo ""
echo -e "${YELLOW}=== Step 3: Configuring Nginx ===${NC}"
echo ""

# Function to create nginx config
create_nginx_config() {
    local domain=$1
    local port=$2
    local config_name=$3

    echo "Creating Nginx configuration for ${domain}..."
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
    echo -e "${GREEN}Nginx configured for ${domain}.${NC}"
}

# Create configs
if [ "$SETUP_PROD" = true ]; then
    create_nginx_config "$PROD_DOMAIN" "$PROD_PORT" "ozvps-prod"
fi

if [ "$SETUP_DEV" = true ]; then
    create_nginx_config "$DEV_DOMAIN" "$DEV_PORT" "ozvps-dev"
fi

# Remove default site
rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
echo "Testing Nginx configuration..."
nginx -t

# Reload nginx
systemctl reload nginx
echo -e "${GREEN}Nginx configured successfully.${NC}"

echo ""
echo -e "${YELLOW}=== Step 4: Obtaining SSL Certificates ===${NC}"
echo ""

# Function to get SSL cert
get_ssl_cert() {
    local domain=$1
    echo -e "${BLUE}Obtaining SSL certificate for ${domain}...${NC}"
    echo ""
    certbot --nginx -d "$domain" --non-interactive --agree-tos -m "$SSL_EMAIL" --redirect
    echo -e "${GREEN}SSL certificate obtained for ${domain}.${NC}"
    echo ""
}

# Get SSL certs
if [ "$SETUP_PROD" = true ]; then
    get_ssl_cert "$PROD_DOMAIN"
fi

if [ "$SETUP_DEV" = true ]; then
    get_ssl_cert "$DEV_DOMAIN"
fi

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Nginx & SSL Setup Complete!                     ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$SETUP_PROD" = true ]; then
    echo -e "Production site: ${BLUE}https://${PROD_DOMAIN}${NC} → Port ${PROD_PORT}"
fi

if [ "$SETUP_DEV" = true ]; then
    echo -e "Development site: ${BLUE}https://${DEV_DOMAIN}${NC} → Port ${DEV_PORT}"
fi

echo ""
echo "SSL certificates will auto-renew via certbot timer."
echo ""
echo "Useful commands:"
echo "  systemctl status nginx      - Check nginx status"
echo "  nginx -t                    - Test nginx config"
echo "  systemctl reload nginx      - Reload nginx config"
echo "  certbot renew --dry-run     - Test SSL renewal"
echo ""

if [ "$SETUP_DEV" = true ]; then
    echo -e "${CYAN}Development Environment Notes:${NC}"
    echo "  - Dev site runs on port ${DEV_PORT}"
    echo "  - Use 'update-ozvps dev' to update the dev environment"
    echo "  - Dev and production environments are completely isolated"
    echo ""
fi
