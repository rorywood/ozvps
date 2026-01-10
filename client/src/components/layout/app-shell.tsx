import { TopNav } from "./top-nav";
import { Link } from "wouter";
import { VERSION, FEATURES, VERSION_HISTORY } from "@/lib/version";
import { useState } from "react";
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
  // Check if dev banner is showing
  const isDev = typeof window !== "undefined" && window.location.hostname.includes("dev");

  return (
    <div className="min-h-screen text-foreground flex flex-col">
      <TopNav />
      <main className={cn(
        "flex-1 flex flex-col",
        isDev ? "pt-38 lg:pt-38" : "pt-24 lg:pt-24"
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
        
        <div className="mt-6 pt-6 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground/60">
            Powered by Australian infrastructure. Built with ❤️ in Queensland.
          </p>
          <VersionDialog />
        </div>
      </div>
    </footer>
  );
}
