#!/bin/bash
set -e

# Quick recovery script to complete installation
INSTALL_DIR="/opt/ozvps-panel"
SERVICE_NAME="ozvps-panel"

echo "Completing installation..."
echo ""

# Check if directory exists
if [ ! -d "$INSTALL_DIR" ]; then
    echo "ERROR: $INSTALL_DIR does not exist"
    exit 1
fi

cd "$INSTALL_DIR"

# Show what files we have
echo "Files in $INSTALL_DIR:"
ls -la | head -20
echo ""

# Check if package.json exists, if not check subdirectories
if [ ! -f "package.json" ]; then
    echo "package.json not found in $INSTALL_DIR"
    echo "Checking for files in subdirectory..."

    # Look for package.json in subdirectories
    PKG_JSON=$(find . -maxdepth 2 -name "package.json" -type f | head -1)

    if [ -n "$PKG_JSON" ]; then
        SUBDIR=$(dirname "$PKG_JSON")
        echo "Found package.json in: $SUBDIR"
        echo "Moving files to correct location..."

        # Move all files from subdirectory to parent
        mv "$SUBDIR"/* . 2>/dev/null || true
        mv "$SUBDIR"/.[^.]* . 2>/dev/null || true
        rmdir "$SUBDIR" 2>/dev/null || rm -rf "$SUBDIR"

        echo "✓ Files moved to $INSTALL_DIR"
    else
        echo "ERROR: package.json not found anywhere. Download failed."
        echo "Files in directory:"
        ls -la
        exit 1
    fi
fi

echo "Installing npm packages..."
npm install --production
echo "✓ Packages installed"
echo ""

echo "Building application..."
npm run build
echo "✓ Build complete"
echo ""

# Create PM2 ecosystem file
echo "Creating PM2 config..."
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
      NODE_ENV: 'production',
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
echo "✓ PM2 config created"
echo ""

# Configure NGINX
echo "Configuring NGINX..."
cat > /etc/nginx/sites-available/ozvps-dev << 'EOF'
server {
    listen 80;
    server_name dev.ozvps.com.au;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        client_max_body_size 100M;
    }
}
EOF

ln -sf /etc/nginx/sites-available/ozvps-dev /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
echo "✓ NGINX configured"
echo ""

# Start PM2
echo "Starting application with PM2..."
pm2 delete $SERVICE_NAME 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save --force
pm2 startup systemd -u root --hp /root 2>/dev/null || true
echo "✓ Application started"
echo ""

# Check status
echo "Checking application status..."
sleep 3
pm2 status
echo ""

echo "Installation complete!"
echo ""
echo "Commands:"
echo "  pm2 status           - Check status"
echo "  pm2 logs $SERVICE_NAME  - View logs"
echo "  pm2 restart $SERVICE_NAME - Restart"
echo ""
