#!/usr/bin/env bash
# Simple OzVPS Update Script
# Uses git for reliable updates - no more cache issues!

set -e

# IMPORTANT: Start in a known good directory to avoid getcwd errors
cd /tmp 2>/dev/null || cd /

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

# Detect branch from existing installation first
if [[ -f "$INSTALL_DIR/.ozvps-branch" ]]; then
    BRANCH=$(cat "$INSTALL_DIR/.ozvps-branch" | tr -d '[:space:]')
    echo -e "${GREEN}Detected branch: ${BRANCH}${NC}"
    # Determine environment from branch
    if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
        ENV="production"
    else
        ENV="development"
    fi
elif [[ -f "$INSTALL_DIR/.ozvps-env" ]]; then
    ENV=$(cat "$INSTALL_DIR/.ozvps-env" | tr -d '[:space:]')
    echo -e "${GREEN}Detected environment: ${ENV}${NC}"
    # Set branch based on environment
    if [[ "$ENV" == "production" ]]; then
        BRANCH="main"
    else
        echo -e "${YELLOW}Warning: No branch file found for dev environment${NC}"
        echo "Please specify branch manually or run: ozvps --branch"
        exit 1
    fi
elif [[ "$1" == "--dev" ]]; then
    ENV="development"
    echo -e "${YELLOW}Warning: Dev mode requires a branch file${NC}"
    echo "Please run: ozvps --branch to select a branch"
    exit 1
elif [[ "$1" == "--prod" ]]; then
    ENV="production"
    BRANCH="main"
else
    echo "Which environment?"
    echo "  1) Production  (app.ozvps.com.au - main branch)"
    echo "  2) Development (requires branch selection via ozvps --branch)"
    read -p "Choose [1-2]: " choice
    if [[ "$choice" == "1" ]]; then
        ENV="production"
        BRANCH="main"
    else
        echo -e "${YELLOW}For development, please use: ozvps --branch${NC}"
        exit 1
    fi
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

# IMPORTANT: Re-enter the install directory with a fresh reference
# This fixes "getcwd: cannot access parent directories" error after rm/clone
cd /opt
cd "$INSTALL_DIR" || { echo -e "${RED}Failed to enter $INSTALL_DIR${NC}"; exit 1; }

# Save environment marker
echo "$ENV" > .ozvps-env
echo "$BRANCH" > .ozvps-branch

# Install dependencies (including dev deps needed for build)
echo ""
echo "Installing dependencies..."
npm install --include=dev

# Build
echo ""
echo "Building application..."
npm run build

# Prune dev dependencies for production
if [[ "$ENV" == "production" ]]; then
    echo ""
    echo "Pruning dev dependencies..."
    npm prune --production
fi

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
