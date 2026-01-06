export const VERSION = "1.6.0";

export const FEATURES = [
  "Embedded VNC console with WebSocket connection",
  "Pop-out console window support",
  "Keyboard shortcuts panel (Ctrl+Alt+Del, Tab, Esc, Enter)",
  "Case-sensitive clipboard paste functionality",
  "Live server statistics and metrics",
  "Server power controls (Start, Reboot, Shutdown)",
  "OS reinstallation with template selection",
  "Server renaming",
  "Responsive mobile-friendly design",
  "Precise bandwidth display with 2 decimal places",
  "Prominent remaining bandwidth indicator",
];

export const VERSION_HISTORY = [
  {
    version: "1.6.0",
    date: "2026-01-06",
    changes: [
      "Security: Single session enforcement - only one active session per user",
      "Security: Auto-logout when blocked or logged in from another location",
      "Security: Session invalidation messages on login page",
      "Admin: Block/unblock user functionality",
    ],
  },
  {
    version: "1.5.3",
    date: "2026-01-06",
    changes: [
      "Security: Fixed cross-user data leak from cached server data",
      "Clear all cached data on logout and login",
    ],
  },
  {
    version: "1.5.1",
    date: "2026-01-06",
    changes: [
      "Fixed CSRF bypass for webhook endpoints",
    ],
  },
  {
    version: "1.5.0",
    date: "2026-01-06",
    changes: [
      "Auth0 Event Streams integration for user deletion sync",
      "Automatic VirtFusion cleanup when users are deleted from Auth0",
      "Bearer token authentication for webhooks",
    ],
  },
  {
    version: "1.4.0",
    date: "2026-01-06",
    changes: [
      "Security: Math CAPTCHA + honeypot on login page",
      "Security: Blocked access to sensitive files (.env, package.json, server/, etc.)",
      "Security: Rate limiting on install scripts",
      "Renamed VirtFusion ID to VIRTID in settings",
      "Added public Pricing page for new users (/pricing)",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-01-06",
    changes: [
      "Improved login page spacing",
      "Fixed login page background color",
      "Replaced favicon with OzVPS logo",
      "Removed third-party branding from codebase",
      "Added Order page (Coming Soon) to sidebar",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-01-06",
    changes: [
      "Security: Secure temp file handling with mktemp (prevents symlink attacks)",
      "Security: Firewall now opens specific ports (22, 80, 443) instead of disabling",
      "Security: HTTPS-only enforcement for update downloads",
      "Update script now includes version identifier",
      "Removed public registration - login only",
      "Fixed update script heredoc parsing issue",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-01-06",
    changes: [
      "Improved bandwidth display with precise GB values (2 decimal places)",
      "Prominent remaining bandwidth indicator with green highlight",
      "Reorganized bandwidth stats layout for clarity",
      "Enhanced VNC cursor visibility",
      "Added update-ozvps command for easy one-command updates",
      "Update script self-updates to stay current",
      "Fixed bad-words package compatibility issue",
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
