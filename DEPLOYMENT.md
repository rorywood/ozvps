# OzVPS Deployment Guide

Simple deployment workflow for OzVPS Panel - separate production and development servers.

## Architecture

**Two Separate Servers:**
- **Production Server:** Runs `main` branch at `app.ozvps.com.au`
- **Development Server:** Runs `claude/dev-l5488` branch at `dev.ozvps.com.au`

**No merging required** - push directly to the branch you want to deploy.

## Initial Installation

### Quick Start (Recommended)

Use the **unified installer** that works for both production and development:

```bash
curl -sSL https://raw.githubusercontent.com/rorywood/ozvps/main/public/install.sh | sudo bash
```

The installer will:
1. Ask which environment (Production or Development)
2. Collect all configuration upfront (API keys, database, SSL, etc.)
3. Show a summary and confirm
4. Install everything automatically with progress indicators

**What it installs:**
- ✅ Node.js 20.x
- ✅ PM2 process manager
- ✅ NGINX + SSL (optional)
- ✅ PostgreSQL database
- ✅ Downloads code from appropriate GitHub branch
- ✅ Configures all services
- ✅ Installs update command

### Alternative: Environment-Specific Installers

If you prefer separate installers:

**Production Server:**
```bash
curl -sSL https://raw.githubusercontent.com/rorywood/ozvps/main/public/install-prod.sh | sudo bash
```

**Development Server:**
```bash
curl -sSL https://raw.githubusercontent.com/rorywood/ozvps/claude/dev-l5488/public/install-dev.sh | sudo bash
```

## Configuration

The unified installer collects all configuration during setup, so manual editing is **optional**. However, if you need to update settings later:

```bash
sudo nano /opt/ozvps-panel/.env
```

**Configuration Variables:**
- `DATABASE_URL` - PostgreSQL connection string
- `VIRTFUSION_API_URL` - https://panel.ozvps.com.au
- `VIRTFUSION_API_KEY` - Your VirtFusion API key
- `STRIPE_SECRET_KEY` - Stripe API key (TEST for dev, LIVE for prod)
- `STRIPE_PUBLISHABLE_KEY` - Stripe public key
- `AUTH0_*` - Auth0 authentication settings

**Important:**
- Production uses LIVE Stripe keys
- Development uses TEST Stripe keys
- Use separate databases for prod and dev

After editing, restart the application:

```bash
sudo pm2 restart ozvps-panel
```

## Daily Workflow

### Making Changes

**For Development:**
1. Make your code changes
2. Push directly to `claude/dev-l5488` branch:
   ```bash
   git add .
   git commit -m "Your changes"
   git push origin claude/dev-l5488
   ```
3. Update dev server:
   ```bash
   ssh dev-server
   sudo update-ozvps-dev
   ```
4. Test at https://dev.ozvps.com.au

**For Production:**
1. Make your code changes
2. Push directly to `main` branch:
   ```bash
   git add .
   git commit -m "Your changes"
   git push origin main
   ```
3. Update production server:
   ```bash
   ssh prod-server
   sudo update-ozvps-prod
   ```
4. Verify at https://app.ozvps.com.au

## Update Commands

**Production Server:**
```bash
sudo update-ozvps-prod
```

**Development Server:**
```bash
sudo update-ozvps-dev
```

Both commands will:
- Create a backup
- Download latest code from GitHub
- Update dependencies
- Restart PM2 service

## Useful Commands

```bash
# Check application status
pm2 status

# View logs
pm2 logs ozvps-panel

# Restart application
pm2 restart ozvps-panel

# Check NGINX status
sudo systemctl status nginx

# Test NGINX configuration
sudo nginx -t

# Renew SSL certificates
sudo certbot renew --dry-run
```

## Rollback

If you need to rollback to a previous version:

```bash
# List backups
ls -la /opt/ozvps-panel.backup.*

# Restore from backup
sudo pm2 stop ozvps-panel
sudo mv /opt/ozvps-panel /opt/ozvps-panel.failed
sudo cp -r /opt/ozvps-panel.backup.YYYYMMDDHHMMSS /opt/ozvps-panel
sudo pm2 restart ozvps-panel
```

## Troubleshooting

**Application not starting:**
```bash
pm2 logs ozvps-panel --lines 50
```

**Check if port is in use:**
```bash
netstat -tulpn | grep 3000
```

**Database connection issues:**
```bash
# Test database connection
psql "$DATABASE_URL" -c "SELECT 1"
```

**NGINX issues:**
```bash
sudo nginx -t
sudo systemctl status nginx
cat /var/log/nginx/error.log
```

## Architecture Details

### File Locations
- **Application:** `/opt/ozvps-panel`
- **Configuration:** `/opt/ozvps-panel/.env`
- **NGINX Config:** `/etc/nginx/sites-available/ozvps-prod` or `ozvps-dev`
- **PM2 Logs:** `~/.pm2/logs/`
- **Backups:** `/opt/ozvps-panel.backup.*`

### Ports
- **Application:** 3000 (internal)
- **NGINX:** 80 → 443 (external)

### Services
- **PM2 Service:** `ozvps-panel`
- **NGINX Service:** `nginx`
- **Database:** PostgreSQL (separate instance)

## Support

For issues or questions, check:
- Application logs: `pm2 logs ozvps-panel`
- NGINX logs: `/var/log/nginx/error.log`
- System logs: `journalctl -xe`
