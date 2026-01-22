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
- `admin-server/routes/servers.ts` - Admin server management (provision, delete, suspend, transfer)
- `admin-client/src/pages/ProvisionServer.tsx` - Admin provision server UI
- `admin-server/middleware/ip-whitelist.ts` - Admin IP whitelist with TRUST_PROXY check
- `admin-server/middleware/csrf.ts` - CSRF protection with token rotation
- `client/src/hooks/use-system-health.ts` - System health check hook (isSystemDown flag)
- `shared/schema.ts` - Database schema (tickets now support guest tickets with `guestEmail`, `guestAccessToken`)
- `shared/version.ts` - Version number and changelog

## Recent Session Work (2026-01-23)

### Completed This Session
1. **System Health Check - Block Login When API Down**:
   - Fixed health check to detect when VirtFusion API is disabled (was only checking database)
   - Added `isSystemDown` flag that covers ALL failure scenarios (DB, VirtFusion, network errors)
   - Login form now disabled while health check loading AND when system down
   - Pre-flight health check in `api.login()` requires `status === 'ok'` explicitly
   - Fixed VirtFusion health endpoint URL (was `/connect`, should be `/api/v1/connect`)
   - Fixed VirtFusion connection check to treat ANY non-2xx as down (was only 500+)

2. **Security Audit & Fixes** (comprehensive audit of admin + frontend):
   - **CRITICAL: Path traversal vulnerability** in profile picture upload/delete
     - Added validation to prevent `../` attacks in filenames
     - Verifies resolved path stays within uploads directory
   - **HIGH: X-Forwarded-For spoofing** in admin IP whitelist
     - Now only trusts proxy headers when `TRUST_PROXY=true` env var set
     - Validates IP format before using
   - **MEDIUM: Error message disclosure** - 6 endpoints fixed
     - VirtFusion errors no longer leak internal API details
     - billing.ts, servers.ts, users.ts, health.ts now return generic messages
   - **MEDIUM: Input validation** for `reason` parameters
     - Added `sanitizeReason()` function (max 500 chars, trimmed)
     - Applied to: block, suspend, wallet adjust, server delete, admin-suspend
   - **MEDIUM: CSRF token rotation** - Added tracking infrastructure
     - Tokens now track creation time in Redis/memory
     - Support for 2-hour rotation checks

### Security Audit Summary (for reference)
**Secure practices found:**
- CSRF double-submit pattern with timing-safe comparison
- Stripe webhook signature verification
- Session idle timeout (15 min)
- 2FA mandatory for admin
- Password/token redaction in logs
- CSP/HSTS headers configured
- No `dangerouslySetInnerHTML` in sensitive areas

### Previous Session (2026-01-22 - Session 2)
1. **Admin provision server fixes**:
   - Fixed VirtFusion user auto-creation using correct email (was using auth0UserId like `auth0|123456`)
   - Fixed hypervisor group ID (was 1, should be 2 for Brisbane)
   - Added location selector with country flags
   - Fixed email "undefined server" issue - now fetches OS name from templates
2. **Bandwidth limit exceeded text** - Made warning more prominent (larger text, icon, padding)
3. **VirtFusion API error details** - Now shows actual validation errors instead of just "422 Unprocessable Content"
4. **Admin delete process** - Now creates cancellation request (immediate mode, 5 min delay) instead of directly deleting, so servers show "deleting" status like client-side deletion
5. **Ticket status email notifications** - Added null checks for guest tickets (no auth0UserId)

### Previous Session (2026-01-22 - Session 1)
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

### Admin Panel
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

**Admin Provision Server:**
- Select user by search (email/name)
- Auto-creates VirtFusion user if not synced
- Select plan, hostname, OS, location (with flags)
- Option for free server (no billing)
- Sends credentials email to user
- Location config in `admin-server/routes/servers.ts` (LOCATION_CONFIG)

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
- [x] Security audit - DONE (path traversal, X-Forwarded-For, error disclosure, input validation)
- [x] Block login when API down - DONE (health check now covers VirtFusion + database)

## Notes for Claude
- User prefers direct, concise responses
- Push fixes to `main` branch only (user requested no dev branch for production)
- User gets frustrated with repeated issues - triple-check fixes
- The `.ozvps-branch` file on servers determines which branch to pull from
- Email templates must be white/light themed (dark mode breaks emails)
