import { TopNav } from "./top-nav";
import { ProvisionProgressWidget } from "@/components/provision-progress-widget";
import { Link } from "wouter";
import { VERSION, FEATURES, VERSION_HISTORY } from "@/lib/version";
import { useState, useEffect } from "react";
import { Info, ChevronUp, ChevronDown, Bug, Loader2, CheckCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { secureFetch } from "@/lib/api";

export function AppShell({ children }: { children: React.ReactNode }) {
  // Check if dev banner should show
  const version = import.meta.env.VITE_APP_VERSION || "1.0.0-dev";
  const isDev = version.includes("-dev") ||
                (typeof window !== "undefined" && window.location.hostname.includes("dev")) ||
                import.meta.env.MODE === "development" ||
                import.meta.env.DEV;

  // Track whether dev banner is dismissed
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("dev-banner-dismissed") === "true";
    }
    return false;
  });

  // Listen for banner dismissal event
  useEffect(() => {
    const handleBannerDismissed = () => {
      setBannerDismissed(true);
    };
    window.addEventListener("dev-banner-dismissed", handleBannerDismissed);
    return () => window.removeEventListener("dev-banner-dismissed", handleBannerDismissed);
  }, []);

  // Show dev padding only if in dev mode AND banner not dismissed
  const showDevPadding = isDev && !bannerDismissed;

  return (
    <div className="min-h-screen text-foreground flex flex-col">
      <TopNav />
      <main className={cn(
        "flex-1 flex flex-col transition-[padding] duration-300",
        showDevPadding ? "pt-38 lg:pt-38" : "pt-24 lg:pt-24"
      )}>
        <div className="container mx-auto p-4 sm:p-6 lg:p-8 max-w-7xl animate-in fade-in duration-500 flex-1">
          {children}
        </div>
      </main>
      <Footer />
      <ProvisionProgressWidget />
    </div>
  );
}

function BugReportDialog() {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const bugReportMutation = useMutation({
    mutationFn: async (data: { description: string; currentUrl: string; appVersion: string; userAgent: string }) => {
      const response = await secureFetch('/api/feedback/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to submit bug report');
      }
      return response.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      setDescription("");
      setTimeout(() => {
        setOpen(false);
        setSubmitted(false);
      }, 2000);
    },
  });

  const handleSubmit = () => {
    if (!description.trim() || description.trim().length < 10) return;
    bugReportMutation.mutate({
      description: description.trim(),
      currentUrl: window.location.href,
      appVersion: VERSION,
      userAgent: navigator.userAgent,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) {
        setSubmitted(false);
        bugReportMutation.reset();
      }
    }}>
      <DialogTrigger asChild>
        <button
          className="text-xs text-muted-foreground/60 hover:text-primary transition-colors cursor-pointer flex items-center gap-1"
          data-testid="button-report-bug"
        >
          <Bug className="h-3 w-3" />
          Report Bug
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md bg-card/95 backdrop-blur-xl border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Bug className="h-5 w-5 text-destructive" />
            Report a Bug
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Help us improve by reporting issues you encounter.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="py-8 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="text-foreground font-medium">Thank you!</p>
            <p className="text-sm text-muted-foreground">Your bug report has been submitted.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Describe the issue
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What happened? What did you expect to happen?"
                className="w-full h-32 px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                disabled={bugReportMutation.isPending}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {description.length}/2000 characters (minimum 10)
              </p>
            </div>

            <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
              <p><span className="text-foreground">Page:</span> {window.location.pathname}</p>
              <p><span className="text-foreground">Version:</span> v{VERSION}</p>
            </div>

            {bugReportMutation.isError && (
              <p className="text-sm text-destructive">
                {bugReportMutation.error?.message || 'Failed to submit. Please try again.'}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                disabled={bugReportMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={bugReportMutation.isPending || description.trim().length < 10}
                className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {bugReportMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Report'
                )}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function VersionDialog() {
  const [expanded, setExpanded] = useState(false);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button 
          className="text-xs font-mono text-muted-foreground/40 hover:text-primary transition-colors cursor-pointer"
          data-testid="button-version-info"
        >
          v{VERSION}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md bg-card/95 backdrop-blur-xl border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            OzVPS Panel v{VERSION}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">Features</h4>
              <ul className="space-y-1">
                {FEATURES.map((feature, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
            
            <div>
              <button 
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
              >
                Version History
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              
              {expanded && (
                <div className="mt-2 space-y-3">
                  {VERSION_HISTORY.map((release, i) => (
                    <div key={i} className="border-l-2 border-primary/30 pl-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-primary">v{release.version}</span>
                        <span className="text-[10px] text-muted-foreground">{release.date}</span>
                      </div>
                      <ul className="space-y-0.5">
                        {release.changes.map((change, j) => (
                          <li key={j} className="text-[11px] text-muted-foreground">
                            • {change}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function Footer() {
  const currentYear = new Date().getFullYear();

  // Determine environment from hostname
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const isDev = hostname.includes("dev") ||
                hostname === "localhost" ||
                hostname === "127.0.0.1" ||
                import.meta.env.MODE === "development" ||
                import.meta.env.DEV;

  const envLabel = isDev ? "DEV" : "PROD";
  const envColor = isDev
    ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
    : "bg-muted/50 text-muted-foreground/50 border-border/50";

  return (
    <footer className="border-t border-border/50 bg-card/30 backdrop-blur-sm">
      <div className="container mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              © {currentYear} <span className="font-semibold text-foreground">OzVPS</span>. All rights reserved.
            </span>
          </div>

          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/dashboard" className="hover:text-foreground transition-colors">
              Dashboard
            </Link>
            <Link href="/billing" className="hover:text-foreground transition-colors">
              Billing
            </Link>
            <a
              href="https://status.ozvps.com.au"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors flex items-center gap-1.5"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </span>
              Status
            </a>
            <span className="text-border">|</span>
            <span className="text-xs">
              ABN 95 663 314 047
            </span>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-border/50 flex items-center justify-between">
          <p className="text-xs text-muted-foreground/60">
            Powered by Australian infrastructure. Built with ❤️ in Queensland.
          </p>
          <div className="flex items-center gap-3">
            <BugReportDialog />
            <span className="text-muted-foreground/30">|</span>
            <span className={cn(
              "px-2 py-0.5 text-[10px] font-bold rounded border",
              envColor
            )}>
              {envLabel}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground/50">
              v{VERSION}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
