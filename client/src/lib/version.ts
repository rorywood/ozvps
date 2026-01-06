export const VERSION = "1.3.0";

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
