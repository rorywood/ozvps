# Multi-Environment Setup - Summary

✅ **Your OzVPS Panel now supports both Production and Development environments!**

## What Changed

### 1. Enhanced Update Script (`public/update-ozvps.sh`)
- Now accepts `dev` parameter for development environment
- Automatically sets up NGINX + SSL when running for the first time
- Manages separate installations for prod and dev

### 2. Multi-Environment NGINX Setup (`deploy/setup-nginx-multi.sh`)
- New script for manual NGINX configuration
- Supports setting up both environments at once
- Handles SSL certificates for both domains

### 3. Documentation
- `deploy/MULTI-ENVIRONMENT-GUIDE.md` - Complete guide
- `deploy/README-DEV-SETUP.md` - Quick start guide

## How to Use

### Simple 1-Command Setup

Since you've already pointed `dev.ozvps.com.au` to your server IP, just run:

```bash
sudo update-ozvps dev
```

This will:
1. ✅ Create `/opt/ozvps-panel-dev` directory
2. ✅ Automatically configure NGINX for `dev.ozvps.com.au`
3. ✅ Automatically get SSL certificate from Let's Encrypt
4. ✅ Download and install the application on port 5001
5. ✅ Set up PM2 service `ozvps-panel-dev`
6. ✅ Make it accessible at `https://dev.ozvps.com.au`

### Daily Workflow

```bash
# Update dev (test changes first)
sudo update-ozvps dev

# Test at https://dev.ozvps.com.au

# When satisfied, update production
sudo update-ozvps prod
```

## Environment Details

| | Production | Development |
|---|---|---|
| **Domain** | app.ozvps.com.au | dev.ozvps.com.au |
| **Port** | 5000 | 5001 |
| **Directory** | /opt/ozvps-panel | /opt/ozvps-panel-dev |
| **PM2 Service** | ozvps-panel | ozvps-panel-dev |
| **Update Command** | `sudo update-ozvps` | `sudo update-ozvps dev` |
| **Config File** | /opt/ozvps-panel/.env | /opt/ozvps-panel-dev/.env |

## Important Notes

### Separate Databases (Recommended)

Dev should use a different database to avoid interfering with production:

```bash
# Create dev database
sudo -u postgres psql
CREATE USER ozvps_dev WITH PASSWORD 'your-password';
CREATE DATABASE ozvps_dev OWNER ozvps_dev;
GRANT ALL PRIVILEGES ON DATABASE ozvps_dev TO ozvps_dev;
\q

# Configure dev environment
sudo nano /opt/ozvps-panel-dev/.env
```

Set:
```
DATABASE_URL=postgresql://ozvps_dev:your-password@localhost:5432/ozvps_dev
```

### Use Stripe TEST Keys in Dev

Edit `/opt/ozvps-panel-dev/.env` and use:
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

This prevents accidentally charging real customers during testing!

## Monitoring

```bash
# View both services
pm2 status

# View dev logs
pm2 logs ozvps-panel-dev

# View production logs
pm2 logs ozvps-panel

# Restart dev
pm2 restart ozvps-panel-dev

# Restart production
pm2 restart ozvps-panel
```

## Testing Your Dev Environment

After running `sudo update-ozvps dev`, verify:

1. **Service is running:**
   ```bash
   pm2 status ozvps-panel-dev
   ```

2. **Port is listening:**
   ```bash
   netstat -tulpn | grep 5001
   ```

3. **NGINX is configured:**
   ```bash
   cat /etc/nginx/sites-available/ozvps-dev
   ```

4. **SSL certificate is active:**
   ```bash
   sudo certbot certificates | grep dev.ozvps.com.au
   ```

5. **Site is accessible:**
   ```bash
   curl -I https://dev.ozvps.com.au
   ```

## Troubleshooting

**If dev environment doesn't work:**

```bash
# Check PM2 logs
pm2 logs ozvps-panel-dev --lines 50

# Check NGINX
sudo nginx -t
sudo systemctl status nginx

# Check SSL
sudo certbot certificates

# Check if port is available
netstat -tulpn | grep 5001
```

**If SSL fails:**

The update script will show a warning. Run manually:
```bash
sudo certbot --nginx -d dev.ozvps.com.au
```

## Next Steps

1. Run `sudo update-ozvps dev` to set up the dev environment
2. Configure `/opt/ozvps-panel-dev/.env` with appropriate settings
3. Test at `https://dev.ozvps.com.au`
4. Use dev for testing, then deploy to prod with `sudo update-ozvps prod`

## Questions?

See the detailed guides:
- [MULTI-ENVIRONMENT-GUIDE.md](deploy/MULTI-ENVIRONMENT-GUIDE.md) - Complete documentation
- [README-DEV-SETUP.md](deploy/README-DEV-SETUP.md) - Quick start guide

---

**Ready to go!** Just run `sudo update-ozvps dev` on your server. 🚀
