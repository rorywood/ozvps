#!/bin/bash
set -e

# OzVPS Panel - Nginx & SSL Setup Script
# Run this on your server to set up nginx reverse proxy with SSL

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           OzVPS Panel - Nginx & SSL Setup                 ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Please run this script as root (sudo ./setup-nginx.sh)${NC}"
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

echo -e "${YELLOW}=== Configuration ===${NC}"
echo ""

prompt_required "Domain name for the panel (e.g., app.ozvps.com.au)" APP_DOMAIN
prompt_optional "Email for SSL certificate notifications" SSL_EMAIL "admin@${APP_DOMAIN}"
prompt_optional "Backend port (Docker app port)" BACKEND_PORT "5000"

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

# Create nginx configuration
echo "Creating Nginx configuration..."
cat > /etc/nginx/sites-available/ozvps << NGINX_CONFIG
server {
    listen 80;
    server_name ${APP_DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
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
ln -sf /etc/nginx/sites-available/ozvps /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
echo "Testing Nginx configuration..."
nginx -t

# Reload nginx
systemctl reload nginx
echo -e "${GREEN}Nginx configured successfully.${NC}"

echo ""
echo -e "${YELLOW}=== Step 4: Obtaining SSL Certificate ===${NC}"
echo ""

echo -e "${BLUE}Obtaining SSL certificate for ${APP_DOMAIN}...${NC}"
echo ""

# Run certbot
certbot --nginx -d "$APP_DOMAIN" --non-interactive --agree-tos -m "$SSL_EMAIL" --redirect

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Nginx & SSL Setup Complete!                     ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Your site is now accessible at: ${BLUE}https://${APP_DOMAIN}${NC}"
echo ""
echo "SSL certificate will auto-renew via certbot timer."
echo ""
echo "Useful commands:"
echo "  systemctl status nginx      - Check nginx status"
echo "  nginx -t                    - Test nginx config"
echo "  systemctl reload nginx      - Reload nginx config"
echo "  certbot renew --dry-run     - Test SSL renewal"
echo ""
