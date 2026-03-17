# OzVPS Panel

**Enterprise-grade VPS management platform powered by VirtFusion**

[![Security](https://img.shields.io/badge/Security-A%20(94%2F100)-success)](./SECURITY_AUDIT_REPORT.md)
[![License](https://img.shields.io/badge/License-Proprietary-blue)]()
[![Node](https://img.shields.io/badge/Node-20.x-green)]()
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%2B-blue)]()

OzVPS is a modern, secure VPS control panel that provides customers with an intuitive interface to deploy and manage virtual private servers. Built with enterprise-grade security, comprehensive billing integration, and Australian data sovereignty.

---

## 🚀 Features

### Core Functionality
- **Server Management**: Deploy, power control, reinstall, password reset
- **Multi-OS Support**: Linux (Ubuntu, Debian, Rocky, Alma) and Windows Server
- **Real-time Monitoring**: CPU, RAM, disk usage, and network statistics
- **VNC Console**: Browser-based noVNC console access
- **Billing Integration**: Automatic monthly billing, wallet system, Stripe payments
- **Support System**: Built-in ticketing with admin dashboard

### Security
- **Authentication**: Auth0 integration with 2FA support
- **CSRF Protection**: Double-submit cookie pattern with timing-safe comparison
- **SQL Injection Prevention**: Drizzle ORM with parameterized queries
- **Rate Limiting**: Comprehensive protection on all sensitive endpoints
- **Session Management**: Redis-backed sessions with idle timeout
- **Security Headers**: Helmet with HSTS, CSP, XSS protection
- **Audit Logging**: Complete audit trail for admin actions

### Infrastructure
- **Database**: PostgreSQL with Drizzle ORM
- **Cache/Sessions**: Redis (optional, falls back to memory)
- **Payments**: Stripe with SCA compliance
- **Email**: Resend for transactional emails
- **Monitoring**: Health check endpoint, structured logging

---

## 📋 Prerequisites

### Required
- **Node.js**: 20.x or higher
- **PostgreSQL**: 15 or higher
- **PM2**: For production process management
- **Nginx**: For reverse proxy and SSL termination

### Recommended
- **Redis**: For distributed session storage (required for multi-instance deployments)
- **Sentry**: For error tracking and monitoring

---

## 🔧 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/rorywood/ozvps.git
cd ozvps
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
nano .env
```

**Required Environment Variables:**

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ozvps

# Security (Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
SESSION_SECRET=<64-character hex string>
TOTP_ENCRYPTION_KEY=<64-character hex string>

# Auth0
AUTH0_DOMAIN=your-app.auth0.com
AUTH0_CLIENT_ID=<your-client-id>
AUTH0_CLIENT_SECRET=<your-client-secret>
AUTH0_WEBHOOK_SECRET=<your-webhook-secret>

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# VirtFusion
VIRTFUSION_PANEL_URL=https://your-virtfusion-panel.com
VIRTFUSION_API_TOKEN=<your-api-token>

# Email
RESEND_API_KEY=re_...
EMAIL_FROM=OzVPS <noreply@ozvps.com.au>

# Optional (Recommended for Production)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=<your-redis-password>
```

### 4. Database Setup

```bash
# Create database
createdb ozvps

# Run migrations
npm run db:push
```

### 5. Development

```bash
# Start development server (with hot reload)
npm run dev
```

Visit: http://localhost:5000

### 6. Production Build

```bash
# Build for production
npm run build

# Start with PM2
pm2 start ecosystem.config.cjs
pm2 save
```

---

## 🚢 Production Deployment

### Using the Install Script (Recommended)

```bash
# Download installer
curl -fsSL https://github.com/rorywood/ozvps/raw/main/public/install.sh -o install.sh

# Run as root
sudo bash install.sh
```

**The installer will:**
1. Install Node.js 20 and dependencies
2. Set up PostgreSQL database
3. Install Nginx with SSL support
4. Configure PM2 for process management
5. Deploy custom error pages
6. Set up automatic updates

### Manual Production Setup

See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for the deployment map and links to the install and production runbooks.

---

## 📚 Documentation

- **[Production Roadmap](./PRODUCTION_ROADMAP.md)** - 3-week plan to full production readiness
- **[Security Audit Report](./SECURITY_AUDIT_REPORT.md)** - Comprehensive security assessment
- **[API Documentation](./docs/API.md)** - Core API surfaces and auth expectations
- **[Deployment Guide](./docs/DEPLOYMENT.md)** - Deployment map and production runbooks
- **[Troubleshooting](./docs/TROUBLESHOOTING.md)** - Common issues and recovery steps

---

## 🧪 Testing

```bash
# Run test suite (when implemented)
npm test

# Run with coverage
npm run test:coverage

# E2E tests
# Not configured yet in this repository
```

**Note**: Unit tests and coverage are available today. E2E automation is still pending.

---

## 🔐 Security

### Reporting Security Issues

**DO NOT** open public GitHub issues for security vulnerabilities.

Email security issues to: **security@ozvps.com.au**

We will respond within 24 hours and provide a fix timeline.

### Security Features

- ✅ **OWASP Top 10 Protection**
- ✅ **CSRF Protection** (double-submit cookies)
- ✅ **SQL Injection Prevention** (Drizzle ORM)
- ✅ **XSS Protection** (CSP headers, output escaping)
- ✅ **Rate Limiting** (login, deployment, server actions, tickets)
- ✅ **Session Security** (httpOnly cookies, SameSite strict)
- ✅ **2FA Support** (TOTP with encrypted secrets)
- ✅ **Password Security** (delegated to Auth0)
- ✅ **Audit Logging** (all admin actions)

**Security Score**: 94/100 (A) - [View Report](./SECURITY_AUDIT_REPORT.md)

---

## 📊 Monitoring & Logs

### Health Check

```bash
curl http://localhost:5000/api/health
```

**Response:**
```json
{
  "status": "ok"
}
```

### Logs

```bash
# View application logs
pm2 logs ozvps-panel

# View with filter
pm2 logs ozvps-panel --lines 100 | grep ERROR

# Real-time monitoring
pm2 monit
```

### Recommended Monitoring

- **Uptime**: UptimeRobot, Pingdom
- **Errors**: Sentry, Rollbar
- **Performance**: New Relic, Datadog
- **Logs**: LogDNA, Papertrail

---

## 🔄 Updates

### Using the Control Panel

```bash
# Open interactive control panel
sudo ozvps

# Direct update (no menu)
sudo ozvps --update
```

The `ozvps` command works for both production and development environments automatically based on the installation.

Updates include:
- Download latest code from GitHub
- Install dependencies
- Database migrations
- Build production assets
- PM2 restart with health check
- NGINX error page updates

### Manual Updates

```bash
cd /opt/ozvps-panel
git pull origin main
npm install
npm run build
npx drizzle-kit push --force
pm2 restart ozvps-panel
```

---

## 🛠️ Maintenance

### Database Backups

```bash
# Manual backup
pg_dump ozvps > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore backup
psql ozvps < backup_YYYYMMDD_HHMMSS.sql
```

**Recommended**: Set up automated daily backups with 30-day retention.

See [docs/BACKUPS.md](./docs/BACKUPS.md) for automated backup setup.

### Cache Clearing

```bash
# Clear Redis cache (if using Redis)
redis-cli FLUSHDB

# Clear Drizzle ORM cache
rm -rf node_modules/.cache/drizzle
```

---

## 🐛 Troubleshooting

### App Won't Start

**Check environment configuration:**
```bash
npm start
```

If you see validation errors, fix the missing/invalid environment variables.

**Common issues:**
- `SESSION_SECRET too short` - Must be 32+ characters
- `DATABASE_URL invalid` - Must start with `postgresql://`
- `Missing required variable` - Check `.env` against `.env.example`

### Database Connection Errors

```bash
# Test PostgreSQL connection
psql -h localhost -U ozvps -d ozvps

# Check if PostgreSQL is running
sudo systemctl status postgresql

# View PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-*.log
```

### 502 Bad Gateway

```bash
# Check if app is running
pm2 status

# View error logs
pm2 logs ozvps-panel --err --lines 50

# Restart application
pm2 restart ozvps-panel

# Check Nginx config
sudo nginx -t
sudo systemctl status nginx
```

### Build Failures

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear build cache
rm -rf dist .vite

# Rebuild
npm run build
```

---

## 🏗️ Development

### Project Structure

```
ozvps/
├── client/              # React frontend
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Page components
│   │   ├── lib/         # API client, utilities
│   │   └── hooks/       # Custom React hooks
│   └── index.html
├── server/              # Express backend
│   ├── routes.ts        # API routes
│   ├── storage.ts       # Database operations
│   ├── auth0.ts         # Auth0 integration
│   ├── virtfusion.ts    # VirtFusion API client
│   ├── billing.ts       # Billing logic
│   └── index.ts         # Server entry point
├── shared/              # Shared types & schemas
├── db/                  # Database migrations
├── public/              # Install & update scripts
├── deploy/              # Deployment configs
│   ├── nginx-error-pages/
│   └── setup-nginx.sh
└── docs/                # Documentation

```

### Tech Stack

**Frontend:**
- React 18 with TypeScript
- TanStack Query (React Query) for data fetching
- Wouter for routing
- Tailwind CSS + Shadcn UI components
- Vite for bundling

**Backend:**
- Express.js with TypeScript
- PostgreSQL + Drizzle ORM
- Redis for sessions (optional)
- Auth0 for authentication
- Stripe for payments
- Resend for emails

**Infrastructure:**
- PM2 for process management
- Nginx for reverse proxy
- VirtFusion for virtualization

---

## 📦 Scripts

```bash
# Development
npm run dev          # Start dev server with hot reload
npm run build        # Build for production
npm run preview      # Preview production build

# Database
npm run db:generate  # Generate Drizzle migrations
npm run db:push      # Push schema to database
npm run db:studio    # Open Drizzle Studio GUI

# Code Quality
npm run check        # TypeScript type checking
npm run lint         # ESLint (when configured)
npm run format       # Prettier (when configured)

# Testing
npm test             # Run tests (when configured)
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
```

---

## 🤝 Contributing

This is a proprietary application. Contributions are by invitation only.

---

## 📄 License

Proprietary - All Rights Reserved

Copyright © 2026 OzVPS. All rights reserved.

---

## 📞 Support

- **Email**: support@ozvps.com.au
- **Website**: https://www.ozvps.com.au
- **Documentation**: https://docs.ozvps.com.au *(coming soon)*

---

## 🗺️ Roadmap

**Current Version**: Development (Pre-Production)
**Target**: Public Production Launch

### Week 1 (Current)
- ✅ Security hardening (94/100 score)
- ✅ Environment validation
- ✅ Comprehensive rate limiting
- ⏳ Testing framework setup
- ⏳ Monitoring integration

### Week 2
- Documentation completion
- Automated backups
- Performance optimization
- Load testing

### Week 3
- High availability setup
- Final security audit
- Production launch preparation

See [PRODUCTION_ROADMAP.md](./PRODUCTION_ROADMAP.md) for complete timeline.

---

## ⚡ Performance

**Target Metrics:**
- Response time: <200ms (p95)
- Uptime: 99.9%
- Concurrent users: 1000+
- Database queries: <50ms average

**Current Status:** Not yet load tested (scheduled for Week 2)

---

**Built with ❤️ in Queensland, Australia**

*Powering Australian VPS hosting with enterprise-grade technology*
