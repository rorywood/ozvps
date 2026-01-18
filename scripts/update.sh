#!/usr/bin/env bash
# Simple OzVPS Update Script
# Uses git for reliable updates - no more cache issues!

set -e

INSTALL_DIR="/opt/ozvps-panel"
REPO_URL="https://github.com/rorywood/ozvps.git"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  OzVPS Update Script (Git-based)${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check root
if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}Error: Please run as root${NC}"
    exit 1
fi

# Detect environment from existing installation or ask
if [[ -f "$INSTALL_DIR/.ozvps-env" ]]; then
    ENV=$(cat "$INSTALL_DIR/.ozvps-env")
    echo -e "${GREEN}Detected environment: ${ENV}${NC}"
elif [[ "$1" == "--dev" ]]; then
    ENV="development"
elif [[ "$1" == "--prod" ]]; then
    ENV="production"
else
    echo "Which environment?"
    echo "  1) Production  (app.ozvps.com.au - main branch)"
    echo "  2) Development (dev.ozvps.com.au - dev branch)"
    read -p "Choose [1-2]: " choice
    if [[ "$choice" == "1" ]]; then
        ENV="production"
    else
        ENV="development"
    fi
fi

# Set branch based on environment
if [[ "$ENV" == "production" ]]; then
    BRANCH="main"
else
    BRANCH="claude/dev-l5488"
fi

echo -e "${CYAN}Branch: ${BRANCH}${NC}"
echo ""

cd "$INSTALL_DIR"

# Check if it's a git repo
if [[ -d ".git" ]]; then
    echo -e "${GREEN}Git repository detected${NC}"

    # Fetch and show what's new
    echo "Fetching latest changes..."
    git fetch origin "$BRANCH"

    LOCAL=$(git rev-parse HEAD 2>/dev/null || echo "none")
    REMOTE=$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "none")

    if [[ "$LOCAL" == "$REMOTE" ]]; then
        echo -e "${GREEN}Already up to date!${NC}"
        echo "Current commit: ${LOCAL:0:7}"
        exit 0
    fi

    echo "Current: ${LOCAL:0:7}"
    echo "Latest:  ${REMOTE:0:7}"
    echo ""

    # Show recent commits
    echo "New commits:"
    git log --oneline HEAD..origin/$BRANCH | head -10
    echo ""

    # Stop app
    echo "Stopping application..."
    pm2 stop ozvps-panel 2>/dev/null || true

    # Pull changes
    echo "Pulling changes..."
    git reset --hard "origin/$BRANCH"

else
    echo -e "${YELLOW}Not a git repo - converting to git-based installation${NC}"

    # Backup .env
    if [[ -f ".env" ]]; then
        cp .env /tmp/ozvps-env-backup
        echo "Backed up .env to /tmp/ozvps-env-backup"
    fi

    # Stop app
    echo "Stopping application..."
    pm2 stop ozvps-panel 2>/dev/null || true

    # Remove old installation and clone fresh
    cd /opt
    rm -rf ozvps-panel

    echo "Cloning repository..."
    git clone -b "$BRANCH" "$REPO_URL" ozvps-panel
    cd ozvps-panel

    # Restore .env
    if [[ -f "/tmp/ozvps-env-backup" ]]; then
        cp /tmp/ozvps-env-backup .env
        echo "Restored .env"
    else
        echo -e "${RED}Warning: No .env backup found. You may need to recreate it.${NC}"
    fi
fi

# Save environment marker
echo "$ENV" > .ozvps-env
echo "$BRANCH" > .ozvps-branch

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install

# Build
echo ""
echo "Building application..."
npm run build

# Restart
echo ""
echo "Starting application..."
pm2 start ecosystem.config.cjs 2>/dev/null || pm2 restart ozvps-panel
pm2 save

# Show status
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Update Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Environment: $ENV"
echo "Branch:      $BRANCH"
echo "Commit:      $(git rev-parse --short HEAD)"
echo ""
echo "Commands:"
echo "  pm2 logs ozvps-panel  - View logs"
echo "  pm2 status            - Check status"
echo ""
