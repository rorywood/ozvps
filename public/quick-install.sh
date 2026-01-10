#!/bin/bash
set -e

# OzVPS Quick Installer - Sets up everything automatically
# Usage: curl -sSL https://raw.githubusercontent.com/rorywood/ozvps/claude/dev-l5488/public/quick-install.sh | sudo bash

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}${BOLD}"
echo "╔═══════════════════════════════════════╗"
echo "║   OzVPS Quick Installer               ║"
echo "╚═══════════════════════════════════════╝"
echo -e "${NC}"

# Check root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Run as root: curl -sSL <url> | sudo bash${NC}"
    exit 1
fi

# Get panel server URL from environment variable
if [[ -z "$OZVPS_URL" ]]; then
    echo -e "${RED}Error: OZVPS_URL environment variable is required${NC}"
    echo ""
    echo "Usage:"
    echo "  OZVPS_URL=https://your-server.com curl -sSL https://raw.githubusercontent.com/rorywood/ozvps/claude/dev-l5488/public/quick-install.sh | sudo -E bash"
    echo ""
    echo "Example:"
    echo "  OZVPS_URL=https://panel.ozvps.com.au curl -sSL https://raw.githubusercontent.com/rorywood/ozvps/claude/dev-l5488/public/quick-install.sh | sudo -E bash"
    echo ""
    exit 1
fi

DEPLOY_URL="${OZVPS_URL%/}"

if [[ ! "$DEPLOY_URL" =~ ^https:// ]]; then
    echo -e "${RED}Error: URL must use HTTPS${NC}"
    echo "Provided: $DEPLOY_URL"
    exit 1
fi

echo "Panel Server: $DEPLOY_URL"
echo ""

echo ""
echo -e "${CYAN}Installing...${NC}"

# Install update script
curl -sSL https://raw.githubusercontent.com/rorywood/ozvps/claude/dev-l5488/public/update-ozvps.sh \
  -o /usr/local/bin/update-ozvps
chmod +x /usr/local/bin/update-ozvps

# Set up production
echo ""
echo -e "${BOLD}Setting up Production (app.ozvps.com.au)...${NC}"
mkdir -p /opt/ozvps-panel
echo "PANEL_URL=\"$DEPLOY_URL\"" > /opt/ozvps-panel/.update_config
chmod 600 /opt/ozvps-panel/.update_config

update-ozvps prod <<EOF
y
EOF

# Set up dev
echo ""
echo -e "${BOLD}Setting up Development (dev.ozvps.com.au)...${NC}"
mkdir -p /opt/ozvps-panel-dev
echo "PANEL_URL=\"$DEPLOY_URL\"" > /opt/ozvps-panel-dev/.update_config
chmod 600 /opt/ozvps-panel-dev/.update_config

update-ozvps dev <<EOF
y
EOF

echo ""
echo -e "${GREEN}${BOLD}╔═══════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║   Done! Both environments ready       ║${NC}"
echo -e "${GREEN}${BOLD}╚═══════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}Production:${NC}  https://app.ozvps.com.au"
echo -e "${BOLD}Development:${NC} https://dev.ozvps.com.au"
echo ""
echo -e "${BOLD}Update commands:${NC}"
echo "  sudo update-ozvps prod"
echo "  sudo update-ozvps dev"
echo ""
echo -e "${BOLD}Monitor:${NC} pm2 status"
echo ""
