import { TopNav } from "./top-nav";
import { Link } from "wouter";
import { VERSION } from "@/lib/version";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen text-foreground flex flex-col">
      <TopNav />
      <main className="flex-1 pt-24 lg:pt-24 flex flex-col">
        <div className="container mx-auto p-4 sm:p-6 lg:p-8 max-w-7xl animate-in fade-in duration-500 flex-1">
          {children}
        </div>
      </main>
      <Footer />
    </div>
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
          <span className="text-xs font-mono text-muted-foreground/40">
            v{VERSION}
          </span>
        </div>
      </div>
    </footer>
  );
}
