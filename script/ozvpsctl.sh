#!/bin/bash
# OzVPS Control CLI wrapper

INSTALL_DIR="/opt/ozvps-panel"

if [[ ! -d "$INSTALL_DIR" ]]; then
    echo "Error: OzVPS Panel not installed at $INSTALL_DIR"
    exit 1
fi

cd "$INSTALL_DIR"

# Load environment
if [[ -f "$INSTALL_DIR/.env" ]]; then
    set -a
    source "$INSTALL_DIR/.env"
    set +a
fi

# Run the CLI
exec npx tsx "$INSTALL_DIR/script/ozvpsctl.ts" "$@"
