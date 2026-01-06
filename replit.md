# OzVPS Panel

## Overview

A custom cloud control panel built on top of the VirtFusion API for VPS management. The application provides a modern, glassmorphism-styled dark-first UI for OzVPS customers to manage their virtual private servers. VirtFusion serves as the backend control plane and system of record, while this panel acts as a pure API consumer.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS v4 with custom dark theme, glassmorphism design tokens
- **UI Components**: shadcn/ui (New York style) with Radix primitives
- **Fonts**: Inter (body), Outfit (display), JetBrains Mono (code)
- **Build Tool**: Vite with custom plugins for Replit integration

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **API Pattern**: REST endpoints that proxy to VirtFusion API
- **Development**: tsx for hot reloading, Vite middleware for frontend

### Data Layer
- **Storage**: In-memory only (no database required)
- **Session Storage**: MemoryStorage class using JavaScript Map
- **Data Sources**: All user data stored in Auth0 (credentials) and VirtFusion (servers, settings)

### Authentication Flow
- **User Authentication**: Auth0 (Resource Owner Password Grant)
  - Users authenticate via Auth0 API using the existing login/register UI
  - Auth0 manages user credentials securely
  - Environment variables: `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`
- **VirtFusion Integration**: Users are automatically linked to VirtFusion accounts by email
  - On login/register, the system finds or creates a VirtFusion user with the same email
  - VirtFusion user ID stored in Auth0 app_metadata for persistence
- **Session Management**: Cookie-based sessions stored in-memory
  - Sessions contain Auth0 user ID, VirtFusion user ID, extRelationId, email, and name
  - 7-day session expiry with httpOnly secure cookies
  - Sessions cleared on server restart (users re-login via Auth0)
- **VNC Console Access**: Embedded noVNC viewer using WebSocket connection
  - **Step 1**: Backend enables VNC via POST `/servers/{id}/vnc` with `{ action: 'enable' }`
  - **Step 2**: Backend retrieves WebSocket URL and password from VirtFusion VNC response
  - **Step 3**: Frontend navigates to `/servers/:id/console` page
  - **Step 4**: Console page renders embedded VncViewer component with WebSocket URL
  - **Library**: Uses `react-vnc` package (TypeScript wrapper for noVNC)
  - **Security**: VNC auto-disabled when user leaves console page; session cleanup on disconnect
  - **IMPORTANT**: Users never leave OzVPS panel - no access to old VirtFusion panel
  - extRelationId must be NUMERIC (1 to 18446744073709551615), not email string
- **Server Reinstall Flow**:
  - **Hostname is mandatory**: Required field at top of dialog, validated on both client and server
  - **Hostname validation**: 1-63 characters, lowercase letters/numbers/hyphens, no leading/trailing hyphens
  - **Filtered templates**: GET `/api/servers/:id/reinstall/templates` returns only allowed templates
  - **Backend enforcement**: POST `/reinstall` validates hostname (400) and template ID (403)
  - **VirtFusion API**: Send `operatingSystemId` and optional `name` (hostname) - VirtFusion auto-generates password
  - **Progress tracking**: Real polling of VirtFusion build status with sessionStorage persistence
  - **Console lock**: 15-second lock after reinstall starts to prevent console access during boot
  - **Credentials display**: After successful reinstall, shows server IP, username (root), and password with copy/reveal
- **VirtFusion API**: Bearer token authentication for backend communication
  - Environment variables: `VIRTFUSION_PANEL_URL`, `VIRTFUSION_API_TOKEN`
- **Known API Limitations**:
  - **SSH Key Management**: VirtFusion public API v1 does NOT support SSH key endpoints (`/api/v1/ssh-keys/*` returns 404). SSH key management is only available through VirtFusion admin panel UI, not via REST API. This feature cannot be implemented until VirtFusion adds API support.

### Project Structure
```
client/           # React frontend application
├── src/
│   ├── components/   # Reusable UI components
│   ├── pages/        # Route page components
│   ├── hooks/        # Custom React hooks
│   └── lib/          # Utilities, API client, types
server/           # Express backend
├── routes.ts     # API route definitions
├── virtfusion.ts # VirtFusion API client
└── storage.ts    # Data storage interface
shared/           # Shared code between client/server
└── schema.ts     # Drizzle database schema
```

### Security Features
- **Session Security**: Cookies use `httpOnly`, `secure` (production), `sameSite=strict` flags
- **Security Headers**: Helmet middleware with CSP (production), HSTS, X-Frame-Options, etc.
- **Rate Limiting**: Auth endpoints (10 attempts/15 min), general API (100 requests/min)
- **CSRF Protection**: Origin/Referer validation for all mutating requests (production)
- **Input Validation**: Zod schema validation on all API routes accepting user input
- **Log Sanitization**: Sensitive fields (password, token, secret, etc.) automatically redacted from logs
- **Server Ownership**: All server operations verify user ownership via VirtFusion userId

### Key Design Patterns
- **API Proxy Pattern**: Backend proxies all VirtFusion API calls, never exposing tokens to frontend
- **Component Composition**: GlassCard wrapper component for consistent glassmorphism styling
- **Type Safety**: Shared types between frontend and backend via `@shared/*` path alias

### Responsive Design
- **Mobile Navigation**: Hamburger menu with Sheet drawer (slide-out) for mobile devices
- **Breakpoints**: Using Tailwind CSS responsive utilities (`sm:`, `md:`, `lg:`)
  - Mobile: < 640px (default styles)
  - Small: 640px+ (`sm:`)
  - Medium: 768px+ (`md:`)
  - Large: 1024px+ (`lg:`) - desktop sidebar visible
- **Touch Targets**: Minimum 40px (h-10) on mobile, reduced to 36px (h-9) on larger screens
- **Layout**: Single-column on mobile, multi-column grids on tablet/desktop
- **AppShell**: Responsive padding with `lg:pl-64` for sidebar and `pt-16 lg:pt-0` for mobile header

## External Dependencies

### VirtFusion API Integration
- Base URL configured via `VIRTFUSION_PANEL_URL` environment variable
- API token configured via `VIRTFUSION_API_TOKEN` environment variable
- Endpoints consumed: servers, power actions, metrics, packages, locations

### Storage
- No database required - all data stored externally in Auth0 and VirtFusion
- Sessions stored in-memory (cleared on server restart, users re-login via Auth0)
- PostgreSQL available but not used

### Third-Party Services
- **Fonts**: Google Fonts (Inter, Outfit, JetBrains Mono)
- **Charts**: Recharts for metrics visualization

### Development Tools
- Replit-specific Vite plugins for development experience
- Custom meta images plugin for OpenGraph support