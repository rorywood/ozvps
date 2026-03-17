# Deployment Guide

This repository has three deployment-oriented documents:

- [INSTALL.md](../INSTALL.md)
  Fresh-machine setup and first install workflow
- [DEPLOYMENT.md](../DEPLOYMENT.md)
  Production-oriented deployment notes and operational checklist
- [ecosystem.config.cjs](../ecosystem.config.cjs)
  PM2 process definition used after the build step

## Typical production flow

1. Copy `.env.example` to `.env` and set all production secrets.
2. Install dependencies with `npm install`.
3. Run database setup with `npm run db:push`.
4. Build the app with `npm run build`.
5. Start the panel with `pm2 start ecosystem.config.cjs`.
6. Put nginx in front of the app and set `TRUST_PROXY=true` when requests pass through the reverse proxy.

## Customer and admin services

- Customer panel defaults to port `5000`
- Admin panel defaults to port `5001`

If you deploy behind nginx or Cloudflare, make sure the reverse proxy forwards client IP headers consistently so rate limiting and allowlists behave correctly.

## Post-deploy checks

- `GET /api/health` returns `{"status":"ok"}`
- Login works for a normal user
- Admin login works from an allowed IP
- Stripe publishable key endpoint returns a configured key
- Billing and background processors start without migration errors

## Updating safely

1. Pull the latest code.
2. Run `npm install`.
3. Run `npm run check` and `npm test`.
4. Run `npm run db:push` if the schema changed.
5. Rebuild and restart PM2.
