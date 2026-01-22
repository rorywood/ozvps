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
- `scripts/ozvps` - Control panel CLI (v4.2.0, git-based updates with auto db:push)
- `scripts/ozvps-install.sh` - Fresh install script (git clone based)
- `server/routes.ts` - All API endpoints (49 admin routes with `requireAdmin` middleware)
- `server/index.ts` - Express setup, rate limiters, middleware
- `server/virtfusion.ts` - VirtFusion API client with stale cache fallback
- `server/cancellation-processor.ts` - Server cancellation with orphan cleanup
- `server/webhookHandlers.ts` - Stripe webhook processing
- `server/email.ts` - All email templates (ticket confirmation, guest ticket, admin notification, etc.)
- `client/src/lib/api.ts` - Frontend API client with `secureFetch`
- `client/src/pages/server-detail.tsx` - Server detail page with React Query
- `client/src/pages/guest-ticket.tsx` - Public guest ticket viewing page
- `shared/schema.ts` - Database schema (tickets now support guest tickets with `guestEmail`, `guestAccessToken`)
- `shared/version.ts` - Version number and changelog

## Recent Session Work (2026-01-22)

### Completed This Session
1. **Email verification on different device** - Removed AuthGuard from /verify-email route, works without being logged in
2. **Sign out button fix** - Fixed verify-email page logout button not ending session properly
3. **Username ban "Darius"** - Server + client-side validation blocks registration with this name
4. **Bandwidth warning visibility** - Made "Approaching Bandwidth Limit" warning larger and more readable
5. **Support page improvements** - Added collapsible FAQ section with common questions, hides when creating ticket
6. **Ticket confirmation emails** - Sends email to user when they create a support ticket
7. **Full email support system** - Complete inbound email handling:
   - Webhook at `/api/hooks/resend-inbound` receives emails to support@ozvps.com.au
   - Creates new tickets from email (links to account if user exists)
   - Guest tickets for non-users with unique access tokens
   - Email replies add to existing tickets (parses [Ticket #123] in subject)
   - Reply-to address `support+{id}@ozvps.com.au` for threading
8. **Guest ticket viewing** - Public page at `/support/guest/:accessToken` for non-users to view/reply to tickets

### Resend Inbound Email Setup
- MX record: `ozvps.com.au` → `inbound-smtp.ap-northeast-1.amazonaws.com` (priority 10)
- Webhook URL: `https://app.ozvps.com.au/api/hooks/resend-inbound`
- Reply-to format: `support+{ticketId}@ozvps.com.au`

### Previous Session (2026-01-22)
1. **Security tables** - Added login_attempts, account_lockouts, user_audit_logs tables and session binding
2. **Disk usage color thresholds** - Yellow at 60%, red at 85%
3. **Server card disk display fix** - Was showing percentage as GB
4. **Admin suspend bug fix** - Was showing "User not found" for Auth0 API errors (rate limits, etc.)
5. **CRITICAL: Billing bug fixes**:
   - Promo refund mismatch - was refunding full price instead of discounted (FREE MONEY BUG!)
   - Promo usage tracking - now records before provisioning, aborts if fails
   - Promo race condition - atomic increment with limit check
   - Unsuspend failure - now refunds if VirtFusion unsuspend fails
6. **Promotional codes feature** - Fully implemented

### Previous Session (2026-01-21)
1. **Plan name on server cards** - Added plan name display to dashboard, servers page, and server detail sidebar
2. **Admin ticket email notifications** - Sends email to `ADMIN_NOTIFICATION_EMAIL` when new support ticket submitted
3. **Admin ticket management** - Added status/priority/category dropdowns, reopen/close/delete functionality
4. **Profile picture upload** - Base64 image upload to account settings
5. **Email verification fixes** - Fixed duplicate emails, added auto-redirect after verification
6. **VirtFusion user deletion** - Fixed to use correct API endpoint

### Pending Tasks
1. **Security features** - Implement actual lockout logic and audit logging (tables exist, logic pending)
2. **Disk usage investigation** - VirtFusion's `physical` field shows disk image size, not filesystem usage (may need different field)

### Admin Panel (COMPLETED - 2026-01-19)
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

### Previous Work (2026-01-19)
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
- [ ] Security features - implement lockout logic and audit logging (tables ready)
- [ ] Disk usage - VirtFusion returns disk image size, not actual filesystem usage (need to investigate)
- [x] Admin suspend account bug - FIXED (was returning "User not found" for Auth0 API errors)
- [x] Promotional codes feature - DONE
- [x] Email support system - DONE (inbound webhook, guest tickets, email replies)
- [x] Username ban "Darius" - DONE

## Notes for Claude
- User prefers direct, concise responses
- Push fixes to `main` branch only (user requested no dev branch for production)
- User gets frustrated with repeated issues - triple-check fixes
- The `.ozvps-branch` file on servers determines which branch to pull from
- Email templates must be white/light themed (dark mode breaks emails)
