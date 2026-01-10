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
