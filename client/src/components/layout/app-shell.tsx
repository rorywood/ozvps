import { TopNav } from "./top-nav";
import { Link } from "wouter";
import { VERSION, FEATURES, VERSION_HISTORY } from "@/lib/version";
import { useState, useEffect } from "react";
import { Info, ChevronUp, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

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
    </div>
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
    ? "bg-yellow-500/20 text-yellow-600 border-yellow-500/50"
    : "bg-green-500/20 text-green-600 border-green-500/50";

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
