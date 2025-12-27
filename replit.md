# VirtFusion Control Panel

## Overview

A custom cloud control panel built on top of the VirtFusion API for VPS management. The application provides a modern, glassmorphism-styled dark-first UI similar to CloudASN/TenantOS for managing virtual private servers. VirtFusion serves as the backend control plane and system of record, while this panel acts as a pure API consumer.

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
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts`
- **Migrations**: `migrations/` directory via drizzle-kit
- **Current Storage**: In-memory storage (MemStorage) for user sessions, designed for future database migration

### Authentication Flow
- VirtFusion API tokens (Bearer tokens) for backend communication
- Environment variables: `VIRTFUSION_PANEL_URL`, `VIRTFUSION_API_TOKEN`
- No user authentication currently - direct access to panel
- Authentication code exists but is disabled (can be re-enabled if needed)

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

## External Dependencies

### VirtFusion API Integration
- Base URL configured via `VIRTFUSION_PANEL_URL` environment variable
- API token configured via `VIRTFUSION_API_TOKEN` environment variable
- Endpoints consumed: servers, power actions, metrics, packages, locations

### Database
- PostgreSQL via `DATABASE_URL` environment variable
- Drizzle ORM for schema management and queries
- Session storage via connect-pg-simple (configured but optional)

### Third-Party Services
- **Fonts**: Google Fonts (Inter, Outfit, JetBrains Mono)
- **Charts**: Recharts for metrics visualization

### Development Tools
- Replit-specific Vite plugins for development experience
- Custom meta images plugin for OpenGraph support