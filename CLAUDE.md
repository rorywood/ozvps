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
- `scripts/update.sh` - Simple update script
- `server/routes.ts` - All API endpoints
- `server/index.ts` - Express setup, rate limiters, middleware
- `client/src/lib/api.ts` - Frontend API client with `secureFetch`
- `shared/version.ts` - Version number and changelog

## Recent Session Work (2026-01-18)
1. **Converted to git-based updates** - No more zip downloads, no CDN cache issues
2. **Added environment badge** - Footer shows DEV (yellow) or PROD (green) + version
3. **Fixed Content-Type headers** - `secureFetch` now auto-adds `application/json`
4. **Added `/api/auth/session` endpoint** - Was missing, caused hard refresh logout bug
5. **Added rate limiting for refresh** - 15 req/10sec with "Slow down" message
6. **Fixed registration toggle** - Was failing due to missing Content-Type

## Current Version
- **App Version**: 1.10.0
- **Control Panel**: 4.1.0

## Common Issues & Solutions
1. **"getcwd: cannot access parent directories"** - Scripts now start with `cd /tmp`
2. **Hard refresh logs out user** - Fixed with `/api/auth/session` endpoint
3. **Admin API calls fail** - `secureFetch` auto-adds Content-Type now
4. **Updates get old cached code** - Now uses git, not zip downloads

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
