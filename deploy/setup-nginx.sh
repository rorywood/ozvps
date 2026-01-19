#!/bin/bash
set -e

# OzVPS Panel - Nginx & SSL Setup Script
# Run this on your server to set up nginx reverse proxy with SSL
# Now supports both main app and admin panel

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

prompt_required "Main app domain (e.g., app.ozvps.com.au)" APP_DOMAIN
prompt_optional "Admin panel domain" ADMIN_DOMAIN "admin.ozvps.com.au"
prompt_optional "Email for SSL certificate notifications" SSL_EMAIL "admin@${APP_DOMAIN}"
prompt_optional "Main app backend port" BACKEND_PORT "5000"
prompt_optional "Admin panel backend port" ADMIN_PORT "5001"

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
echo -e "${YELLOW}=== Step 3: Setting up Custom Error Pages ===${NC}"
echo ""

# Create error pages directory
ERROR_PAGES_DIR="/var/www/ozvps-errors"
echo "Creating error pages directory..."
mkdir -p "$ERROR_PAGES_DIR"

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ERROR_SRC_DIR="$SCRIPT_DIR/nginx-error-pages"

# Copy error pages if they exist in the script directory
if [ -d "$ERROR_SRC_DIR" ]; then
    echo "Copying custom error pages..."
    cp "$ERROR_SRC_DIR"/*.html "$ERROR_PAGES_DIR/" 2>/dev/null || true
    cp "$ERROR_SRC_DIR"/*.png "$ERROR_PAGES_DIR/" 2>/dev/null || true
    chmod 644 "$ERROR_PAGES_DIR"/* 2>/dev/null || true
    echo -e "${GREEN}Custom error pages installed.${NC}"
else
    echo -e "${YELLOW}Warning: Error pages directory not found. Skipping custom error pages.${NC}"
fi

echo ""
echo -e "${YELLOW}=== Step 4: Configuring Nginx for Main App ===${NC}"
echo ""

# Create nginx configuration for main app
echo "Creating Nginx configuration for main app..."
cat > /etc/nginx/sites-available/ozvps << NGINX_CONFIG
server {
    listen 80;
    server_name ${APP_DOMAIN};

    # Custom error pages
    error_page 404 /404.html;
    error_page 500 /500.html;
    error_page 502 /502.html;
    error_page 503 /503.html;

    # Error page locations
    location ~ ^/(404|500|502|503)\.html\$ {
        root $ERROR_PAGES_DIR;
        internal;
    }

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

# Enable the main site
ln -sf /etc/nginx/sites-available/ozvps /etc/nginx/sites-enabled/

echo ""
echo -e "${YELLOW}=== Step 5: Configuring Nginx for Admin Panel ===${NC}"
echo ""

# Create nginx configuration for admin panel
echo "Creating Nginx configuration for admin panel..."
cat > /etc/nginx/sites-available/ozvps-admin << NGINX_CONFIG
server {
    listen 80;
    server_name ${ADMIN_DOMAIN};

    # Custom error pages
    error_page 404 /404.html;
    error_page 500 /500.html;
    error_page 502 /502.html;
    error_page 503 /503.html;

    # Error page locations
    location ~ ^/(404|500|502|503)\.html\$ {
        root $ERROR_PAGES_DIR;
        internal;
    }

    # WebSocket for log streaming
    location /ws/ {
        proxy_pass http://127.0.0.1:${ADMIN_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    location / {
        proxy_pass http://127.0.0.1:${ADMIN_PORT};
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

# Enable the admin site
ln -sf /etc/nginx/sites-available/ozvps-admin /etc/nginx/sites-enabled/

# Remove default site
rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
echo "Testing Nginx configuration..."
nginx -t

# Reload nginx
systemctl reload nginx
echo -e "${GREEN}Nginx configured successfully for both apps.${NC}"

echo ""
echo -e "${YELLOW}=== Step 6: Obtaining SSL Certificates ===${NC}"
echo ""

echo -e "${BLUE}Obtaining SSL certificates for ${APP_DOMAIN} and ${ADMIN_DOMAIN}...${NC}"
echo ""

# Run certbot for both domains
certbot --nginx -d "$APP_DOMAIN" -d "$ADMIN_DOMAIN" --non-interactive --agree-tos -m "$SSL_EMAIL" --redirect

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Nginx & SSL Setup Complete!                     ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Main panel:  ${BLUE}https://${APP_DOMAIN}${NC}"
echo -e "Admin panel: ${BLUE}https://${ADMIN_DOMAIN}${NC}"
echo ""
echo "SSL certificates will auto-renew via certbot timer."
echo ""
echo "Useful commands:"
echo "  systemctl status nginx      - Check nginx status"
echo "  nginx -t                    - Test nginx config"
echo "  systemctl reload nginx      - Reload nginx config"
echo "  certbot renew --dry-run     - Test SSL renewal"
echo ""
echo "PM2 commands:"
echo "  pm2 status                  - Check app status"
echo "  pm2 logs ozvps              - View main app logs"
echo "  pm2 logs ozvps-admin        - View admin app logs"
echo ""
