#!/bin/bash
set -e

# OzVPS Development Installer
# Installs from GitHub dev branch to dev.ozvps.com.au

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

INSTALL_DIR="/opt/ozvps-panel"
SERVICE_NAME="ozvps-panel"
APP_PORT="3000"
DOMAIN="dev.ozvps.com.au"
GITHUB_BRANCH="dev"
GITHUB_REPO="rorywood/ozvps"

echo -e "${CYAN}${BOLD}"
echo "╔════════════════════════════════════════╗"
echo "║   OzVPS Development Installer         ║"
echo "║   Branch: dev                         ║"
echo "║   Domain: dev.ozvps.com.au            ║"
echo "╚════════════════════════════════════════╝"
echo -e "${NC}"

# Check root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Must run as root${NC}"
    echo "Usage: curl -sSL https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/public/install-dev.sh | sudo bash"
    exit 1
fi

# Check if already installed
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}Warning: Installation already exists at $INSTALL_DIR${NC}"
    read -p "Remove existing installation and reinstall? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Installation cancelled."
        exit 0
    fi
    echo -e "${CYAN}Removing existing installation...${NC}"
    pm2 delete $SERVICE_NAME 2>/dev/null || true
    rm -rf "$INSTALL_DIR"
fi

echo ""
echo -e "${CYAN}Installing system dependencies...${NC}"

# Install Node.js 20.x if not present
if ! command -v node &>/dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
    apt-get install -y nodejs >/dev/null 2>&1
fi

# Install PM2 globally if not present
if ! command -v pm2 &>/dev/null; then
    echo "Installing PM2..."
    npm install -g pm2 >/dev/null 2>&1
fi

# Install NGINX if not present
if ! command -v nginx &>/dev/null; then
    echo "Installing NGINX..."
    apt-get update >/dev/null 2>&1
    apt-get install -y nginx >/dev/null 2>&1
    systemctl start nginx
    systemctl enable nginx
fi

# Install Certbot if not present
if ! command -v certbot &>/dev/null; then
    echo "Installing Certbot..."
    apt-get install -y certbot python3-certbot-nginx >/dev/null 2>&1
fi

# Install PostgreSQL client if not present
if ! command -v psql &>/dev/null; then
    echo "Installing PostgreSQL client..."
    apt-get install -y postgresql-client >/dev/null 2>&1
fi

echo -e "${GREEN}✓ System dependencies installed${NC}"
echo ""

# Download application from GitHub
echo -e "${CYAN}Downloading application from GitHub (${GITHUB_BRANCH} branch)...${NC}"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Download as zip and extract
TEMP_ZIP="/tmp/ozvps-${GITHUB_BRANCH}.zip"
curl -fsSL "https://github.com/${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.zip" -o "$TEMP_ZIP"

# Extract and move files to install directory
unzip -q "$TEMP_ZIP" -d /tmp/
rsync -a "/tmp/ozvps-${GITHUB_BRANCH}/" "$INSTALL_DIR/"
rm -rf "/tmp/ozvps-${GITHUB_BRANCH}" "$TEMP_ZIP"

echo -e "${GREEN}✓ Application downloaded${NC}"
echo ""

# Install Node.js dependencies
echo -e "${CYAN}Installing application dependencies...${NC}"
npm install --production >/dev/null 2>&1
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Create .env file template if it doesn't exist
if [ ! -f "$INSTALL_DIR/.env" ]; then
    echo -e "${CYAN}Creating .env configuration file...${NC}"
    cat > "$INSTALL_DIR/.env" << 'ENVEOF'
# Database Configuration
DATABASE_URL=postgresql://ozvps_dev:password@localhost:5432/ozvps_dev

# VirtFusion API (panel.ozvps.com.au)
VIRTFUSION_API_URL=https://panel.ozvps.com.au
VIRTFUSION_API_KEY=your_virtfusion_api_key_here

# Stripe Configuration (TEST KEYS FOR DEVELOPMENT)
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_test_your_webhook_secret_here

# Auth0 Configuration
AUTH0_SECRET=your_auth0_secret_here
AUTH0_BASE_URL=https://dev.ozvps.com.au
AUTH0_ISSUER_BASE_URL=https://your-tenant.auth0.com
AUTH0_CLIENT_ID=your_auth0_client_id_here
AUTH0_CLIENT_SECRET=your_auth0_client_secret_here

# Application Settings
NODE_ENV=development
PORT=3000
ENVEOF
    chmod 600 "$INSTALL_DIR/.env"
    echo -e "${GREEN}✓ Environment file created${NC}"
    echo -e "${YELLOW}⚠ IMPORTANT: Edit $INSTALL_DIR/.env with your API keys!${NC}"
    echo -e "${YELLOW}⚠ Use TEST Stripe keys for development!${NC}"
fi

# Create PM2 ecosystem file
echo -e "${CYAN}Configuring PM2...${NC}"
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
      NODE_ENV: 'development',
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

echo -e "${GREEN}✓ PM2 configured${NC}"
echo ""

# Configure NGINX
echo -e "${CYAN}Configuring NGINX for ${DOMAIN}...${NC}"
cat > /etc/nginx/sites-available/ozvps-dev << NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
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
NGINXEOF

# Enable site
ln -sf /etc/nginx/sites-available/ozvps-dev /etc/nginx/sites-enabled/

# Test and reload NGINX
if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx
    echo -e "${GREEN}✓ NGINX configured${NC}"
else
    echo -e "${RED}✗ NGINX configuration error${NC}"
    nginx -t
    exit 1
fi

# Obtain SSL certificate
echo ""
read -p "Enter email for SSL certificate notifications: " SSL_EMAIL
if [ -z "$SSL_EMAIL" ]; then
    SSL_EMAIL="admin@${DOMAIN}"
fi

echo -e "${CYAN}Obtaining SSL certificate...${NC}"
if certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${SSL_EMAIL}" --redirect >/dev/null 2>&1; then
    echo -e "${GREEN}✓ SSL certificate obtained${NC}"
else
    echo -e "${YELLOW}⚠ SSL setup failed. Run manually: certbot --nginx -d ${DOMAIN}${NC}"
fi

# Install update script
echo ""
echo -e "${CYAN}Installing update script...${NC}"
curl -fsSL "https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/public/update-dev.sh" \
    -o /usr/local/bin/update-ozvps-dev
chmod +x /usr/local/bin/update-ozvps-dev
echo -e "${GREEN}✓ Update script installed${NC}"

# Start application
echo ""
echo -e "${CYAN}Starting application...${NC}"
cd "$INSTALL_DIR"
pm2 start ecosystem.config.cjs
pm2 save --force
pm2 startup systemd -u root --hp /root >/dev/null 2>&1

# Wait for app to be ready
echo "Waiting for application to start..."
sleep 5
for i in {1..30}; do
    if curl -s http://127.0.0.1:${APP_PORT}/api/health &>/dev/null; then
        echo -e "${GREEN}✓ Application is running${NC}"
        break
    fi
    sleep 1
done

echo ""
echo -e "${GREEN}${BOLD}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║   Installation Complete!              ║${NC}"
echo -e "${GREEN}${BOLD}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}Development Environment:${NC}"
echo -e "  URL:     ${CYAN}https://${DOMAIN}${NC}"
echo -e "  Port:    ${APP_PORT}"
echo -e "  Service: ${SERVICE_NAME}"
echo ""
echo -e "${YELLOW}${BOLD}⚠ NEXT STEPS:${NC}"
echo -e "1. Edit configuration: ${BOLD}nano $INSTALL_DIR/.env${NC}"
echo -e "2. Add your API keys (VirtFusion, Stripe TEST, Auth0)"
echo -e "3. Use SEPARATE database from production!"
echo -e "4. Restart application: ${BOLD}pm2 restart ${SERVICE_NAME}${NC}"
echo ""
echo -e "${BOLD}Useful Commands:${NC}"
echo -e "  Update:  ${BOLD}sudo update-ozvps-dev${NC}"
echo -e "  Status:  ${BOLD}pm2 status${NC}"
echo -e "  Logs:    ${BOLD}pm2 logs ${SERVICE_NAME}${NC}"
echo -e "  Restart: ${BOLD}pm2 restart ${SERVICE_NAME}${NC}"
echo ""
