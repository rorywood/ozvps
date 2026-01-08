#!/bin/bash
set -e

# OzVPS Panel - Automated Installation Script
# This script installs OzVPS Panel on a fresh Ubuntu/Debian server

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

INSTALL_DIR="/opt/ozvps"
COMPOSE_FILE="$INSTALL_DIR/docker-compose.yml"
ENV_FILE="$INSTALL_DIR/.env"

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           OzVPS Panel - Installation Script               ║"
echo "║                                                           ║"
echo "║  This script will install OzVPS Panel on your server.    ║"
echo "║  Please have the following ready:                         ║"
echo "║    - VirtFusion API credentials                           ║"
echo "║    - Auth0 application credentials                        ║"
echo "║    - Stripe API keys                                      ║"
echo "║    - GitHub Personal Access Token (read:packages)         ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Please run this script as root (sudo ./install.sh)${NC}"
    exit 1
fi

# Function to prompt for required input
prompt_required() {
    local prompt="$1"
    local var_name="$2"
    local is_secret="$3"
    local value=""
    
    while [ -z "$value" ]; do
        if [ "$is_secret" = "true" ]; then
            read -sp "$prompt: " value
            echo ""
        else
            read -p "$prompt: " value
        fi
        
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
    local is_secret="$4"
    local value=""
    
    if [ "$is_secret" = "true" ]; then
        read -sp "$prompt [$default]: " value
        echo ""
    else
        read -p "$prompt [$default]: " value
    fi
    
    if [ -z "$value" ]; then
        value="$default"
    fi
    
    eval "$var_name=\"$value\""
}

echo -e "${YELLOW}=== Step 1: Collecting Configuration ===${NC}"
echo ""

# GitHub Container Registry
echo -e "${BLUE}--- GitHub Container Registry ---${NC}"
prompt_required "GitHub username" GITHUB_USER false
prompt_required "GitHub Personal Access Token (with read:packages scope)" GHCR_TOKEN true
prompt_optional "GitHub repository name" GITHUB_REPO "ozvps" false

# Database
echo ""
echo -e "${BLUE}--- Database Configuration ---${NC}"
prompt_optional "PostgreSQL username" POSTGRES_USER "ozvps" false
prompt_required "PostgreSQL password (create a strong password)" POSTGRES_PASSWORD true
prompt_optional "PostgreSQL database name" POSTGRES_DB "ozvps" false

# VirtFusion
echo ""
echo -e "${BLUE}--- VirtFusion API ---${NC}"
prompt_required "VirtFusion Panel URL (e.g., https://panel.example.com)" VIRTFUSION_PANEL_URL false
prompt_required "VirtFusion API Token" VIRTFUSION_API_TOKEN true

# Auth0
echo ""
echo -e "${BLUE}--- Auth0 Configuration ---${NC}"
prompt_required "Auth0 Domain (e.g., your-app.au.auth0.com)" AUTH0_DOMAIN false
prompt_required "Auth0 Client ID" AUTH0_CLIENT_ID false
prompt_required "Auth0 Client Secret" AUTH0_CLIENT_SECRET true
prompt_optional "Auth0 Webhook Secret (for user sync)" AUTH0_WEBHOOK_SECRET "$(openssl rand -hex 32)" true

# Stripe
echo ""
echo -e "${BLUE}--- Stripe Configuration ---${NC}"
prompt_required "Stripe Secret Key (sk_live_... or sk_test_...)" STRIPE_SECRET_KEY true
prompt_required "Stripe Publishable Key (pk_live_... or pk_test_...)" STRIPE_PUBLISHABLE_KEY false
prompt_optional "Stripe Webhook Secret (whsec_...)" STRIPE_WEBHOOK_SECRET "" true

# Domain Configuration
echo ""
echo -e "${BLUE}--- Domain Configuration ---${NC}"
prompt_required "Domain name for the panel (e.g., app.ozvps.com.au)" APP_DOMAIN false
prompt_optional "Email for SSL certificate notifications" SSL_EMAIL "admin@${APP_DOMAIN}" false

echo ""
echo -e "${GREEN}Configuration collected successfully!${NC}"
echo ""

# Build DATABASE_URL and DOCKER_IMAGE
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}"
DOCKER_IMAGE="ghcr.io/${GITHUB_USER}/${GITHUB_REPO}:latest"

echo -e "${YELLOW}=== Step 2: Installing Docker ===${NC}"
echo ""

# Check if Docker is installed
if command -v docker &> /dev/null; then
    echo -e "${GREEN}Docker is already installed.${NC}"
else
    echo "Installing Docker..."
    apt-get update
    apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release
    
    # Add Docker's official GPG key
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    
    # Set up the stable repository
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    # Start and enable Docker
    systemctl start docker
    systemctl enable docker
    
    echo -e "${GREEN}Docker installed successfully.${NC}"
fi

echo ""
echo -e "${YELLOW}=== Step 3: Installing Nginx & SSL ===${NC}"
echo ""

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

# Install certbot
if command -v certbot &> /dev/null; then
    echo -e "${GREEN}Certbot is already installed.${NC}"
else
    echo "Installing Certbot..."
    apt-get install -y certbot python3-certbot-nginx
    echo -e "${GREEN}Certbot installed successfully.${NC}"
fi

# Create nginx configuration
echo "Configuring Nginx..."
cat > /etc/nginx/sites-available/ozvps << NGINX_CONFIG
server {
    listen 80;
    server_name ${APP_DOMAIN};

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
NGINX_CONFIG

# Enable the site
ln -sf /etc/nginx/sites-available/ozvps /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and reload nginx
nginx -t
systemctl reload nginx
echo -e "${GREEN}Nginx configured successfully.${NC}"

# Get SSL certificate
echo ""
echo -e "${BLUE}Obtaining SSL certificate for ${APP_DOMAIN}...${NC}"
certbot --nginx -d "$APP_DOMAIN" --non-interactive --agree-tos -m "$SSL_EMAIL" --redirect

echo -e "${GREEN}SSL certificate installed successfully.${NC}"

echo ""
echo -e "${YELLOW}=== Step 4: Setting Up OzVPS Panel ===${NC}"
echo ""

# Create installation directory
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Create .env file with secure permissions
echo "Creating environment configuration..."
cat > "$ENV_FILE" << EOF
# OzVPS Panel - Environment Configuration
# Generated on $(date)

# GitHub Container Registry
GITHUB_USER=${GITHUB_USER}
GITHUB_REPO=${GITHUB_REPO}
GHCR_TOKEN=${GHCR_TOKEN}
DOCKER_IMAGE=${DOCKER_IMAGE}

# Database
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}
DATABASE_URL=${DATABASE_URL}

# VirtFusion
VIRTFUSION_PANEL_URL=${VIRTFUSION_PANEL_URL}
VIRTFUSION_API_TOKEN=${VIRTFUSION_API_TOKEN}

# Auth0
AUTH0_DOMAIN=${AUTH0_DOMAIN}
AUTH0_CLIENT_ID=${AUTH0_CLIENT_ID}
AUTH0_CLIENT_SECRET=${AUTH0_CLIENT_SECRET}
AUTH0_WEBHOOK_SECRET=${AUTH0_WEBHOOK_SECRET}

# Stripe
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
STRIPE_PUBLISHABLE_KEY=${STRIPE_PUBLISHABLE_KEY}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}

# Domain
APP_DOMAIN=${APP_DOMAIN}
SSL_EMAIL=${SSL_EMAIL}
EOF

# Secure the .env file
chmod 600 "$ENV_FILE"
echo -e "${GREEN}Environment file created with secure permissions.${NC}"

# Create docker-compose.yml
echo "Creating Docker Compose configuration..."
cat > "$COMPOSE_FILE" << EOF
version: '3.8'

services:
  app:
    image: ${DOCKER_IMAGE}
    container_name: ozvps-panel
    restart: unless-stopped
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - PORT=5000
      - DATABASE_URL=\${DATABASE_URL}
      - VIRTFUSION_PANEL_URL=\${VIRTFUSION_PANEL_URL}
      - VIRTFUSION_API_TOKEN=\${VIRTFUSION_API_TOKEN}
      - AUTH0_DOMAIN=\${AUTH0_DOMAIN}
      - AUTH0_CLIENT_ID=\${AUTH0_CLIENT_ID}
      - AUTH0_CLIENT_SECRET=\${AUTH0_CLIENT_SECRET}
      - AUTH0_WEBHOOK_SECRET=\${AUTH0_WEBHOOK_SECRET}
      - STRIPE_SECRET_KEY=\${STRIPE_SECRET_KEY}
      - STRIPE_PUBLISHABLE_KEY=\${STRIPE_PUBLISHABLE_KEY}
      - STRIPE_WEBHOOK_SECRET=\${STRIPE_WEBHOOK_SECRET}
      - REGISTRATION_DISABLED=\${REGISTRATION_DISABLED:-false}
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - ozvps-network
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:5000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s

  postgres:
    image: postgres:15-alpine
    container_name: ozvps-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_USER=\${POSTGRES_USER}
      - POSTGRES_PASSWORD=\${POSTGRES_PASSWORD}
      - POSTGRES_DB=\${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - ozvps-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER} -d \${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5

networks:
  ozvps-network:
    driver: bridge

volumes:
  postgres_data:
EOF

# Create control script
echo "Creating control script..."
cat > "$INSTALL_DIR/ozvpsctl.sh" << 'CONTROL_SCRIPT'
#!/bin/bash
set -e

INSTALL_DIR="/opt/ozvps"
ENV_FILE="$INSTALL_DIR/.env"
COMPOSE_FILE="$INSTALL_DIR/docker-compose.yml"
BACKUP_DIR="$INSTALL_DIR/backups"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Load environment
if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
fi

# Validate required env vars
if [ -z "$GITHUB_USER" ] || [ -z "$GHCR_TOKEN" ] || [ -z "$DOCKER_IMAGE" ]; then
    echo -e "${RED}Error: Missing required environment variables.${NC}"
    echo "Please ensure GITHUB_USER, GHCR_TOKEN, and DOCKER_IMAGE are set in $ENV_FILE"
    exit 1
fi

cd "$INSTALL_DIR"

case "$1" in
    update)
        echo -e "${BLUE}Updating OzVPS Panel...${NC}"
        
        # Save current image ID for rollback
        CURRENT_IMAGE=$(docker inspect --format='{{.Image}}' ozvps-panel 2>/dev/null || echo "none")
        echo "$CURRENT_IMAGE" > "$INSTALL_DIR/.previous_image"
        
        # Login to GitHub Container Registry
        echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GITHUB_USER" --password-stdin
        
        # Stop and remove old containers
        echo -e "${YELLOW}Stopping old containers...${NC}"
        docker compose down --remove-orphans
        
        # Pull latest image
        echo -e "${YELLOW}Pulling latest image...${NC}"
        docker compose pull
        
        # Start with new image
        echo -e "${YELLOW}Starting new containers...${NC}"
        docker compose up -d
        
        # Clean up old/unused Docker images to free disk space
        echo -e "${YELLOW}Cleaning up old Docker images...${NC}"
        docker image prune -af --filter "until=24h" 2>/dev/null || true
        docker system prune -f --filter "until=24h" 2>/dev/null || true
        
        echo -e "${GREEN}Update complete!${NC}"
        echo "Run './ozvpsctl.sh status' to check the application status."
        ;;
        
    rollback)
        echo -e "${YELLOW}Rolling back to previous version...${NC}"
        
        if [ ! -f "$INSTALL_DIR/.previous_image" ]; then
            echo -e "${RED}No previous version found to rollback to.${NC}"
            exit 1
        fi
        
        PREVIOUS_IMAGE=$(cat "$INSTALL_DIR/.previous_image")
        
        if [ "$PREVIOUS_IMAGE" = "none" ] || [ -z "$PREVIOUS_IMAGE" ]; then
            echo -e "${RED}No previous version found to rollback to.${NC}"
            exit 1
        fi
        
        # Stop current container
        docker compose down
        
        # Tag previous image as current and restart
        echo -e "${BLUE}Restoring previous version...${NC}"
        docker tag "$PREVIOUS_IMAGE" "$DOCKER_IMAGE"
        docker compose up -d
        
        echo -e "${GREEN}Rollback complete!${NC}"
        ;;
        
    logs)
        if [ "$2" = "-f" ] || [ "$2" = "--follow" ]; then
            docker compose logs -f
        else
            docker compose logs --tail=100
        fi
        ;;
        
    status)
        echo -e "${BLUE}OzVPS Panel Status${NC}"
        echo "================================"
        echo "Image: $DOCKER_IMAGE"
        echo ""
        docker compose ps
        echo ""
        echo -e "${BLUE}Container Health:${NC}"
        docker inspect --format='{{.Name}}: {{.State.Health.Status}}' ozvps-panel ozvps-postgres 2>/dev/null || echo "Containers not running"
        ;;
        
    backup-db)
        mkdir -p "$BACKUP_DIR"
        BACKUP_FILE="$BACKUP_DIR/ozvps_$(date +%Y%m%d_%H%M%S).sql"
        
        echo -e "${BLUE}Backing up database...${NC}"
        docker exec ozvps-postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$BACKUP_FILE"
        gzip "$BACKUP_FILE"
        
        echo -e "${GREEN}Backup saved to: ${BACKUP_FILE}.gz${NC}"
        
        # Keep only last 7 backups
        ls -t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm
        ;;
        
    restore-db)
        if [ -z "$2" ]; then
            echo "Usage: ./ozvpsctl.sh restore-db <backup_file.sql.gz>"
            echo ""
            echo "Available backups:"
            ls -la "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "No backups found"
            exit 1
        fi
        
        BACKUP_FILE="$2"
        if [ ! -f "$BACKUP_FILE" ]; then
            echo -e "${RED}Backup file not found: $BACKUP_FILE${NC}"
            exit 1
        fi
        
        echo -e "${YELLOW}Warning: This will overwrite the current database!${NC}"
        read -p "Are you sure? (yes/no): " confirm
        
        if [ "$confirm" = "yes" ]; then
            echo -e "${BLUE}Restoring database...${NC}"
            gunzip -c "$BACKUP_FILE" | docker exec -i ozvps-postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB"
            echo -e "${GREEN}Database restored successfully!${NC}"
        else
            echo "Restore cancelled."
        fi
        ;;
        
    restart)
        echo -e "${BLUE}Restarting OzVPS Panel...${NC}"
        docker compose restart
        echo -e "${GREEN}Restart complete!${NC}"
        ;;
        
    stop)
        echo -e "${YELLOW}Stopping OzVPS Panel...${NC}"
        docker compose down
        echo -e "${GREEN}Stopped.${NC}"
        ;;
        
    start)
        echo -e "${BLUE}Starting OzVPS Panel...${NC}"
        
        # Login to GitHub Container Registry
        echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GITHUB_USER" --password-stdin
        
        docker compose up -d
        echo -e "${GREEN}Started!${NC}"
        ;;
        
    *)
        echo "OzVPS Panel Control Script"
        echo ""
        echo "Usage: ./ozvpsctl.sh <command>"
        echo ""
        echo "Commands:"
        echo "  update      Pull latest version and restart"
        echo "  rollback    Revert to previous version"
        echo "  logs        View application logs (add -f to follow)"
        echo "  status      Check container status"
        echo "  backup-db   Create database backup"
        echo "  restore-db  Restore database from backup"
        echo "  restart     Restart all services"
        echo "  start       Start all services"
        echo "  stop        Stop all services"
        ;;
esac
CONTROL_SCRIPT

chmod +x "$INSTALL_DIR/ozvpsctl.sh"

echo ""
echo -e "${YELLOW}=== Step 5: Starting OzVPS Panel ===${NC}"
echo ""

# Login to GitHub Container Registry
echo "Logging into GitHub Container Registry..."
echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GITHUB_USER" --password-stdin

# Pull and start the application
echo "Pulling OzVPS Panel image..."
cd "$INSTALL_DIR"
docker compose pull

echo "Starting OzVPS Panel..."
docker compose up -d

# Wait for app to be healthy
echo ""
echo "Waiting for application to start..."
sleep 10

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           OzVPS Panel Installation Complete!              ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Your OzVPS Panel is now running at: ${BLUE}https://${APP_DOMAIN}${NC}"
echo ""
echo "Useful commands:"
echo "  cd /opt/ozvps"
echo "  ./ozvpsctl.sh status      - Check status"
echo "  ./ozvpsctl.sh logs -f     - View logs"
echo "  ./ozvpsctl.sh update      - Update to latest version"
echo "  ./ozvpsctl.sh backup-db   - Backup database"
echo ""
echo -e "${GREEN}SSL is configured and will auto-renew via certbot.${NC}"
echo ""
