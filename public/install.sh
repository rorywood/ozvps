#!/usr/bin/env bash
# ============================================================================
#  OzVPS Unified Installer Bootstrap
#
#  This script redirects to the new unified installer.
#
#  Usage:
#    curl -fsSL https://raw.githubusercontent.com/rorywood/ozvps/main/public/install.sh | sudo bash
#    curl -fsSL https://raw.githubusercontent.com/rorywood/ozvps/claude/dev-l5488/public/install.sh | sudo bash
# ============================================================================

set -e

# Detect branch from URL if possible
GITHUB_REPO="rorywood/ozvps"
BRANCH="${OZVPS_BRANCH:-main}"

# Try to detect branch from referrer or environment
if [[ -n "$BASH_SOURCE" ]]; then
    # Check if URL contains branch info
    if echo "$0" | grep -q "dev"; then
        BRANCH="claude/dev-l5488"
    fi
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${CYAN}${BOLD}OzVPS Installer Bootstrap${NC}"
echo -e "${CYAN}─────────────────────────────${NC}"
echo ""

# Check root
if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}Error:${NC} Please run as root"
    echo ""
    echo "Usage: curl -fsSL https://raw.githubusercontent.com/$GITHUB_REPO/$BRANCH/public/install.sh | sudo bash"
    exit 1
fi

# Download and run the unified installer
echo -e "Downloading installer from ${BOLD}$BRANCH${NC} branch..."

TEMP_INSTALLER=$(mktemp)

# Get latest commit SHA to bypass CDN cache
LATEST_SHA=$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/commits/${BRANCH}" 2>/dev/null | grep '"sha":' | head -1 | cut -d'"' -f4)

# Use GitHub API with commit SHA - guaranteed fresh content
INSTALLER_URL="https://api.github.com/repos/${GITHUB_REPO}/contents/scripts/ozvps-install.sh?ref=${LATEST_SHA:-$BRANCH}"

if curl -fsSL -H 'Accept: application/vnd.github.v3.raw' -H 'Cache-Control: no-cache' "$INSTALLER_URL" -o "$TEMP_INSTALLER"; then
    # Verify it's a valid script
    if head -1 "$TEMP_INSTALLER" | grep -q "^#!/"; then
        chmod +x "$TEMP_INSTALLER"
        echo -e "${GREEN}✓${NC} Downloaded installer (commit: ${LATEST_SHA:0:7})"
        echo ""

        # Pass through any arguments and set branch
        GITHUB_BRANCH="$BRANCH" exec "$TEMP_INSTALLER" "$@"
    else
        echo -e "${RED}Error:${NC} Downloaded file is not a valid script"
        rm -f "$TEMP_INSTALLER"
        exit 1
    fi
else
    echo -e "${RED}Error:${NC} Failed to download installer"
    echo ""
    echo "URL: $INSTALLER_URL"
    rm -f "$TEMP_INSTALLER"
    exit 1
fi
