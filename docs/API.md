# API Overview

This repository exposes two main HTTP surfaces:

- `server/index.ts`
  Customer-facing panel APIs under `/api`
- `admin-server/index.ts`
  Admin panel APIs under `/api`

## Customer API

Key route groups are registered in [server/routes.ts](../server/routes.ts):

- Authentication and session routes
- Server lifecycle routes
- Billing, wallet, and Stripe routes
- Ticketing and support routes
- User profile and 2FA routes

### Auth model

- Browser sessions are cookie-based.
- CSRF protection is enforced with an `ozvps_csrf` cookie and matching `X-CSRF-Token` header on mutating requests.
- Admin-only routes in the customer API require both an authenticated session and admin checks.

### Common response conventions

- `401` for missing or expired sessions
- `403` for permission or ownership failures
- `409` for conflicting state, such as duplicate cards or in-progress server actions
- `503` and `504` when upstream infrastructure is unavailable or timing out

## Admin API

Key route groups are split under `admin-server/routes/`:

- `auth.ts`
- `users.ts`
- `servers.ts`
- `billing.ts`
- `tickets.ts`
- `security.ts`
- `audit.ts`

### Admin access requirements

- Admin authentication
- CSRF protection
- IP whitelist enforcement, unless the whitelist is still empty during bootstrap

## Webhooks and health endpoints

- Stripe webhook: `/api/stripe/webhook`
- Customer health: `/api/health`
- Admin load-balancer health: `/healthz`

## Source of truth

When this document and the code disagree, treat the route implementations as the source of truth and update this file in the same change.
