# OzVPS Panel - Multi-Environment Setup Guide

This guide explains how to set up and use both production and development environments for OzVPS Panel.

## Overview

The multi-environment setup allows you to run two separate instances of OzVPS Panel:

- **Production** (app.ozvps.com.au) - Your live customer-facing environment
- **Development** (dev.ozvps.com.au) - Test environment for reviewing changes before production

Each environment:
- Runs on a separate port (Production: 5000, Dev: 5001)
- Has its own installation directory
- Has its own database (optional, can share)
- Has its own PM2 process
- Has its own SSL certificate

## Prerequisites

- Root access to your server
- Both domains (app.ozvps.com.au and dev.ozvps.com.au) pointing to your server's IP
- Ports 80 and 443 open for NGINX and SSL

## Initial Setup

### 1. Set Up NGINX for Both Environments

Run the multi-environment NGINX setup script:

```bash
sudo bash deploy/setup-nginx-multi.sh
```

This script will:
1. Ask which environment(s) to set up (Production, Dev, or Both)
2. Prompt for domain names and ports
3. Install and configure NGINX
4. Install and configure SSL certificates via Let's Encrypt
5. Create separate NGINX configurations for each environment

**Example Answers:**
```
Which environment do you want to set up?
  1) Production (app.ozvps.com.au)
  2) Development (dev.ozvps.com.au)
  3) Both
Enter your choice (1-3): 3

=== Production Configuration ===
Production domain name: app.ozvps.com.au
Production backend port [5000]: 5000

=== Development Configuration ===
Development domain name: dev.ozvps.com.au
Development backend port [5001]: 5001

Email for SSL certificate notifications [admin@app.ozvps.com.au]: admin@ozvps.com.au
```

### 2. Install Production Environment (First Time)

If you haven't installed production yet:

```bash
curl -fsSL https://your-panel-server.com/install.sh | sudo bash
```

This creates the production environment in `/opt/ozvps-panel` on port 5000.

### 3. Install Development Environment

To set up the dev environment, use the update script with the `dev` parameter:

```bash
sudo update-ozvps dev
```

This will:
- Create `/opt/ozvps-panel-dev` directory
- Download and install the application
- Set up PM2 service named `ozvps-panel-dev`
- Configure it to run on port 5001
- Create a separate database (or you can configure it to share)

**Example:**
```bash
$ sudo update-ozvps dev

┌─────────────────────────────────────────┐
│  OzVPS Panel Update Tool                │
│  Environment: Development                │
└─────────────────────────────────────────┘

  !  Development environment not found at /opt/ozvps-panel-dev

  Create new Development environment? (Y/n): y
  ✓  Created /opt/ozvps-panel-dev

  Press Enter to use this or paste new URL: https://your-panel-server.com

  Download and install latest update? (Y/n): y
```

## Daily Usage

### Updating Production

```bash
sudo update-ozvps
# or explicitly:
sudo update-ozvps prod
```

### Updating Development

```bash
sudo update-ozvps dev
```

### Checking Service Status

**Production:**
```bash
pm2 status ozvps-panel
pm2 logs ozvps-panel
```

**Development:**
```bash
pm2 status ozvps-panel-dev
pm2 logs ozvps-panel-dev
```

### Accessing the Applications

- **Production:** https://app.ozvps.com.au
- **Development:** https://dev.ozvps.com.au

### Restarting Services

**Production:**
```bash
pm2 restart ozvps-panel
```

**Development:**
```bash
pm2 restart ozvps-panel-dev
```

## Typical Workflow

1. **Make changes** in your development environment
2. **Deploy to dev first:**
   ```bash
   sudo update-ozvps dev
   ```
3. **Test thoroughly** at https://dev.ozvps.com.au
4. **Once satisfied, deploy to production:**
   ```bash
   sudo update-ozvps prod
   ```

## Environment Configuration

Each environment has its own configuration files:

**Production:**
- Directory: `/opt/ozvps-panel`
- Config: `/opt/ozvps-panel/.env`
- Port: 5000
- PM2 Service: `ozvps-panel`
- NGINX Config: `/etc/nginx/sites-available/ozvps-prod`

**Development:**
- Directory: `/opt/ozvps-panel-dev`
- Config: `/opt/ozvps-panel-dev/.env`
- Port: 5001
- PM2 Service: `ozvps-panel-dev`
- NGINX Config: `/etc/nginx/sites-available/ozvps-dev`

## Database Setup Options

### Option 1: Separate Databases (Recommended for Testing)

Create a separate database for dev:

```bash
# Connect to PostgreSQL
sudo -u postgres psql

# Create dev database and user
CREATE USER ozvps_dev WITH PASSWORD 'your-secure-password';
CREATE DATABASE ozvps_dev OWNER ozvps_dev;
GRANT ALL PRIVILEGES ON DATABASE ozvps_dev TO ozvps_dev;
\q
```

Edit `/opt/ozvps-panel-dev/.env`:
```
DATABASE_URL=postgresql://ozvps_dev:your-secure-password@localhost:5432/ozvps_dev
```

### Option 2: Shared Database (Same Data in Both Environments)

If you want dev to use the same database as production (not recommended for testing destructive changes):

Copy the DATABASE_URL from production:
```bash
grep DATABASE_URL /opt/ozvps-panel/.env >> /opt/ozvps-panel-dev/.env
```

## Environment Variables

Both environments need their own `.env` file. Key variables to configure:

**Production** (`/opt/ozvps-panel/.env`):
```bash
DATABASE_URL=postgresql://ozvps:password@localhost:5432/ozvps
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
VIRTFUSION_API_URL=https://your-virtfusion.com
VIRTFUSION_API_KEY=...
AUTH0_DOMAIN=...
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...
SESSION_SECRET=...
```

**Development** (`/opt/ozvps-panel-dev/.env`):
```bash
DATABASE_URL=postgresql://ozvps_dev:password@localhost:5432/ozvps_dev
STRIPE_SECRET_KEY=sk_test_...    # Use test keys!
STRIPE_PUBLISHABLE_KEY=pk_test_... # Use test keys!
VIRTFUSION_API_URL=https://your-virtfusion.com
VIRTFUSION_API_KEY=...
AUTH0_DOMAIN=...
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...
SESSION_SECRET=...
```

**Important:** Use Stripe test keys in development to avoid charging real customers!

## Troubleshooting

### Dev Environment Not Starting

Check the logs:
```bash
pm2 logs ozvps-panel-dev --lines 100
```

Check the port is available:
```bash
netstat -tulpn | grep 5001
```

### SSL Certificate Issues

Renew certificates manually:
```bash
sudo certbot renew
```

Test renewal:
```bash
sudo certbot renew --dry-run
```

### NGINX Configuration

Test NGINX config:
```bash
sudo nginx -t
```

Reload NGINX:
```bash
sudo systemctl reload nginx
```

View NGINX error logs:
```bash
sudo tail -f /var/log/nginx/error.log
```

### Database Connection Issues

Test database connection for dev:
```bash
cd /opt/ozvps-panel-dev
source .env
psql $DATABASE_URL -c "SELECT 1"
```

### Port Already in Use

If port 5001 is already in use, change it:

1. Edit NGINX config:
   ```bash
   sudo nano /etc/nginx/sites-available/ozvps-dev
   # Change proxy_pass port
   ```

2. Edit PM2 config:
   ```bash
   nano /opt/ozvps-panel-dev/ecosystem.config.cjs
   # Add PORT environment variable
   ```

3. Reload services:
   ```bash
   sudo systemctl reload nginx
   pm2 restart ozvps-panel-dev
   ```

## Advanced: Using Different VirtFusion Instances

You can configure dev to use a different VirtFusion instance or API key:

Edit `/opt/ozvps-panel-dev/.env`:
```bash
VIRTFUSION_API_URL=https://dev-virtfusion.example.com
VIRTFUSION_API_KEY=dev-api-key-here
```

This allows testing without affecting production servers.

## Removing an Environment

### Remove Development Environment

```bash
# Stop PM2 service
pm2 delete ozvps-panel-dev
pm2 save

# Remove installation directory
sudo rm -rf /opt/ozvps-panel-dev

# Remove NGINX config
sudo rm /etc/nginx/sites-enabled/ozvps-dev
sudo rm /etc/nginx/sites-available/ozvps-dev
sudo systemctl reload nginx

# Remove SSL certificate (optional)
sudo certbot delete --cert-name dev.ozvps.com.au
```

### Remove Production Environment

**Warning:** This removes your production site!

```bash
# Stop PM2 service
pm2 delete ozvps-panel
pm2 save

# Remove installation directory
sudo rm -rf /opt/ozvps-panel

# Remove NGINX config
sudo rm /etc/nginx/sites-enabled/ozvps-prod
sudo rm /etc/nginx/sites-available/ozvps-prod
sudo systemctl reload nginx

# Remove SSL certificate (optional)
sudo certbot delete --cert-name app.ozvps.com.au
```

## Quick Reference

| Action | Production | Development |
|--------|-----------|-------------|
| Update | `sudo update-ozvps` | `sudo update-ozvps dev` |
| Restart | `pm2 restart ozvps-panel` | `pm2 restart ozvps-panel-dev` |
| Logs | `pm2 logs ozvps-panel` | `pm2 logs ozvps-panel-dev` |
| Config | `/opt/ozvps-panel/.env` | `/opt/ozvps-panel-dev/.env` |
| Port | 5000 | 5001 |
| URL | https://app.ozvps.com.au | https://dev.ozvps.com.au |

## Support

For issues or questions:
- Check logs: `pm2 logs <service-name>`
- Test NGINX: `sudo nginx -t`
- Check service status: `pm2 status`
- Review this guide for common solutions
