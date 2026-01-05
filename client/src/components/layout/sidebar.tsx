import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Server, 
  Settings
} from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";

export function Sidebar() {
  const [location] = useLocation();

  const navItems = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/servers", icon: Server, label: "Servers" },
    { href: "/account", icon: Settings, label: "Settings" },
  ];

  return (
    <div className="h-screen w-64 flex flex-col glass-panel border-r border-white/5 fixed left-0 top-0 z-50">
      <div className="p-6 flex items-center justify-center">
        <img src={logo} alt="OzVPS" className="h-16 w-auto" data-testid="img-logo" />
      </div>

      <div className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div
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

      <div className="p-4 border-t border-white/5">
        <div className="px-3 py-3 rounded-lg bg-white/5 border border-white/5">
          <p className="text-xs text-muted-foreground text-center">OzVPS Panel</p>
        </div>
      </div>
    </div>
  );
}
