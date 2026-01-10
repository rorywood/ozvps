# OzVPS Deployment Workflow

Quick reference for deploying to dev and production environments.

## Overview

- **Development Branch:** `claude/dev-l5488` → deploys to `dev.ozvps.com.au`
- **Production Branch:** `main` → deploys to `app.ozvps.com.au`

## Initial Setup (One Time)

### Option 1: Quick Setup Script

```bash
# On your server
curl -sSL https://raw.githubusercontent.com/rorywood/ozvps/claude/dev-l5488/deploy/setup-ozvps-environments.sh | sudo bash
```

### Option 2: Manual Setup

```bash
# Install update script
sudo curl -sSL https://raw.githubusercontent.com/rorywood/ozvps/claude/dev-l5488/public/update-ozvps.sh \
  -o /usr/local/bin/update-ozvps
sudo chmod +x /usr/local/bin/update-ozvps

# Set up dev environment
sudo update-ozvps dev

# Set up production environment
sudo update-ozvps prod
```

## Daily Workflow

### 1. Make Changes

```bash
# Work on dev branch
git checkout claude/dev-l5488

# Make your changes
# ... edit files ...

# Commit
git add .
git commit -m "Your changes"
git push origin claude/dev-l5488
```

### 2. Deploy to Dev

**On your hosting platform:**
- Deploy the `claude/dev-l5488` branch to your dev server

**On your server:**
```bash
sudo update-ozvps dev
```

Visit `https://dev.ozvps.com.au` to test.

### 3. Deploy to Production (When Ready)

**Merge dev to main:**
```bash
git checkout main
git merge claude/dev-l5488
git push origin main
```

**On your hosting platform:**
- Deploy the `main` branch to your production server

**On your server:**
```bash
sudo update-ozvps prod
```

Visit `https://app.ozvps.com.au` to verify.

## Quick Commands

```bash
# Update dev environment
sudo update-ozvps dev

# Update production environment
sudo update-ozvps prod
# or just:
sudo update-ozvps

# Check status
pm2 status

# View logs
pm2 logs ozvps-panel        # Production
pm2 logs ozvps-panel-dev    # Development

# Restart services
pm2 restart ozvps-panel      # Production
pm2 restart ozvps-panel-dev  # Development
```

## Environment Configuration

### Production (`/opt/ozvps-panel/.env`)
```bash
DATABASE_URL=postgresql://ozvps:password@localhost:5432/ozvps
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
VIRTFUSION_API_URL=https://your-virtfusion.com
VIRTFUSION_API_KEY=...
# ... other production configs
```

### Development (`/opt/ozvps-panel-dev/.env`)
```bash
DATABASE_URL=postgresql://ozvps_dev:password@localhost:5432/ozvps_dev
STRIPE_SECRET_KEY=sk_test_...          # ⚠️ Use TEST keys!
STRIPE_PUBLISHABLE_KEY=pk_test_...     # ⚠️ Use TEST keys!
VIRTFUSION_API_URL=https://your-virtfusion.com
VIRTFUSION_API_KEY=...
# ... other dev configs
```

**Important:** Always use Stripe TEST keys in dev to avoid charging real customers!

## Deployment Architecture

```
GitHub
├── main (production branch)
│   └── Deployed to: Production Server
│       └── Updates: app.ozvps.com.au (port 5000)
│
└── claude/dev-l5488 (development branch)
    └── Deployed to: Dev Server (can be same or separate server)
        └── Updates: dev.ozvps.com.au (port 5001)
```

## Rollback

If production has issues:

```bash
# On GitHub, revert the merge
git revert HEAD
git push origin main

# Deploy the reverted main branch on your hosting platform

# Update production
sudo update-ozvps prod
```

## Tips

1. **Always test in dev first** before merging to main
2. **Use different Stripe keys** (test vs live)
3. **Consider separate databases** for dev and prod
4. **Monitor PM2 logs** after deployments
5. **Keep dev and prod configs in sync** (except sensitive keys)

## Troubleshooting

**Dev not updating?**
```bash
pm2 logs ozvps-panel-dev --lines 50
sudo systemctl status nginx
sudo nginx -t
```

**Port conflicts?**
```bash
netstat -tulpn | grep 5001
```

**SSL issues?**
```bash
sudo certbot certificates
sudo certbot renew --dry-run
```

**Database issues?**
```bash
# Check if databases exist
sudo -u postgres psql -l

# Check connections
cd /opt/ozvps-panel-dev
source .env
psql $DATABASE_URL -c "SELECT 1"
```

## Support

For detailed setup, see:
- [MULTI-ENVIRONMENT-GUIDE.md](deploy/MULTI-ENVIRONMENT-GUIDE.md)
- [README-DEV-SETUP.md](deploy/README-DEV-SETUP.md)
