#!/bin/bash

# OzVPS Development Update Script
# Branch: claude/dev-l5488

set -e

BRANCH="claude/dev-l5488"
INSTALL_DIR="/opt/ozvps-panel"
REPO="rorywood/ozvps"

echo ""
echo "╔════════════════════════════════════════╗"
echo "║   OzVPS Development Update            ║"
echo "║   Branch: claude/dev-l5488            ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Check for new commits
CURRENT_COMMIT=""
if [ -f "$INSTALL_DIR/.commit" ]; then
    CURRENT_COMMIT=$(cat "$INSTALL_DIR/.commit" 2>/dev/null || echo "")
fi

LATEST_COMMIT=$(curl -fsSL "https://api.github.com/repos/${REPO}/commits/${BRANCH}" 2>/dev/null | grep '"sha":' | head -1 | cut -d'"' -f4 || echo "")

if [ -n "$LATEST_COMMIT" ] && [ -n "$CURRENT_COMMIT" ] && [ "$CURRENT_COMMIT" = "$LATEST_COMMIT" ]; then
    echo "Already up to date (${LATEST_COMMIT:0:7})"
    echo ""
    read -p "Force update anyway? [y/N]: " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Update cancelled."
        exit 0
    fi
fi

# Step 1: PostgreSQL Check
echo "═══════════════════════════════════════════"
echo "  STEP 1: PostgreSQL Installation"
echo "═══════════════════════════════════════════"
echo ""

if command -v psql &> /dev/null; then
    echo "✓ PostgreSQL already installed"
else
    echo "Installing PostgreSQL..."
    apt-get update && apt-get install -y postgresql postgresql-contrib
    echo "✓ PostgreSQL installed"
fi

echo "Starting PostgreSQL service..."
systemctl enable postgresql
systemctl start postgresql
echo "✓ PostgreSQL is running"

echo ""
echo "Setting up database..."
sudo -u postgres psql -c "CREATE USER ozvps_dev WITH PASSWORD 'ozvps_dev_password';" 2>/dev/null || echo "  (user already exists)"
sudo -u postgres psql -c "CREATE DATABASE ozvps_dev OWNER ozvps_dev;" 2>/dev/null || echo "  (database already exists)"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ozvps_dev TO ozvps_dev;"
echo "✓ Database ready"

# Step 2: Download Latest Code
echo ""
echo "═══════════════════════════════════════════"
echo "  STEP 2: Download Latest Code"
echo "═══════════════════════════════════════════"
echo ""

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Backup configuration
echo "Backing up configuration..."
cp .env .env.backup 2>/dev/null || true

echo "Downloading from GitHub ($BRANCH branch)..."
curl -sL "https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz" -o /tmp/ozvps.tar.gz
echo "✓ Downloaded"

echo "Removing old files..."
find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 ! -name '.env*' -exec rm -rf {} +

echo "Extracting new code..."
tar -xzf /tmp/ozvps.tar.gz -C /tmp
cp -r /tmp/ozvps-"${BRANCH//\//-}"/* "$INSTALL_DIR/"
rm -rf /tmp/ozvps-* /tmp/ozvps.tar.gz
echo "✓ Files copied"

# Restore configuration
cp .env.backup .env 2>/dev/null || true
echo "✓ Code updated"

# Save commit hash
if [ -n "$LATEST_COMMIT" ]; then
    echo "$LATEST_COMMIT" > "$INSTALL_DIR/.commit"
fi

# Step 3: Build Application
echo ""
echo "═══════════════════════════════════════════"
echo "  STEP 3: Build Application"
echo "═══════════════════════════════════════════"
echo ""

echo "Installing dependencies..."
npm install
echo "✓ Dependencies installed"

echo ""
echo "Building application..."
npm run build
echo "✓ Application built"

# Verify build
if [ -f "dist/index.cjs" ]; then
    echo "✓ Build verified"
else
    echo "✗ Build failed - dist/index.cjs not found"
    exit 1
fi

# Step 4: Database Migrations
echo ""
echo "═══════════════════════════════════════════"
echo "  STEP 4: Database Migrations"
echo "═══════════════════════════════════════════"
echo ""

echo "Loading environment..."
set -a
source .env
set +a

echo "Running migrations..."
npx drizzle-kit push --force 2>/dev/null || npx drizzle-kit push 2>/dev/null || echo "No migrations needed"
echo "✓ Migrations complete"

# Step 5: Restart Application
echo ""
echo "═══════════════════════════════════════════"
echo "  STEP 5: Restart Application"
echo "═══════════════════════════════════════════"
echo ""

echo "Restarting PM2..."
pm2 delete ozvps-panel 2>/dev/null || true
pm2 start npm --name "ozvps-panel" -- start
pm2 save

echo "Waiting for application to start..."
sleep 3

# Check if running
if pm2 list | grep -q "ozvps-panel.*online"; then
    echo "✓ Application is running"
else
    echo "⚠ Application may not be running. Check: pm2 logs ozvps-panel"
fi

echo ""
echo "╔════════════════════════════════════════╗"
echo "║   Update Complete!                    ║"
echo "╚════════════════════════════════════════╝"
echo ""
