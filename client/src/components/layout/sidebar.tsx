import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Server, 
  Settings,
  LogOut,
  Menu,
  X,
  Info,
  ChevronDown,
  ChevronUp,
  ShoppingCart
} from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import { VERSION, FEATURES, VERSION_HISTORY } from "@/lib/version";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/servers", icon: Server, label: "Servers" },
  { href: "/order", icon: ShoppingCart, label: "Order" },
  { href: "/account", icon: Settings, label: "Settings" },
];

function VersionFooter() {
  const [expanded, setExpanded] = useState(false);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors cursor-pointer"
          data-testid="button-version-info"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">OzVPS Panel</p>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-mono text-primary">v{VERSION}</span>
              <Info className="h-3 w-3 text-muted-foreground" />
            </div>
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md bg-[#0a0a0a]/95 backdrop-blur-xl border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            OzVPS Panel v{VERSION}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-white mb-2">Features</h4>
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
                className="flex items-center gap-2 text-sm font-semibold text-white hover:text-primary transition-colors"
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

function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const logoutMutation = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth'] });
      setLocation('/login');
    },
  });

  return (
    <>
      <div className="p-6 flex items-center justify-center">
        <img src={logo} alt="OzVPS" className="h-16 w-auto" data-testid="img-logo" />
      </div>

      <div className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div
                onClick={onNavClick}
                data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer group",
                  isActive
                    ? "bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]"
                    : "text-muted-foreground hover:text-white hover:bg-white/5"
                )}
              >
                <item.icon className={cn("h-4 w-4 transition-colors", isActive ? "text-primary" : "text-muted-foreground group-hover:text-white")} />
                {item.label}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t border-white/5 space-y-2">
        <button
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-white hover:bg-white/5 transition-all duration-200"
          data-testid="button-logout"
        >
          <LogOut className="h-4 w-4" />
          {logoutMutation.isPending ? "Signing out..." : "Sign Out"}
        </button>
        <VersionFooter />
      </div>
    </>
  );
}

export function DesktopSidebar() {
  return (
    <div className="hidden lg:flex h-screen w-64 flex-col glass-panel border-r border-white/5 fixed left-0 top-0 z-50">
      <SidebarContent />
    </div>
  );
}

export function MobileHeader() {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden fixed top-0 left-0 right-0 z-50 glass-panel border-b border-white/5">
      <div className="flex items-center justify-between p-4">
        <img src={logo} alt="OzVPS" className="h-10 w-auto" data-testid="img-logo-mobile" />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              className="p-2 rounded-lg hover:bg-white/5 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              data-testid="button-mobile-menu"
              aria-label="Open navigation menu"
            >
              <Menu className="h-6 w-6" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 glass-panel border-r border-white/5">
            <div className="h-full flex flex-col">
              <SidebarContent onNavClick={() => setOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <>
      <DesktopSidebar />
      <MobileHeader />
    </>
  );
}
