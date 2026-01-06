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
