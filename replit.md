# OzVPS Panel

## Overview

OzVPS Panel is a custom cloud control panel for managing Virtual Private Servers (VPS) for OzVPS customers. It is built on top of the VirtFusion API, acting as an API consumer to provide a modern, dark-first, glassmorphism-styled user interface. The panel integrates with a prepaid wallet system, allowing users to fund their accounts via Stripe and instantly deploy servers. It aims to offer a streamlined and secure VPS management experience, abstracting the complexities of the underlying VirtFusion platform.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
- **Design**: Dark-first UI with glassmorphism styling using Tailwind CSS v4.
- **Components**: `shadcn/ui` (New York style) with Radix primitives.
- **Typography**: Inter (body), Outfit (display), JetBrains Mono (code).
- **Responsiveness**: Mobile-first design with responsive breakpoints, hamburger menu for mobile navigation, and optimized touch targets.

### Technical Implementations
- **Frontend**: React 18 with TypeScript, Wouter for routing, TanStack React Query for state management, and Vite as the build tool.
- **Backend**: Node.js with Express, TypeScript (ESM modules), acting as a REST API proxy to the VirtFusion API.
- **Data Layer**: PostgreSQL with Drizzle ORM for billing and wallet data. Auth0 for user credentials, VirtFusion for server management, and in-memory session storage.
- **Billing System**: Prepaid wallet with Stripe integration for top-ups, tracking transactions, and managing deploy orders. Plans are statically configured and linked to VirtFusion packages.
- **Authentication**: Auth0 for user authentication, with automatic linking to VirtFusion accounts based on email. Cookie-based, in-memory session management with strict single-session enforcement and idle timeouts.
- **Server Management**: Features include VNC console access via `react-vnc`, server reinstall flow with hostname validation and progress tracking, and persistent power action status tracking across the UI.
- **Admin Panel**: Provides functionalities for user search, wallet adjustments, transaction history viewing, and manual linking of VirtFusion accounts for legacy users. Admin access is controlled via Auth0 `app_metadata`.
- **Security**: Utilizes `httpOnly`, `secure`, and `sameSite=strict` cookies, Helmet middleware for security headers, rate limiting on API endpoints, CSRF protection, Zod for input validation, and log sanitization. Enhanced brute force protection with per-account rate limiting (5 attempts → 30 min lockout), IP-aware rate limiting (20 attempts per IP in 5 min → 15 min lockout), email+IP combo tracking (3 attempts → 30 min lockout), progressive delays (exponential backoff), and Auth0 webhook HMAC signature verification (`server/security.ts`). Server-side reCAPTCHA verification on both login and registration endpoints. Defense-in-depth duplicate email check before registration to prevent account takeover.
- **Key Design Patterns**: API Proxy Pattern for VirtFusion communication, Component Composition for UI consistency, and Type Safety across the stack.

### Feature Specifications
- **VPS Management**: Create, delete, and manage VPS instances.
- **Two-Phase Deployment**: Servers are created instantly without OS, then users complete setup via wizard on the server detail page. This separates "ordering" from "setup" for better UX.
- **Setup Wizard**: When a server needs setup (`needsSetup: true`), the server detail page shows a wizard for selecting OS and hostname.
- **Billing**: Wallet top-up via Stripe, transaction history, and saved payment methods. Includes auto top-up feature that automatically charges a saved card when balance falls below a configurable threshold. Direct charge feature for instant top-ups with saved cards. Duplicate card prevention using Stripe fingerprint validation. Automatic 3DS fallback to Stripe Checkout.
- **Invoices**: Invoices are stored in Stripe (not local database) for durability and professional PDF generation. Checkout sessions auto-create invoices; direct charges create and finalize invoices via Stripe API. Invoice history fetched directly from Stripe, with PDF downloads linking to Stripe's hosted PDFs. This ensures invoices persist even if the app database is lost.
- **Console Access**: Embedded VNC console for server interaction.
- **Server Reinstall**: Streamlined process for reinstalling server OS.
- **Admin Tools**: User management, credit adjustment, and account linking for administrators.
- **Admin Infrastructure Management**: Comprehensive VirtFusion infrastructure dashboard accessible at `/admin/infrastructure`. Features tabbed interface with: (1) Overview - real-time stats for servers, hypervisors, IPs, and wallets, (2) Servers - list all servers with power controls, suspend/unsuspend, ownership transfer, and deletion, (3) Hypervisors - capacity and health metrics with expandable cards, (4) Networking - IP block utilization display, (5) VF Users - VirtFusion user listing with server counts, (6) Audit Log - comprehensive action history with filtering.
- **Admin Audit Logging**: All admin actions are logged to `admin_audit_logs` table capturing: admin identity, action, target type/ID, payload, status, error message, IP address, user agent, and reason for destructive actions.
- **Dual-Mode Server Cancellation**: Two deletion modes: (1) Grace period (30 days) allows revocation, (2) Immediate deletion (5 minutes, non-revocable). Both automated via background job (`cancellation-processor.ts`) that runs every 30 seconds. Immediate mode shows locked "Deletion In Progress" screen on server detail, and "DELETING" badge with spinner on dashboard/server list. Grace mode shows "PENDING CANCELLATION" badge.
- **Recurring Server Billing**: Background billing processor (`billing-processor.ts`) runs hourly. Charges servers daily (plan.priceMonthly/30), processes auto top-ups when balance falls below threshold, marks servers overdue after failed billing. Servers overdue for 7+ days are automatically scheduled for immediate deletion. Overdue servers display "PAYMENT OVERDUE" badge on dashboard and server list.

### System Design Choices
- **VirtFusion Integration**: Backend proxies all requests to VirtFusion, ensuring API key security. VirtFusion `hypervisorId` parameter is used for server creation but requires the hypervisor *group* ID.
- **Auth0 User Deletion Sync**: Webhook-driven synchronization to clean up VirtFusion resources upon Auth0 user deletion. Fallback orphan cleanup processor runs hourly to catch cases where webhook wasn't triggered (e.g., Auth0 free tier without Event Streams).
- **Orphan Cleanup Processor**: Background job (`orphan-cleanup-processor.ts`) runs every hour (first run 5 minutes after startup). Checks all active wallets against Auth0, and for deleted users: (1) Deletes VirtFusion user and servers, (2) Deletes Stripe customer, (3) Soft-deletes wallet, (4) Cancels pending orders. Includes rate limiting (100ms delay) between checks.
- **Known API Limitations**: Recognition and handling of VirtFusion API limitations, such as lack of SSH key management and user lookup by email, requiring manual workarounds or feature deferral. IP allocations are derived from server primary IPs only (VirtFusion lacks dedicated IP list endpoints `/ipAddresses` and `/ipAddressBlocks`); secondary/IPv6 addresses require fetching individual server network interfaces which would be slow and risk rate limiting.
- **VirtFusion API Resilience**: 10-second request timeouts prevent indefinite hangs when VirtFusion is slow. In-memory caching (30-second TTL) for server lists and details with automatic invalidation after power actions and other mutations. Custom `VirtFusionTimeoutError` class with comprehensive timeout detection across all fetch implementations (AbortController, transport-layer timeouts, undici FetchError). Routes return HTTP 504 for timeouts with user-friendly messaging.

## External Dependencies

- **VirtFusion API**: Core backend service for VPS management.
- **PostgreSQL**: Primary database for billing, wallet, and order data.
- **Auth0**: Identity provider for user authentication and management.
- **Stripe**: Payment gateway for wallet top-ups and billing.
- **Google Fonts**: Inter, Outfit, and JetBrains Mono for typography.
- **Recharts**: Library used for rendering charts and metrics visualizations.