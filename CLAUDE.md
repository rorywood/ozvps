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

## Design System

### Tech Stack
- **Tailwind CSS v4** (not v3 - uses `@theme inline` syntax)
- **shadcn/ui components** (Radix UI primitives)
- **Lucide React icons**
- **React Query** for data fetching

### Fonts
```css
--font-sans: 'Inter', sans-serif;        /* Body text */
--font-display: 'Outfit', sans-serif;    /* Headings */
--font-mono: 'JetBrains Mono', monospace; /* Code/IPs */
```

### Dark Theme Colors (Default)
```css
/* Backgrounds */
--background: hsl(216 33% 6%);        /* #0a0d14 - darkest */
--card: hsl(216 28% 7%);              /* #0d1117 - cards/surfaces */
--popover: hsl(215 21% 11%);          /* #161b22 - elevated */

/* Text */
--foreground: hsl(0 0% 100%);         /* White - primary text */
--muted-foreground: hsl(0 0% 65%);    /* #a6a6a6 - secondary text */

/* Primary - OzVPS Blue */
--primary: hsl(210 100% 50%);         /* #0080ff */

/* Accent - Cyan */
--accent-foreground: hsl(190 100% 50%); /* #00d4ff */

/* Borders */
--border: hsl(0 0% 100% / 0.08);      /* white at 8% opacity */

/* Status Colors */
--success: hsl(160 84% 39%);          /* emerald */
--destructive: hsl(0 84% 60%);        /* red */
--warning: hsl(14 100% 60%);          /* orange */
```

### Component Patterns
```jsx
/* Standard Card */
<div className="bg-card rounded-xl p-6 border border-border">

/* Glass Card (special effects) */
<div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl">

/* Section Label */
<p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Label</p>

/* Stats Display */
<span className="text-2xl font-bold text-foreground">42%</span>
<span className="text-sm text-muted-foreground">of 100 GB</span>

/* Icon + Text Row */
<div className="flex items-center gap-2 text-muted-foreground">
  <Cpu className="h-4 w-4" />
  <span>4 vCPU</span>
</div>

/* Layout: Sidebar + Main */
<div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
  <div className="space-y-4">{/* Sidebar */}</div>
  <div className="space-y-6">{/* Main content */}</div>
</div>
```

### Border Radius
```css
--radius-sm: 0.25rem;  /* rounded */
--radius-md: 0.5rem;   /* rounded-lg */
--radius-lg: 0.75rem;  /* rounded-xl */
```

### Key Style File
- `client/src/index.css` - All theme variables, component classes, typography

## Key Files
- `scripts/ozvps` - Control panel CLI (v4.2.0, git-based updates with auto db:push)
- `scripts/ozvps-install.sh` - Fresh install script (git clone based)
- `server/routes.ts` - All API endpoints (49 admin routes with `requireAdmin` middleware)
- `server/index.ts` - Express setup, rate limiters, middleware
- `server/virtfusion.ts` - VirtFusion API client with stale cache fallback
- `server/billing.ts` - Monthly billing job, chargeServer(), retryUnpaidServers()
- `server/cancellation-processor.ts` - Server cancellation with orphan cleanup
- `server/trial-processor.ts` - Trial expiration and cleanup (runs via billing processor)
- `server/webhookHandlers.ts` - Stripe webhook processing
- `server/email.ts` - All email templates (ticket confirmation, guest ticket, admin notification, etc.)
- `client/src/lib/api.ts` - Frontend API client with `secureFetch`
- `client/src/pages/server-detail.tsx` - Server detail page with React Query
- `client/src/pages/guest-ticket.tsx` - Public guest ticket viewing page
- `client/src/contexts/provision-tracker.tsx` - Global provision tracking context (localStorage + polling)
- `client/src/components/provision-progress-widget.tsx` - Floating bottom-right provisioning widget
- `admin-server/routes/servers.ts` - Admin server management (provision, delete, suspend, transfer)
- `admin-client/src/pages/ProvisionServer.tsx` - Admin provision server UI
- `admin-server/middleware/ip-whitelist.ts` - Admin IP whitelist with TRUST_PROXY check
- `admin-server/middleware/csrf.ts` - CSRF protection with token rotation
- `admin-server/routes/security.ts` - Admin reCAPTCHA configuration endpoints
- `client/src/hooks/use-system-health.ts` - System health check hook (isSystemDown, isRateLimited flags)
- `client/src/hooks/use-reinstall-task.ts` - Per-page build status polling hook (server-detail checklist)
- `client/src/components/setup-progress-checklist.tsx` - Provisioning checklist UI component
- `client/public/novnc/` - Native noVNC v1.5.0 files with OzVPS branding
- `shared/schema.ts` - Database schema (tickets support guest tickets with `guestEmail`, `guestAccessToken`)
- `shared/version.ts` - Version number and changelog
- `admin-client/src/pages/Deletions.tsx` - Admin page for approving/recovering server deletion requests

## Recent Session Work (2026-03-13 - Session 2)

### Completed This Session
1. **Transaction Labels Improved** - Admin wallet adjustments now show meaningful titles:
   - `adjustment_credit`/`adjustment_debit` types now show the admin's typed description as the title
   - Sub-line shows "Note: [reason] · By: [admin email]" instead of nothing
   - Admin Users panel: same rich display with server name, reason, adjustedBy fields
   - Admin wallet adjust endpoint: fixed to use atomic SQL (`balanceCents + amount`) instead of read-then-write race condition
   - Files: `client/src/pages/billing.tsx`, `admin-client/src/pages/Users.tsx`, `admin-server/routes/users.ts`

2. **Provision Widget Auto-Dismiss Fixed** - Widget now actually disappears after 30 seconds:
   - Was using a `useEffect` dependent on provisions state changing — but polling stops when complete so state never changed again
   - Fixed with a dedicated 5-second `setInterval` that always checks for stale completed provisions
   - File: `client/src/contexts/provision-tracker.tsx`

3. **Server-Detail Checklist Auto-Dismiss** - No longer requires clicking "Continue to Server":
   - Added 20-second auto-dismiss when `reinstallTask.status === 'complete'`
   - Automatically clears sessionStorage flags and invalidates queries
   - File: `client/src/pages/server-detail.tsx`

4. **Admin Deletion Approval Workflow** - Server deletions now require admin approval:
   - User requests deletion → status `pending_approval` (NOT processed by cancellation processor)
   - Server-detail shows orange "Pending Admin Review" card with support ticket link
   - New admin panel **Deletions** page lists all pending requests
   - Admin can **Approve** (schedules deletion 1 hour from now → status `pending`) or **Recover** (revokes → server stays alive)
   - Files: `server/routes.ts`, `server/storage.ts`, `admin-server/routes/servers.ts`, `admin-client/src/pages/Deletions.tsx`, `client/src/pages/server-detail.tsx`
   - `serverCancellations.status` values: `pending_approval` → `pending` → `processing` → `completed` (or `revoked`)

5. **Provisioning Checklist Progress Fixed** - Checklist steps now actually progress:
   - Root cause: `getServerBuildStatus` returns simplified `phase` ('queued'|'building'|'complete'|'error') AND raw `state` from VirtFusion ('provisioning', 'installing', etc.)
   - Both `use-reinstall-task.ts` and `provision-tracker.tsx` were mapping `phase` — 'building' never matched any step keyword so progress was stuck
   - Fix: now uses `state || phase` so VirtFusion's actual states drive the checklist steps
   - Steps: queued → provisioning → imaging → installing → configuring → complete
   - Files: `client/src/hooks/use-reinstall-task.ts`, `client/src/contexts/provision-tracker.tsx`

### Previous Session (2026-03-13 - Session 1)
1. **Email OTP Timing-Safe Comparison** - Fixed timing attack vulnerability:
   - OTP comparison now uses `crypto.timingSafeEqual()` with Buffer comparison
   - Only compares when buffer lengths match (prevents length oracle attacks)
   - File: `server/routes.ts`

2. **Single-Use Email Verification Tokens** - Tokens can no longer be reused:
   - Backend returns 400 with `alreadyVerified: true` on reuse (was 200 success)
   - Frontend `verify-email.tsx` handles three states: success / already-used / error
   - `already-used` state shows "Go to Login" button
   - Error state shows "Request a new verification email" button linking to `/verify-email`

3. **Admin Panel Complete Redesign** - Total visual overhaul matching OzVPS dark theme:
   - `admin-client/src/index.css` - Complete rewrite with OzVPS brand colors
   - `admin-client/src/components/Layout.tsx` - New sidebar with blue active states, page titles, user info at bottom
   - New UI component library: `button.tsx`, `dialog.tsx`, `badge.tsx`, `input.tsx`, `label.tsx`, `textarea.tsx`
   - `admin-client/src/components/ui/confirm-dialog.tsx` - Reusable ConfirmDialog (replaces `confirm()`)
   - `admin-client/src/components/ui/prompt-dialog.tsx` - Reusable PromptDialog (replaces `prompt()`)
   - Replaced ALL native browser `confirm()`/`prompt()` calls across 6 pages:
     - Users.tsx: suspend, block, revoke sessions, adjust wallet
     - Servers.tsx: suspend, end trial, delete
     - Billing.tsx: cleanup orphaned, end trial, suspend server
     - Tickets.tsx: delete ticket
     - PromoCodes.tsx: delete promo code
     - Whitelist.tsx: add IP (with label), delete entry
   - Applied OzVPS dark theme to Dashboard, Health, Logs, Security pages

4. **Admin Center Link Fix** - Was pointing to internal `/admin` route (404):
   - Fixed in `client/src/components/layout/sidebar.tsx`
   - Fixed in `client/src/components/layout/top-nav.tsx` (desktop + mobile)
   - Changed to `https://admin.ozvps.com.au` with `<a target="_blank">` tag

5. **Global Provision Progress Tracker** - Provisioning persists across all pages:
   - `client/src/contexts/provision-tracker.tsx` - React context with localStorage persistence
   - Polls VirtFusion build status every 3 seconds for all active provisions
   - Survives page navigation and browser refresh
   - Auto-dismisses completed servers after 30 seconds
   - `client/src/components/provision-progress-widget.tsx` - Floating bottom-right widget
     - Collapsible header showing count of provisioning/ready servers
     - Per-server: icon, name, status label, animated progress bar
     - "View Server" button to navigate to server detail page
     - Dismiss button (hover to reveal)
   - `client/src/App.tsx` - ProvisionTrackerProvider wraps the entire app
   - `client/src/pages/deploy.tsx` - Calls `startProvision()` on successful deploy

6. **Billing Safety Fixes** - Two bugs fixed in `server/billing.ts`:
   - **Idempotency check order**: Moved check to AFTER wallet `FOR UPDATE` lock
     - Previously: check → lock (concurrent txs could both pass before blocking)
     - Now: lock → check (second tx sees ledger entry after first commits)
     - Prevents unique constraint violation errors in logs
   - **Unsuspend failure refund loop**: When VirtFusion fails to unsuspend after charging:
     - Now deletes the billing ledger entry when refunding
     - Keeps nextBillAt as future date (not reverted to past)
     - Allows next billing cycle to retry with a fresh charge attempt
     - Previously: ledger entry remained, future retries hit idempotency and passed
       without charging, then refunded again → free money bug

### Previous Sessions (condensed)
- **Native noVNC Console** - Replaced react-vnc with native noVNC v1.5.0
- **Rate Limiting UX** - `isRateLimited` flag separate from `isSystemDown`
- **reCAPTCHA** - Admin config page + visible shield icon on auth forms
- **Security fixes** - `crypto.randomInt()` for OTP, server-side name bans, path traversal, X-Forwarded-For spoofing, error disclosure
- **Trial Servers** - Full implementation: DB columns, admin provision UI, trial processor, TRIAL/TRIAL ENDED badges
- **Email verification overhaul** - Single-use tokens, must verify before dashboard, works cross-device
- **Admin 2FA bypass** - `ADMIN_BYPASS_2FA=true` env var for emergency recovery
- **System Health Check** - Blocks login when VirtFusion API or DB is down
- **Billing bug fixes** - Promo refund mismatch (FREE MONEY BUG), race conditions, unsuspend refund
- **Promotional codes** - Fully implemented
- **Email support system** - Inbound webhook at `/api/hooks/resend-inbound`, guest tickets, email threading
- **Profile picture upload** - Base64 upload in account settings

## Billing System Architecture
**chargeServer() flow (server/billing.ts):**
1. Lock wallet row (`FOR UPDATE`) to prevent concurrent charges
2. Check idempotency key in billingLedger (after lock, not before)
3. Check balance >= monthlyPriceCents
4. Deduct wallet atomically within transaction
5. Insert billingLedger entry (unique idempotencyKey = `bill:${serverId}:${nextBillAt}`)
6. Insert walletTransactions for user visibility
7. Update serverBilling record with new nextBillAt

**Unsuspend failure handling:**
- If VirtFusion unsuspend fails after charging: refund wallet, delete ledger entry, keep future nextBillAt
- Next billing cycle retry will find no ledger entry and charge fresh

**Billing idempotencyKey format:** `bill:${virtfusionServerId}:${nextBillAt.toISOString()}`

## Admin Panel
Separate admin panel at `admin.ozvps.com.au` on port 5001.

**Architecture:**
- `admin-server/` - Express backend on port 5001
- `admin-client/` - Vite React frontend (dark theme matching main client)
- NGINX proxies admin.ozvps.com.au → localhost:5001
- Same database, separate sessions table (`admin_sessions`)

**Auth Flow:**
1. Auth0 password verification (Resource Owner Password Grant)
2. Check `app_metadata.is_admin = true` in Auth0
3. Mandatory 2FA verification
4. IP whitelist (bootstrap mode: allow all if whitelist empty)

**To grant admin access in Auth0:** Set `app_metadata.is_admin = true` on the user

**Admin Provision Server:**
- Select user by search (email/name)
- Auto-creates VirtFusion user if not synced
- Select plan, hostname, OS, location (with flags)
- Option for free server (no billing)
- Sends credentials email to user
- Location config in `admin-server/routes/servers.ts` (LOCATION_CONFIG)

**Admin UI Components (admin-client/src/components/ui/):**
- `button.tsx`, `dialog.tsx`, `badge.tsx`, `input.tsx`, `label.tsx`, `textarea.tsx`
- `confirm-dialog.tsx` - Reusable ConfirmDialog (replaces all native `confirm()`)
- `prompt-dialog.tsx` - Reusable PromptDialog (replaces all native `prompt()`)

## Provisioning Architecture
**Two separate polling systems** — both use `api.getBuildStatus(serverId)`:

1. **Global `ProvisionTrackerContext`** (`client/src/contexts/provision-tracker.tsx`):
   - Persists in `localStorage` key `ozvps:activeProvisions`
   - Polls every 3 seconds for all active provisions across any page
   - Shows floating bottom-right widget (`provision-progress-widget.tsx`)
   - `startProvision()` called from `deploy.tsx` after successful deploy
   - Auto-dismisses completed provisions after 30 seconds (5s interval check)

2. **Per-page `useReinstallTask`** (`client/src/hooks/use-reinstall-task.ts`):
   - Used by `server-detail.tsx` for full-page checklist UI
   - Persists in `sessionStorage` (per-tab, not cross-tab)
   - Polls at 2s for first 30s, then 5s
   - Auto-dismisses 20s after `status === 'complete'`

**VirtFusion build status fields** (`getServerBuildStatus`):
- `commissionStatus`: 0=queued, 1=building, 2=paused, 3=complete (authoritative)
- `state`: raw VirtFusion state ('queued', 'provisioning', 'installing', 'running', etc.)
- `phase`: simplified ('queued'|'building'|'complete'|'error') — DO NOT use for step mapping
- **Always map using `state || phase`** — `state` has the granular VirtFusion values

**Server deletion status flow:**
`pending_approval` (awaiting admin) → `pending` (approved, waiting scheduledAt) → `processing` (VirtFusion deleting) → `completed`
Or: `pending_approval` → `revoked` (admin recovered it)

## Email System
- **Inbound**: MX record → `inbound-smtp.ap-northeast-1.amazonaws.com` (priority 10)
- **Webhook**: `https://app.ozvps.com.au/api/hooks/resend-inbound`
- **Reply-to format**: `support+{ticketId}@ozvps.com.au`
- **Templates**: White/light themed (dark mode breaks emails in clients)

## Current Version
- **App Version**: 1.11.0
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
# Update production or dev server
cd /tmp && ozvps --update

# If ozvps command not found
curl -fsSL https://raw.githubusercontent.com/rorywood/ozvps/main/scripts/ozvps -o /usr/local/bin/ozvps
chmod +x /usr/local/bin/ozvps
```

## Git Workflow
```bash
# Push directly to main (no dev branch)
git push origin main
```

## TODO / Known Issues
- [ ] Security features - implement lockout logic and audit logging (tables exist in DB, logic pending)
- [ ] Disk usage - VirtFusion returns disk image size, not actual filesystem usage (need to investigate different field)
- [x] Transaction labels - DONE (adjustment_credit/debit show admin description, By: admin email)
- [x] Provision widget auto-dismiss - DONE (interval-based, fires even after polling stops)
- [x] Server checklist auto-dismiss - DONE (20s after complete, no button click required)
- [x] Admin deletion approval - DONE (pending_approval → admin approves/recovers → Deletions page)
- [x] Provisioning checklist stuck at queued - DONE (use state || phase, not just phase)
- [x] Admin panel redesign - DONE (dark theme, no native dialogs, OzVPS branding)
- [x] Admin Center link fix - DONE (was pointing to /admin, now https://admin.ozvps.com.au)
- [x] Global provision tracker - DONE (localStorage persistence, polls across all pages)
- [x] Billing race condition fix - DONE (idempotency check after lock, unsuspend refund loop fixed)
- [x] Email OTP timing attack - DONE (crypto.timingSafeEqual)
- [x] Single-use verification tokens - DONE (400 on reuse, UI shows already-used state)
- [x] Security audit - DONE (path traversal, X-Forwarded-For, error disclosure, input validation, crypto RNG)
- [x] Native noVNC console - DONE (full sidebar controls, OzVPS branding)
- [x] reCAPTCHA admin config - DONE
- [x] Trial servers - DONE
- [x] Email support system - DONE (inbound webhook, guest tickets, email replies)
- [x] Promotional codes - DONE

## Notes for Claude
- User prefers direct, concise responses
- Push fixes to `main` branch only (no dev branch for production)
- User gets frustrated with repeated issues - triple-check fixes
- The `.ozvps-branch` file on servers determines which branch to pull from
- Email templates must be white/light themed (dark mode breaks emails)
- **ALWAYS `git pull origin main` before starting work** - Sync latest from remote to avoid overwriting changes made elsewhere
- **LOCKED - DO NOT MODIFY WITHOUT ASKING:**
  - Login page (`client/src/pages/login.tsx`)
  - Register page (`client/src/pages/register.tsx`)
  - Email verification (`client/src/pages/verify-email.tsx`)
  - Auth API (`client/src/lib/api.ts` - getAuthUser, getCurrentUser)
  - Auth hooks (`client/src/hooks/use-auth.ts`)
  - Server auth routes (`server/routes.ts` - /api/auth/* endpoints)
  - **Billing system (CRITICAL - money involved):**
    - Stripe webhooks (`server/webhookHandlers.ts`)
    - Billing routes (`server/routes.ts` - /api/billing/*, /api/wallet/*)
    - Admin billing routes (`admin-server/routes/billing.ts`)
    - Promo codes (`server/routes.ts` - promo code logic, `admin-server/routes/promo-codes.ts`)
    - Wallet/payment logic in storage (`server/storage.ts` - wallet functions)
    - Core billing logic (`server/billing.ts`)
