#!/bin/bash
set -e

INSTALL_DIR="/opt/ozvps-panel"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

show_header() {
    clear
    echo ""
    echo -e "${CYAN}┌─────────────────────────────────────────┐${NC}"
    echo -e "${CYAN}│${NC}  ${BOLD}OzVPS Panel${NC} ${DIM}Credit Management${NC}          ${CYAN}│${NC}"
    echo -e "${CYAN}└─────────────────────────────────────────┘${NC}"
    echo ""
}

error_exit() {
    echo ""
    echo -e "  ${RED}✗${NC}  $1"
    echo ""
    exit 1
}

[[ $EUID -ne 0 ]] && error_exit "Please run as root: ${BOLD}sudo ozvps-credits${NC}"
[[ ! -d "$INSTALL_DIR" ]] && error_exit "OzVPS Panel not found at $INSTALL_DIR"
[[ ! -f "$INSTALL_DIR/.env" ]] && error_exit "Configuration not found. Re-run installer."

export $(grep -v '^#' "$INSTALL_DIR/.env" | xargs 2>/dev/null)

if [[ -z "$DATABASE_URL" ]]; then
    echo ""
    echo -e "  ${YELLOW}DATABASE_URL not configured.${NC}"
    echo -e "  ${DIM}Running update-ozvps to auto-configure database...${NC}"
    echo ""
    update-ozvps
    # Re-source .env after update
    export $(grep -v '^#' "$INSTALL_DIR/.env" | xargs 2>/dev/null)
    [[ -z "$DATABASE_URL" ]] && error_exit "Database configuration failed. Check update-ozvps logs."
fi

read -sp "  Enter Password: " INPUT_PASS < /dev/tty
echo ""

if [[ "$INPUT_PASS" != "1234" ]]; then
    error_exit "Invalid password"
fi

show_header
echo -e "  ${GREEN}✓${NC}  Authenticated"
echo ""

cd "$INSTALL_DIR"
exec npx tsx "$INSTALL_DIR/script/credits-cli.ts"
