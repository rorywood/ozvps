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
- **VNC Console Access**: Two-step seamless authentication (CRITICAL - DO NOT CHANGE)
  - **Step 1**: Backend enables VNC via POST `/servers/{id}/vnc` with `{ action: 'enable' }`
  - **Step 2**: Backend generates auth tokens via POST `/users/{extRelationId}/serverAuthenticationTokens/{serverId}`
  - **Step 3**: Backend returns two URLs: `authUrl` (token auth) and `vncUrl` (VNC console)
  - **Step 4**: Frontend opens `authUrl` in a POPUP WINDOW (this sets VirtFusion session cookie in that popup's context)
  - **Step 5**: After 1.5 seconds, frontend navigates the SAME POPUP to `vncUrl` (cookies are preserved)
  - **IMPORTANT**: VirtFusion's `redirect_to` parameter does NOT work
  - **IMPORTANT**: Hidden iframes DO NOT WORK - cross-origin cookies don't transfer to main window (fails in incognito/fresh sessions)
  - **IMPORTANT**: Build auth URL using raw tokens (tokens['1'] and tokens['2']), NOT endpoint_complete (has HTML-encoded &amp;)
  - **IMPORTANT**: Must use SINGLE POPUP for both auth and VNC - same browser context preserves cookies
  - extRelationId must be NUMERIC (1 to 18446744073709551615), not email string
  - **Security**: 15-minute auto-timeout disables VNC session; manual disable button available; auth tokens expire in 60 seconds
- **VirtFusion API**: Bearer token authentication for backend communication
  - Environment variables: `VIRTFUSION_PANEL_URL`, `VIRTFUSION_API_TOKEN`

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