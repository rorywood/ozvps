#!/bin/bash
set -e

# SSL Setup Script for OzVPS Panel
# This script configures SSL/HTTPS for the panel using a self-signed certificate
# For production, you should replace this with a proper Let's Encrypt certificate

DOMAIN="dev.ozvps.com.au"
INSTALL_DIR="/opt/ozvps-panel"

echo "Setting up SSL for $DOMAIN..."
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: This script must be run as root"
    exit 1
fi

# Create SSL directories
echo "Creating SSL directories..."
mkdir -p /etc/ssl/private /etc/ssl/certs
chmod 700 /etc/ssl/private

# Generate self-signed certificate (valid for 1 year)
echo "Generating self-signed SSL certificate..."
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/ssl/private/$DOMAIN.key \
    -out /etc/ssl/certs/$DOMAIN.crt \
    -subj "/C=AU/ST=NSW/L=Sydney/O=OzVPS/CN=$DOMAIN" \
    2>/dev/null

echo "✓ SSL certificate created"
echo ""

# Create nginx configuration with SSL
echo "Configuring NGINX for HTTPS..."
cat > /etc/nginx/sites-available/ozvps-dev << 'NGINXEOF'
# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name dev.ozvps.com.au;

    # Redirect all HTTP traffic to HTTPS
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name dev.ozvps.com.au;

    # SSL certificate
    ssl_certificate /etc/ssl/certs/dev.ozvps.com.au.crt;
    ssl_certificate_key /etc/ssl/private/dev.ozvps.com.au.key;

    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Proxy to Node.js application
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
NGINXEOF

# Enable the configuration
ln -sf /etc/nginx/sites-available/ozvps-dev /etc/nginx/sites-enabled/

# Test nginx configuration
if nginx -t 2>/dev/null; then
    echo "✓ NGINX configuration is valid"
else
    echo "ERROR: NGINX configuration test failed"
    nginx -t
    exit 1
fi
echo ""

# Reload nginx
echo "Reloading NGINX..."
if systemctl reload nginx 2>/dev/null; then
    echo "✓ NGINX reloaded via systemctl"
elif nginx -s reload 2>/dev/null; then
    echo "✓ NGINX reloaded via signal"
else
    echo "! Could not reload NGINX, trying restart..."
    nginx
fi

echo ""
echo "================================================================"
echo "SSL Setup Complete!"
echo "================================================================"
echo ""
echo "⚠️  IMPORTANT: You are using a SELF-SIGNED certificate"
echo ""
echo "Your browser will show a security warning. This is normal for"
echo "development. To bypass it:"
echo "  1. Click 'Advanced' in the browser warning"
echo "  2. Click 'Proceed to $DOMAIN (unsafe)'"
echo ""
echo "For PRODUCTION, replace with Let's Encrypt:"
echo "  1. Install certbot: apt-get install certbot python3-certbot-nginx"
echo "  2. Run: certbot --nginx -d $DOMAIN --email YOUR@EMAIL.com"
echo ""
echo "Testing:"
echo "  HTTP:  curl -I http://$DOMAIN"
echo "  HTTPS: curl -Ik https://$DOMAIN"
echo ""
