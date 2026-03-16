# Codex Context File
> This file helps Codex remember project context between sessions. Read this first!

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
| Development | dev.ozvps.com.au | `Codex/dev-l5488` | Different server |

## Design System

### Tech Stack
- **Tailwind CSS v4** (not v3 - uses `@theme inline` syntax)
- **shadcn/ui components** (Radix UI primitives)
- **Lucide React icons**
- **React Query** for data fetching

### Fonts
```css
--font-sans: 'Poppins', sans-serif;          /* Body / UI text */
--font-display: 'Lilita One', cursive;        /* h1 page titles only */
--font-mono: 'JetBrains Mono', monospace;     /* Code / IPs */
```
> **Important:** Lilita One is applied to `h1` only. h2–h6 use Poppins (font-semibold). Lilita One has no weight variants — always renders at 400.

### Dark Theme Colors (Default)
```css
/* Backgrounds — matches ozvps.com.au */
--background: hsl(222 50% 4%);        /* deep navy */
--card:       hsl(222 40% 8%);        /* card surface */
--sidebar:    hsl(220 20% 6%);        /* sidebar */
--popover:    hsl(220 30% 10%);       /* elevated popover */

/* Text */
--foreground:         hsl(0 0% 95%);
--muted-foreground:   hsl(220 10% 65%);

/* Primary — OzVPS Blue */
--primary: hsl(209 100% 50%);         /* #0085FF */

/* Accent — Cyan */
--accent-foreground: hsl(199 95% 48%);

/* Borders */
--border: hsl(220 15% 18%);           /* solid navy-blue tinted border */

/* Status Colors */
--success:     hsl(160 84% 39%);      /* emerald */
--destructive: hsl(0 84% 60%);        /* red */
--warning:     hsl(45 100% 51%);      /* #FFAD02 — brand yellow */
--info:        hsl(199 95% 48%);      /* cyan */
```

### Background Effect
The body uses the ozvps.com.au dot grid + blue glow:
```css
background-image:
  radial-gradient(ellipse 90% 40% at 50% -2%, hsl(209 100% 50% / 0.13) 0%, transparent 100%),
  radial-gradient(circle, hsl(0 0% 100% / 0.035) 1px, transparent 1px);
background-size: auto, 28px 28px;
background-attachment: fixed;
```

### Border Radius
```css
--radius-sm: 0.375rem;  /* 6px */
--radius-md: 0.625rem;  /* 10px */
--radius-lg: 0.9375rem; /* 15px */
```

### Component Patterns
```jsx
/* Standard Card */
<div className="bg-card rounded-xl p-6 border border-border">

/* Glass Card */
<div className="glass-card p-6">  {/* use .glass-card utility class */}

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

### Utility Classes (index.css)
- `.glass-card` — `rgba(255,255,255,0.03)` bg + `backdrop-blur-xl` + border
- `.glass-card-hover` — same + hover border/glow transition
- `.text-gradient` — blue→cyan gradient text (matches ozvps.com.au hero)
- `.btn-glow` — `box-shadow: 0 4px 14px -3px hsl(209 100% 50% / 0.4)`
- `.glow-primary` / `.glow-primary-hover` — subtle blue box-shadow

### Key Style File
- `client/src/index.css` - All theme variables, component classes, typography
- `client/index.html` - Google Fonts: Poppins, Lilita One, JetBrains Mono

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
- `server/email.ts` - All email templates (white/light themed, shared baseEmail helper)
- `client/src/lib/api.ts` - Frontend API client with `secureFetch`
- `client/src/pages/server-detail.tsx` - Server detail page with React Query
- `client/src/pages/contact.tsx` - Public contact form (sales + abuse, no login required)
- `client/src/pages/guest-ticket.tsx` - Public guest ticket viewing page (token-based)
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
- `shared/schema.ts` - Database schema (tickets have `ticketNumber` random 6-digit display field)
- `shared/version.ts` - Version number and changelog
- `admin-client/src/pages/Deletions.tsx` - Admin page for approving/recovering server deletion requests
- `admin-client/src/pages/AuditLogs.tsx` - Admin audit log viewer (admin actions + user events, tabbed)
- `admin-server/routes/audit.ts` - GET /audit/admin and GET /audit/users endpoints
- `admin-server/utils/audit-log.ts` - `logAdminAction()`, `auditSuccess()`, `auditFailure()` helpers
- `server/user-audit.ts` - `auditUserAction()`, `logUserAction()`, `UserActions` constants
- `admin-client/src/components/ui/select.tsx` - Custom dark dropdown (replaces native `<select>`)

## Recent Session Work (2026-03-14)

### Completed This Session
1. **Public Contact Form** (`client/src/pages/contact.tsx`) — sales + abuse only, no login:
   - Support portal layout: sticky nav, two-column grid (form + sidebar), FAQ accordion
   - Category selector cards, name+email row, subject, message with char counter
   - Success screen shows random ticket number + View Ticket button
   - Route: `/contact` added to `PUBLIC_AUTH_ROUTES` in `App.tsx`

2. **Guest Ticket View** (`client/src/pages/guest-ticket.tsx`) — token-based, no login:
   - Chat-bubble style messages (support left/blue, user right)
   - Ticket header: status badge, category, metadata grid
   - Reply box with email hint; sticky nav with logo + Sign In button

3. **Random Ticket Numbers** — `ticketNumber` column on `tickets` table:
   - `shared/schema.ts`: `ticketNumber: integer("ticket_number").unique()`
   - `server/storage.ts`: `createTicket()` generates random 6-digit number with collision retry
   - Used for display everywhere; internal DB `id` still used for email `replyTo` threading
   - **Requires `db:push` on server** — `cd /tmp && ozvps --update && ozvps --db-push`

4. **Admin Deletion Fix** — deletion approval no longer waits 40 minutes:
   - Was: `scheduledAt.setHours(scheduledAt.getHours() + 1)` — 1 hour forced wait
   - Now: `const scheduledAt = new Date()` — processes on next 30s cycle

5. **Admin Ticket Dropdowns Fixed** — native `<select>` always rendered white:
   - Created `admin-client/src/components/ui/select.tsx` — custom dark dropdown
   - Replaced all 4 native selects in `admin-client/src/pages/Tickets.tsx`

6. **Email Templates Fixed** (`server/email.ts`):
   - **Logo now visible in Outlook**: added `bgcolor="#0d1117"` HTML attribute to header `<td>` (Outlook ignores CSS `background-color` but respects the attribute)
   - **VML button**: Outlook-native rounded button via `<!--[if mso]>` conditional
   - **`color-scheme: light only`**: prevents dark mode email clients from inverting the white logo
   - All 18 templates use shared `baseEmail()` → dark navy header, blue accent bar, white body

7. **Rate Limits Loosened** (`server/routes.ts`, `server/index.ts`):
   | Limiter | Before | After |
   |---|---|---|
   | Login | 5/15min | 15/15min |
   | Deployment | 3/min | 5/min |
   | Contact form | 3/hr | 10/hr |
   | Global API | 300/min | 600/min |

8. **Design System Updated** — panel now matches ozvps.com.au:
   - Fonts: Inter→Poppins (body), Outfit→Lilita One (h1 only), JetBrains Mono unchanged
   - Background: deeper navy `hsl(222 50% 4%)` + dot grid + blue top glow (fixed)
   - Primary: `hsl(209 100% 50%)` #0085FF | Border: `hsl(220 15% 18%)`
   - Warning color: amber→`hsl(45 100% 51%)` #FFAD02 brand yellow
   - Border radius: 6/10/15px
   - New utility classes: `.text-gradient`, `.btn-glow`
   - Files: `client/src/index.css`, `client/index.html`

9. **Register Page Copy** — updated headline + pricing:
   - "Join OzVPS Today" → "Australian Cloud Hosting"
   - Plans from $5/mo → $7/mo

### Previous Session (2026-03-14 — earlier)
1. **Audit Logs Admin Page** — `/audit-logs` with two tabs (Admin Actions + User Events)
2. **Disk Debug Log Removed** — was logging full disk JSON every 1s per server
3. **Real Disk Usage** — QEMU guest agent `fsinfo`, root `/` partition, libvirt fallback
4. **Session IP Validation** — `SESSION_VALIDATE_IP=true` env var (disabled by default)
5. **Server Plan Price Display** — monthly price in server detail sidebar
6. **Login & Register Improvements** — password toggle, forgot password link, status strip

### Previous Sessions (condensed)
- **Email template redesign** — clean white design, shared baseEmail helper, 18 templates
- **Admin panel redesign** — dark theme, no native dialogs, OzVPS branding
- **Transaction labels** — admin wallet adjustments show meaningful titles
- **Provision widget auto-dismiss** — interval-based, fires even after polling stops
- **Admin deletion approval workflow** — pending_approval → admin approves/recovers
- **Billing safety fixes** — idempotency check order, unsuspend refund loop
- **Email OTP timing-safe** — crypto.timingSafeEqual
- **Single-use verification tokens** — 400 on reuse, UI shows already-used state
- **Native noVNC console** — full sidebar controls, OzVPS branding
- **reCAPTCHA admin config** — admin config page, visible shield icon on forms
- **Trial servers** — DB columns, admin provision UI, trial processor, TRIAL badges
- **Email support system** — inbound webhook, guest tickets, email replies
- **Promotional codes** — fully implemented
- **Profile picture upload** — Base64 upload in account settings

## Ticket System
- **Guest tickets**: `guestEmail` + `guestAccessToken` (64 hex chars = 32 random bytes) — no login
- **Ticket number**: `ticketNumber` (random 6-digit, unique) for display; DB `id` used internally for email threading
- **Reply-to format**: `support+{ticketId}@ozvps.com.au` — uses real DB `id` for inbound webhook parsing
- **Public categories**: `sales` and `abuse` only (no `support` or `accounts` for public)
- **Admin reply → guest email**: `sendGuestTicketAdminReplyEmail()` fires when admin replies to a guest ticket

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
- `select.tsx` - Custom dark dropdown (replaces native `<select>` which always renders white)

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
- `state`: raw VirtFusion state — often **empty string** during commissioned=1 (unreliable)
- `phase`: simplified ('queued'|'building'|'complete'|'error') — DO NOT use for step mapping
- `buildingStartedAt`: server-tracked timestamp (ms) when commissioned=1 was first seen

**Provisioning progress approach:**
- Server (`routes.ts`) maintains `buildStartTimes: Map<string, number>`
- Clients simulate checklist: 0-20s=provisioning, 20-60s=imaging, 60-150s=installing, 150s+=configuring

**Server deletion status flow:**
`pending_approval` → `pending` → `processing` → `completed`
Or: `pending_approval` → `revoked` (admin recovered it)

## Email System
- **Inbound**: MX record → `inbound-smtp.ap-northeast-1.amazonaws.com` (priority 10)
- **Webhook**: `https://app.ozvps.com.au/api/hooks/resend-inbound`
- **Reply-to format**: `support+{ticketId}@ozvps.com.au` (real DB id, not ticketNumber)
- **Templates**: White/light themed — dark mode breaks emails in clients
- **Logo**: white PNG on transparent bg — needs `bgcolor="#0d1117"` on header `<td>` for Outlook

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
7. **Email logo invisible** - Logo is white PNG; needs `bgcolor="#0d1117"` on header `<td>` (Outlook ignores CSS background-color)

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
- [ ] Security features — lockout logic (tables exist in DB, logic pending)
- [x] Design system update — DONE (matches ozvps.com.au: Poppins, Lilita One h1, dot grid, #0085FF, #FFAD02)
- [x] Random ticket numbers — DONE (ticketNumber column, 6-digit random, unique) — **needs db:push on server**
- [x] Public contact form — DONE (sales + abuse, guest tickets, FAQ, success screen)
- [x] Guest ticket view — DONE (token-based, chat bubbles, reply box)
- [x] Email logo fix — DONE (bgcolor attribute for Outlook, VML button, color-scheme:light only)
- [x] Rate limits loosened — DONE (login 15/15min, API 600/min, contact 10/hr)
- [x] Admin deletion immediate — DONE (no longer waits 1 hour)
- [x] Admin ticket dropdowns — DONE (custom Select component, was white with native select)
- [x] Email templates redesign — DONE (white design, dark header, shared helpers)
- [x] Login/register improvements — DONE (password toggle, status strip, blue accent)
- [x] Disk usage — DONE (QEMU guest agent fsinfo, root partition, libvirt fallback)
- [x] Audit logging admin UI — DONE (adminAuditLogs + userAuditLogs, Audit Logs page)
- [x] Session IP validation — DONE (SESSION_VALIDATE_IP=true)
- [x] Admin panel redesign — DONE (dark theme, no native dialogs)
- [x] Billing race condition fix — DONE
- [x] Trial servers — DONE
- [x] Email support system — DONE
- [x] Promotional codes — DONE

## Notes for Codex
- User prefers direct, concise responses
- Push fixes to `main` branch only (no dev branch for production)
- User gets frustrated with repeated issues — triple-check fixes
- The `.ozvps-branch` file on servers determines which branch to pull from
- Email templates must be white/light themed (dark mode breaks emails)
- **ALWAYS `git pull origin main` before starting work** — sync latest to avoid overwriting changes
- **LOCKED — DO NOT MODIFY WITHOUT ASKING:**
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
