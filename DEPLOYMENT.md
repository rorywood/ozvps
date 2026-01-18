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
curl -fsSL https://raw.githubusercontent.com/rorywood/ozvps/main/public/install.sh | sudo bash
```

Or download and run directly:

```bash
curl -fsSL https://raw.githubusercontent.com/rorywood/ozvps/main/scripts/ozvps-install.sh -o ozvps-install.sh
sudo bash ozvps-install.sh --prod  # For production
sudo bash ozvps-install.sh --dev   # For development
```

The installer will:
1. Ask which environment (Production or Development) if no flag provided
2. Collect all configuration upfront (API keys, database, SSL, etc.)
3. Show a summary and confirm
4. Install everything automatically with progress indicators
5. Install the `ozvps` control panel command

**What it installs:**
- Node.js 20.x
- PM2 process manager
- NGINX + SSL (optional)
- PostgreSQL database
- Downloads code from appropriate GitHub branch
- Configures all services
- Installs `ozvps` control command

## Control Panel

After installation, use the `ozvps` command to manage your installation:

```bash
# Open interactive control panel menu
sudo ozvps

# Direct update (no menu)
sudo ozvps --update

# Show status dashboard
sudo ozvps --status

# Show help
sudo ozvps --help
```

**Control Panel Features:**
- Application status and health monitoring
- Database status and table count
- Live log viewing
- System resource monitoring
- One-click restart/stop
- Database migrations
- Billing job execution
- Application updates
- Database backup and restore
- SSL certificate renewal
- Configuration viewing and editing
- Email testing
- Self-updating

## Configuration

The unified installer collects all configuration during setup, so manual editing is **optional**. However, if you need to update settings later:

```bash
sudo nano /opt/ozvps-panel/.env
# Or use the control panel:
sudo ozvps  # Select option 14 (Edit .env File)
```

**Configuration Variables:**
- `DATABASE_URL` - PostgreSQL connection string
- `VIRTFUSION_PANEL_URL` - https://panel.ozvps.com.au
- `VIRTFUSION_API_TOKEN` - Your VirtFusion API token
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
# Or use the control panel:
sudo ozvps  # Select option 5 (Restart Application)
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
   sudo ozvps --update
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
   sudo ozvps --update
   ```
4. Verify at https://app.ozvps.com.au

## Update Commands

The `ozvps` command handles updates for both environments automatically:

```bash
# Interactive menu
sudo ozvps
# Select option 9 (Update Application)

# Or direct update
sudo ozvps --update
```

Updates will:
- Check for new commits
- Create a backup
- Download latest code from GitHub
- Update dependencies
- Run database migrations
- Restart PM2 service
- Verify application health

## Useful Commands

```bash
# Open control panel
sudo ozvps

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
# Use the control panel
sudo ozvps  # Select option 11 (Restore Backup)

# Or manually:
# List backups
ls -la /opt/ozvps-backups/

# Restore from backup
sudo pm2 stop ozvps-panel
sudo mv /opt/ozvps-panel /opt/ozvps-panel.failed
sudo tar -xzf /opt/ozvps-backups/pre-update_YYYYMMDD_HHMMSS.tar.gz -C /opt/ozvps-panel
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
- **Environment marker:** `/opt/ozvps-panel/.ozvps-env`
- **Branch marker:** `/opt/ozvps-panel/.ozvps-branch`
- **NGINX Config:** `/etc/nginx/sites-available/ozvps-production` or `ozvps-development`
- **PM2 Logs:** `~/.pm2/logs/`
- **Backups:** `/opt/ozvps-backups/`

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
