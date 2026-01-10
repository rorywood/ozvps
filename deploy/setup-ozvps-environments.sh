#!/bin/bash
set -e

# OzVPS Multi-Environment Setup Script
# This script sets up both production and development environments

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔════════════════════════════════════════════════════════╗"
echo "║   OzVPS Multi-Environment Setup                       ║"
echo "╚════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Please run as root (sudo ./setup-ozvps-environments.sh)${NC}"
    exit 1
fi

# Install the multi-environment update script
echo -e "${CYAN}Installing update-ozvps command...${NC}"
curl -sSL https://raw.githubusercontent.com/rorywood/ozvps/claude/dev-l5488/public/update-ozvps.sh \
  -o /usr/local/bin/update-ozvps
chmod +x /usr/local/bin/update-ozvps
echo -e "${GREEN}✓ Installed update-ozvps${NC}"
echo ""

# Ask which environments to set up
echo -e "${BOLD}Which environments do you want to set up?${NC}"
echo "  1) Production only (app.ozvps.com.au)"
echo "  2) Development only (dev.ozvps.com.au)"
echo "  3) Both (recommended)"
echo ""
read -p "Enter your choice (1-3): " ENV_CHOICE

SETUP_PROD=false
SETUP_DEV=false

case "$ENV_CHOICE" in
    1)
        SETUP_PROD=true
        ;;
    2)
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

# Get deployment URLs
if [ "$SETUP_PROD" = true ]; then
    echo -e "${CYAN}=== Production Configuration ===${NC}"
    read -p "Production deployment URL (e.g., https://your-app.repl.co): " PROD_URL
    echo ""
fi

if [ "$SETUP_DEV" = true ]; then
    echo -e "${CYAN}=== Development Configuration ===${NC}"
    if [ "$SETUP_PROD" = true ]; then
        read -p "Development deployment URL (press Enter to use same as prod): " DEV_URL
        if [ -z "$DEV_URL" ]; then
            DEV_URL="$PROD_URL"
        fi
    else
        read -p "Development deployment URL (e.g., https://your-dev-app.repl.co): " DEV_URL
    fi
    echo ""
fi

# Setup Production
if [ "$SETUP_PROD" = true ]; then
    echo -e "${BOLD}${CYAN}Setting up Production Environment...${NC}"
    echo ""

    # Create config directory
    mkdir -p /opt/ozvps-panel
    echo "REPLIT_URL=\"$PROD_URL\"" > /opt/ozvps-panel/.update_config
    chmod 600 /opt/ozvps-panel/.update_config

    # Run update
    update-ozvps prod <<EOF
y
EOF

    echo ""
    echo -e "${GREEN}✓ Production environment ready at https://app.ozvps.com.au${NC}"
    echo ""
fi

# Setup Development
if [ "$SETUP_DEV" = true ]; then
    echo -e "${BOLD}${CYAN}Setting up Development Environment...${NC}"
    echo ""

    # Create config directory
    mkdir -p /opt/ozvps-panel-dev
    echo "REPLIT_URL=\"$DEV_URL\"" > /opt/ozvps-panel-dev/.update_config
    chmod 600 /opt/ozvps-panel-dev/.update_config

    # Run update
    update-ozvps dev <<EOF
y
EOF

    echo ""
    echo -e "${GREEN}✓ Development environment ready at https://dev.ozvps.com.au${NC}"
    echo ""
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Setup Complete!                                     ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$SETUP_PROD" = true ]; then
    echo -e "${BOLD}Production:${NC}"
    echo -e "  URL:     ${CYAN}https://app.ozvps.com.au${NC}"
    echo -e "  Port:    5000"
    echo -e "  Service: ozvps-panel"
    echo -e "  Update:  ${BOLD}sudo update-ozvps${NC}"
    echo ""
fi

if [ "$SETUP_DEV" = true ]; then
    echo -e "${BOLD}Development:${NC}"
    echo -e "  URL:     ${CYAN}https://dev.ozvps.com.au${NC}"
    echo -e "  Port:    5001"
    echo -e "  Service: ozvps-panel-dev"
    echo -e "  Update:  ${BOLD}sudo update-ozvps dev${NC}"
    echo ""
fi

echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Configure environment variables in .env files"
echo "  2. Set up Stripe keys (test keys for dev, live keys for prod)"
echo "  3. Monitor with: pm2 status"
echo ""
