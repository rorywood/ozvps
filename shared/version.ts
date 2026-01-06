export const VERSION = "1.7.9";

export const FEATURES = [
  "Embedded VNC console with WebSocket connection",
  "Pop-out console window support",
  "Keyboard shortcuts panel (Ctrl+Alt+Del, Tab, Esc, Enter)",
  "Case-sensitive clipboard paste functionality",
  "Live server statistics and metrics",
  "Server power controls (Start, Reboot, Shutdown)",
  "OS reinstallation with template selection",
  "Server deployment with OS and hostname selection",
  "Prepaid wallet with Stripe integration",
  "Server renaming",
  "Responsive mobile-friendly design",
  "Precise bandwidth display with 2 decimal places",
  "Prominent remaining bandwidth indicator",
];

export const VERSION_HISTORY = [
  {
    version: "1.7.8",
    date: "2026-01-06",
    changes: [
      "Fix: Rebuilt dist folder with latest v1.7.8 code",
      "Fix: Resolved stale cache issue causing old v1.6.0 to be downloaded",
    ],
  },
  {
    version: "1.7.7",
    date: "2026-01-06",
    changes: [
      "Fix: Download package now includes pre-built dist folder",
      "Fix: No build step required on target server",
      "Fix: Update script verifies application is ready before starting",
    ],
  },
  {
    version: "1.7.6",
    date: "2026-01-06",
    changes: [
      "Fix: PM2 restart now uses delete+start for clean restarts",
      "Fix: Update script waits for app health check after restart",
    ],
  },
  {
    version: "1.7.5",
    date: "2026-01-06",
    changes: [
      "Feature: Fully automatic database setup - creates user, database, and configures pg_hba.conf",
      "Feature: Credits CLI auto-runs update if DATABASE_URL is missing",
      "Fix: No manual intervention required for database configuration",
    ],
  },
  {
    version: "1.7.4",
    date: "2026-01-06",
    changes: [
      "Fix: Update script now installs PostgreSQL if missing (Debian/Ubuntu/RHEL)",
      "Fix: Validates DATABASE_URL exists in .env before proceeding",
      "Fix: Clear error messages when configuration is incomplete",
    ],
  },
  {
    version: "1.7.3",
    date: "2026-01-06",
    changes: [
      "Fix: Update script now ensures PostgreSQL is running before migrations",
      "Fix: Increased database connection timeout from 10s to 30s",
    ],
  },
  {
    version: "1.7.2",
    date: "2026-01-06",
    changes: [
      "Fix: Update script database migration handling",
      "Fix: Preserve manually-disabled plans during VirtFusion sync",
    ],
  },
  {
    version: "1.7.1",
    date: "2026-01-06",
    changes: [
      "Feature: Cross-page power action status tracking with sessionStorage persistence",
      "Feature: Transitional states (rebooting, starting, stopping) displayed across all pages",
      "Feature: Stripe Customer ID display in account settings with show/hide toggle",
      "Fix: Nano plan RAM corrected to 512 MB",
      "Fix: VirtFusion user lookup now uses correct API endpoint",
      "UI: Spinner icons during power action transitions",
    ],
  },
  {
    version: "1.7.0",
    date: "2026-01-06",
    changes: [
      "Deploy: New OS selection during server deployment",
      "Deploy: Required hostname input with validation",
      "Security: Stripe customer verification on wallet top-ups",
      "Security: Webhook signature verification now mandatory",
      "Fix: Plans sync uses VirtFusion package ID as unique key",
      "Fix: Existing prices preserved when VirtFusion doesn't provide pricing",
    ],
  },
  {
    version: "1.6.2",
    date: "2026-01-06",
    changes: [
      "UI: Removed Configuration tab placeholder from server overview",
    ],
  },
  {
    version: "1.6.1",
    date: "2026-01-06",
    changes: [
      "Fix: Session handling for backward compatibility with older sessions",
      "Fix: Vite development mode no longer blocked by security filter",
      "Improved: Install/update scripts now show clean progress output",
    ],
  },
  {
    version: "1.6.0",
    date: "2026-01-06",
    changes: [
      "Security: Strict single-session - block login if already logged in elsewhere",
      "Security: 15-minute idle timeout with automatic logout",
      "Security: Session invalidation messages on login page",
      "Security: Fixed cross-user data leak from cached server data",
      "Security: Math CAPTCHA + honeypot on login page",
      "Security: Blocked access to sensitive files (.env, package.json, server/, etc.)",
      "Security: Rate limiting on install scripts",
      "Security: Secure temp file handling with mktemp",
      "Security: Firewall opens specific ports (22, 80, 443) instead of disabling",
      "Auth0 Event Streams integration for user deletion sync",
      "Admin: Block/unblock user functionality",
      "Improved bandwidth display with precise GB values",
      "Added update-ozvps command for easy updates",
      "Added public Pricing page (/pricing)",
      "Removed public registration - login only",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-01-05",
    changes: [
      "Initial release",
      "Auth0 authentication integration",
      "VirtFusion API integration",
      "Embedded VNC console viewer",
      "Pop-out console window",
      "Keyboard shortcuts and clipboard panel",
      "Live server stats",
      "Power management",
      "OS reinstallation",
      "Server renaming",
      "Mobile responsive design",
    ],
  },
];
