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

### TypeScript Cleanup & Bug Fixes
1. **All TypeScript errors fixed** - Zero errors across entire codebase
2. **Blank page bug** - Fixed `isError` not being destructured in server-detail.tsx
3. **VirtFusion types** - Fixed `apiKey` → `apiToken`, `userId` → `ownerId`
4. **Stripe API version** - Updated to `2025-12-15.clover`
5. **Session types** - Added non-null assertions for `auth0UserId`

### Rate Limiting (More Lenient)
- API: 100 → 300 requests/min (dashboard polls frequently)
- Auth: 10 → 20 attempts/15min
- Public: 30 → 60 requests/min
- Wallet: 5 → 10 attempts/min

### Email Templates Redesigned
- Changed from dark mode to white/light theme
- Professional corporate styling
- Better email client compatibility (no gradients)
- Logo image restored to all templates
- Removed emojis from subject lines

### Server Status Caching
- VirtFusion cache TTL: 30s → 5s (faster status updates)
- React Query staleTime: 0 for server queries (always fresh)
- Fixes status not updating after power actions

### Update Script Fix
- Added `npm install --include=dev` for esbuild (build dependency)
- Prunes dev deps after build in production

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
