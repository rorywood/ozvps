import { useState } from "react";
import { FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChangelogEntry {
  date: string;
  version: string;
  changes: string[];
}

const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-01-10",
    version: "1.0.1-dev",
    changes: [
      "Redesigned billing page with tabbed interface for better organization",
      "Added VirtFusion monthly billing system with automatic server charges",
      "Added 5-day grace period for unpaid servers before suspension",
      "Added server suspend/unsuspend integration with VirtFusion API",
      "Added billing ledger with idempotency protection against double-charging",
      "Added upcoming server charges display with status badges",
      "Added auto-reactivation of suspended servers after wallet top-up",
      "Added bandwidth exceeded badges to server cards",
      "Added next bill date to server detail page, dashboard, and server list",
      "Added automatic billing initialization for existing servers on first access",
      "Added SQL migration files for billing tables with automated update scripts",
      "Added standalone migration runner script for manual database updates",
      "Added emergency fix script (fix-billing-now.sh) for instant billing setup",
      "Fixed route typo in single server endpoint preventing data fetch",
      "Fixed bandwidth exceeded message not showing on server detail page",
      "Fixed billing page showing 'no active servers' when servers exist",
      "Fixed billing page to show active servers (not just paid/unpaid status)",
      "Fixed server building progress hanging at 100% instead of showing SSH info",
      "Fixed payment method auto-selection - saved cards now charge directly without redirect",
      "Fixed duplicate card prevention - validates against Stripe fingerprint before adding",
      "Fixed shutdown and start power action status flickering",
      "Fixed server endpoints crashing when billing tables don't exist",
      "Updated all deployment scripts to load .env and run migrations automatically",
    ],
  },
  {
    date: "2026-01-10",
    version: "1.0.0-dev",
    changes: [
      "Added admin registration toggle with database persistence",
      "Fixed power action status updates - refetch before clearing state",
      "Updated bandwidth warnings - show only on affected servers with shaping message",
      "Fixed server status not updating immediately after power actions",
      "Fixed power action status flickering after completion",
      "Fix Stripe.js blocked by Content Security Policy",
      "Fix blank card form - show proper error when Stripe not ready",
      "Fix power action status display and add bandwidth alerts",
      "Add debugging for blank Stripe card form issue",
      "Fixed 'Rebooting' bug - now shows 'Starting...' for boot actions",
      "Added bandwidth exceeded alerts and TB formatting",
      "Fixed dev banner overlap with navigation menu",
      "Added dev environment banner with version and build date",
      "SSL/HTTPS setup with self-signed certificates",
      "Updated installer and update scripts with all improvements",
    ],
  },
];

export function DevChangelog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 px-2 text-yellow-600 hover:text-yellow-500 hover:bg-yellow-500/10"
      >
        <FileText className="h-3.5 w-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] bg-background border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <FileText className="h-5 w-5" />
              Development Changelog
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-6 pr-4">
              {CHANGELOG.map((entry, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-baseline gap-3 pb-2 border-b border-border">
                    <h3 className="text-lg font-semibold text-foreground">
                      v{entry.version}
                    </h3>
                    <span className="text-sm text-muted-foreground">
                      {new Date(entry.date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {entry.changes.map((change, changeIndex) => (
                      <li key={changeIndex} className="flex items-start gap-2 text-sm">
                        <span className="text-primary mt-1.5">•</span>
                        <span className="text-muted-foreground">{change}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="flex justify-end pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setOpen(false)} className="border-border">
              <X className="h-4 w-4 mr-2" />
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
