# Claude Context File
> This file helps Claude remember project context between sessions. Read this first!

## Project Overview
**OzVPS Panel** - A VPS management panel built with:
- **Frontend**: React + Vite + TypeScript + Tailwind + shadcn/ui
- **Backend**: Express + TypeScript + Drizzle ORM
- **Database**: PostgreSQL
- **Auth**: Auth0
- **Payments**: Stripe (prepaid wallet system)
- **VPS Provider**: VirtFusion API integration

## Environments
| Environment | Domain | Branch | Server |
|-------------|--------|--------|--------|
| Production | app.ozvps.com.au | `main` | 103.75.119.183 |
| Development | dev.ozvps.com.au | `claude/dev-l5488` | Different server |

## Key Files
- `scripts/ozvps` - Control panel CLI (v4.1.0, git-based updates)
- `scripts/ozvps-install.sh` - Fresh install script (git clone based)
- `server/routes.ts` - All API endpoints (49 admin routes with `requireAdmin` middleware)
- `server/index.ts` - Express setup, rate limiters, middleware
- `server/virtfusion.ts` - VirtFusion API client with stale cache fallback
- `server/cancellation-processor.ts` - Server cancellation with orphan cleanup
- `server/webhookHandlers.ts` - Stripe webhook processing
- `client/src/lib/api.ts` - Frontend API client with `secureFetch`
- `client/src/pages/server-detail.tsx` - Server detail page with React Query
- `shared/version.ts` - Version number and changelog

## Recent Session Work (2026-01-19)

### Admin Panel Implementation (IN PROGRESS)
Separate admin panel at `admin.ozvps.com.au` on port 5001.

**Architecture:**
- `admin-server/` - Express backend on port 5001
- `admin-client/` - Vite React frontend
- NGINX proxies admin.ozvps.com.au → localhost:5001
- Same database, separate sessions table (`admin_sessions`)

**Auth Flow:**
1. Auth0 password verification (Resource Owner Password Grant)
2. Check `app_metadata.is_admin = true` in Auth0
3. Mandatory 2FA verification
4. IP whitelist (bootstrap mode: allow all if whitelist empty)

**Files Created:**
- `admin-server/index.ts` - Express entry point
- `admin-server/routes/auth.ts` - Login with 2FA
- `admin-server/routes/users.ts`, `servers.ts`, `billing.ts`, `tickets.ts`
- `admin-server/middleware/admin-auth.ts` - Session validation, uses Auth0 API
- `admin-server/middleware/ip-whitelist.ts` - IP filtering
- `admin-client/src/` - Full React frontend

**Current Issue (DEBUGGING):**
2FA verification failing with: `Invalid Base32 string: Unknown letter: "9"`
- The 2FA secret in database for `rorywood11@gmail.com` may not be Base32 encoded
- Auth0 user ID: `auth0|695de54b76e4c65171b58b57`
- otplib import fixed (use `verifySync` from 'otplib')
- Need to check what format the 2FA secret is stored in

**Key Changes Made:**
- Removed hardcoded admin email list - now uses Auth0 `app_metadata.is_admin`
- Removed database user_mappings requirement - all user data from Auth0
- Only database dependency is 2FA secrets (stored in `two_factor_auth` table)

### Previous Work (Earlier 2026-01-19)
- TypeScript cleanup, all errors fixed
- Rate limiting adjustments
- Email templates redesigned (white/light theme)
- Server status caching improvements
- Update script fixes

### Previous Session (2026-01-18)
- Security hardening (admin middleware, CSRF, confirmations)
- "Server not found" flash fix
- Stale cache fallback
- Git-based updates

## Current Version
- **App Version**: 1.10.0
- **Control Panel**: 4.1.0

## Common Issues & Solutions
1. **"getcwd: cannot access parent directories"** - Scripts now start with `cd /tmp`
2. **Hard refresh logs out user** - Fixed with `/api/auth/session` endpoint
3. **Admin API calls fail** - `secureFetch` auto-adds Content-Type now
4. **Updates get old cached code** - Now uses git, not zip downloads
5. **"Server not found" flash** - Fixed: don't show error if cached data exists
6. **Stuck cancellations** - Auto-cleaned if server already deleted from VirtFusion

## Update Commands
```bash
# Dev server
cd /tmp && ozvps --update

# Prod server
cd /tmp && ozvps --update

# If ozvps command not found
curl -fsSL https://raw.githubusercontent.com/rorywood/ozvps/main/scripts/ozvps -o /usr/local/bin/ozvps
chmod +x /usr/local/bin/ozvps
```

## Git Workflow
```bash
# Always push to dev first, test, then merge to main
git push origin claude/dev-l5488
git checkout main && git merge claude/dev-l5488 && git push origin main
git checkout claude/dev-l5488
```

## TODO / Known Issues
- [ ] None currently tracked

## Notes for Claude
- User prefers direct, concise responses
- Push fixes to `main` branch only (user requested no dev branch for production)
- User gets frustrated with repeated issues - triple-check fixes
- The `.ozvps-branch` file on servers determines which branch to pull from
- Email templates must be white/light themed (dark mode breaks emails)
