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

## Recent Session Work (2026-01-18)

### Security Hardening (Production Ready)
1. **Admin middleware consistency** - All 49 admin endpoints now use `requireAdmin` middleware
2. **CSRF security** - Removed localStorage fallback, tokens stored in cookies only
3. **parseInt radix** - Added radix parameter to all parseInt() calls
4. **Destructive action confirmations** - Admin delete/transfer actions require `confirmAction: true`
5. **Large wallet adjustments** - Adjustments over $100 require confirmation
6. **Stripe webhook validation** - Rejects test mode webhooks in production (throws 400)
7. **Auth0 cache TTL** - Reduced from 30s to 10s for faster user state updates

### Bug Fixes
1. **"Server not found" flash** - Fixed React Query showing error on background refetch failures
   - Changed condition from `isError || !server` to just `!server`
   - Added retry: 2 and retryDelay: 1000ms for resilience
2. **Stale cache fallback** - Server detail API returns stale cached data if VirtFusion times out
3. **Orphaned cancellations** - Auto-completes cancellations when server already deleted from VirtFusion

### Previous Work
- Converted to git-based updates (no more zip/CDN cache issues)
- Added environment badge (DEV yellow / PROD green)
- Fixed Content-Type headers in `secureFetch`
- Added `/api/auth/session` endpoint
- Fixed registration toggle

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
- Always push fixes to BOTH branches (dev first, then main)
- Test on dev before deploying to prod
- User gets frustrated with repeated issues - triple-check fixes
- The `.ozvps-branch` file on servers determines which branch to pull from
