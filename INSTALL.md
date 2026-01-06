# OzVPS Panel Installation Guide

Complete installation documentation for deploying the OzVPS Panel on your own server.

## Prerequisites

### System Requirements
- **OS**: Ubuntu 20.04/22.04 LTS, Debian 11/12, or similar Linux distribution
- **Node.js**: v20.x or later
- **RAM**: Minimum 1GB (2GB+ recommended)
- **Disk**: 1GB free space minimum

### Required Services
- **Auth0 Account**: For user authentication ([auth0.com](https://auth0.com))
- **VirtFusion Panel**: Working VirtFusion installation with API access

### Required Credentials
You'll need the following credentials before installation:

| Variable | Description | Where to Get It |
|----------|-------------|-----------------|
| `AUTH0_DOMAIN` | Your Auth0 tenant domain | Auth0 Dashboard > Applications > Settings |
| `AUTH0_CLIENT_ID` | Auth0 application client ID | Auth0 Dashboard > Applications > Settings |
| `AUTH0_CLIENT_SECRET` | Auth0 application client secret | Auth0 Dashboard > Applications > Settings |
| `VIRTFUSION_PANEL_URL` | VirtFusion panel base URL | Your VirtFusion installation (e.g., https://panel.example.com) |
| `VIRTFUSION_API_TOKEN` | VirtFusion API bearer token | VirtFusion Admin > API Settings |

## Quick Install (One-Line)

```bash
curl -fsSL https://your-replit-app.replit.app/install.sh | sudo bash
```

Or download and review first (recommended):
```bash
curl -fsSL https://your-replit-app.replit.app/install.sh -o install.sh
chmod +x install.sh
sudo ./install.sh
```

## Manual Installation

### Step 1: Install Node.js

```bash
# Using NodeSource repository (recommended)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

### Step 2: Clone the Repository

```bash
# Create application directory
sudo mkdir -p /opt/ozvps-panel
sudo chown $USER:$USER /opt/ozvps-panel
cd /opt/ozvps-panel

# Clone repository (replace with your repo URL)
git clone https://github.com/yourusername/ozvps-panel.git .
```

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Configure Environment Variables

Create a `.env` file in the root directory:

```bash
cat > .env << 'EOF'
# Auth0 Configuration
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your_client_id
AUTH0_CLIENT_SECRET=your_client_secret

# VirtFusion Configuration
VIRTFUSION_PANEL_URL=https://your-virtfusion-panel.com
VIRTFUSION_API_TOKEN=your_api_token

# Application Settings
NODE_ENV=production
PORT=5000
EOF
```

Edit the file with your actual credentials:
```bash
nano .env
```

### Step 5: Build the Application

```bash
npm run build
```

### Step 6: Start the Application

For testing:
```bash
npm start
```

For production with PM2:
```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the application
pm2 start npm --name "ozvps-panel" -- start

# Save PM2 configuration
pm2 save

# Enable startup on boot
pm2 startup
```

## Nginx Reverse Proxy Setup

### Step 1: Install Nginx

```bash
sudo apt-get update
sudo apt-get install -y nginx
```

### Step 2: Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/ozvps-panel
```

Add the following configuration:

```nginx
server {
    listen 80;
    server_name panel.yourdomain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name panel.yourdomain.com;

    # SSL Configuration (use Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/panel.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/panel.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        proxy_pass http://127.0.0.1:5000;
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
    }

    # WebSocket support for VNC console
    location /ws {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
    }
}
```

### Step 3: Enable the Site

```bash
sudo ln -s /etc/nginx/sites-available/ozvps-panel /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 4: SSL Certificate with Let's Encrypt

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d panel.yourdomain.com
```

## Auth0 Configuration

### Step 1: Create an Application

1. Log in to [Auth0 Dashboard](https://manage.auth0.com/)
2. Go to **Applications** > **Create Application**
3. Choose **Regular Web Application**
4. Name it "OzVPS Panel"

### Step 2: Configure Application Settings

In your Auth0 application settings:

- **Allowed Callback URLs**: `https://panel.yourdomain.com/callback`
- **Allowed Logout URLs**: `https://panel.yourdomain.com`
- **Allowed Web Origins**: `https://panel.yourdomain.com`

### Step 3: Enable Resource Owner Password Grant

1. Go to **Applications** > Your App > **Settings** > **Advanced Settings**
2. Under **Grant Types**, enable **Password**
3. Go to **APIs** > **Auth0 Management API** > **Machine to Machine Applications**
4. Authorize your application with `read:users`, `update:users`, `create:users` permissions

## VirtFusion Configuration

### Step 1: Generate API Token

1. Log in to VirtFusion Admin Panel
2. Navigate to **Settings** > **API**
3. Create a new API token with full permissions
4. Copy the token for your `.env` file

### Step 2: Verify API Access

Test your API token:
```bash
curl -X GET "https://your-virtfusion-panel.com/api/v1/servers" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Accept: application/json"
```

## Updating the Panel

```bash
cd /opt/ozvps-panel

# Pull latest changes
git pull origin main

# Install new dependencies
npm install

# Rebuild
npm run build

# Restart the application
pm2 restart ozvps-panel
```

## Troubleshooting

### Application Won't Start

Check logs:
```bash
pm2 logs ozvps-panel
```

Verify environment variables:
```bash
cat .env
```

### Can't Connect to VirtFusion API

Test API connectivity:
```bash
curl -I https://your-virtfusion-panel.com/api/v1/servers \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Auth0 Login Issues

1. Verify callback URLs match your domain exactly
2. Check Auth0 logs in the dashboard
3. Ensure the application is authorized for Resource Owner Password Grant

### SSL Certificate Issues

Renew certificate:
```bash
sudo certbot renew
```

Check certificate status:
```bash
sudo certbot certificates
```

## Security Recommendations

1. **Firewall**: Only allow ports 80, 443, and SSH
   ```bash
   sudo ufw allow 22
   sudo ufw allow 80
   sudo ufw allow 443
   sudo ufw enable
   ```

2. **Regular Updates**: Keep system and packages updated
   ```bash
   sudo apt-get update && sudo apt-get upgrade -y
   npm update
   ```

3. **Backups**: Regularly backup your `.env` file and database (if using PostgreSQL)

4. **Monitoring**: Set up PM2 monitoring
   ```bash
   pm2 install pm2-logrotate
   pm2 set pm2-logrotate:max_size 10M
   ```

## File Structure

```
/opt/ozvps-panel/
├── .env                 # Environment variables (create this)
├── package.json         # Node.js dependencies
├── client/              # React frontend
│   ├── src/
│   │   ├── components/  # UI components
│   │   ├── pages/       # Route pages
│   │   ├── hooks/       # React hooks
│   │   └── lib/         # Utilities
├── server/              # Express backend
│   ├── index.ts         # Entry point
│   ├── routes.ts        # API routes
│   ├── virtfusion.ts    # VirtFusion API client
│   └── auth0.ts         # Auth0 client
└── shared/              # Shared types
    └── schema.ts        # Data schemas
```

## Support

For issues and feature requests, please open an issue on the GitHub repository or contact support.
