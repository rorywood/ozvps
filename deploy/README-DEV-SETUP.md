# Quick Start: Dev Environment Setup

Setting up dev.ozvps.com.au for testing changes before production deployment.

## Prerequisites

- Production already running at app.ozvps.com.au
- DNS for dev.ozvps.com.au pointing to your server
- Root SSH access to server

## 3-Step Setup

### Step 1: Configure NGINX + SSL

```bash
cd /opt/ozvps-panel/deploy
sudo bash setup-nginx-multi.sh
```

Choose option **2** (Development only) or **3** (Both), then:
- Development domain: `dev.ozvps.com.au`
- Development port: `5001` (default, just press Enter)
- Email: Your email for SSL notifications

### Step 2: Deploy Dev Environment

```bash
sudo update-ozvps dev
```

When prompted:
- If asked to create new environment: **y**
- Enter panel server URL: (your server URL)
- Confirm download: **y**

### Step 3: Configure Environment

Edit dev environment variables:

```bash
sudo nano /opt/ozvps-panel-dev/.env
```

**IMPORTANT:** Use Stripe TEST keys in dev:
```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

Restart dev:
```bash
pm2 restart ozvps-panel-dev
```

## Done! 🎉

- **Dev:** https://dev.ozvps.com.au
- **Prod:** https://app.ozvps.com.au

## Daily Usage

```bash
# Update dev (test changes here first)
sudo update-ozvps dev

# Test at https://dev.ozvps.com.au

# When ready, update production
sudo update-ozvps prod
```

## Monitoring

```bash
# Check both services
pm2 status

# View dev logs
pm2 logs ozvps-panel-dev

# View prod logs
pm2 logs ozvps-panel
```

## Troubleshooting

**Dev not accessible?**
```bash
pm2 logs ozvps-panel-dev
sudo nginx -t
sudo systemctl status nginx
```

**Port conflict?**
```bash
netstat -tulpn | grep 5001
```

**SSL issues?**
```bash
sudo certbot renew
```

---

For detailed documentation, see [MULTI-ENVIRONMENT-GUIDE.md](./MULTI-ENVIRONMENT-GUIDE.md)
