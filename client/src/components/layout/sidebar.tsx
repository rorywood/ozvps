import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Server, 
  PlusCircle, 
  Network, 
  CreditCard, 
  Settings, 
  LogOut
} from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";

export function Sidebar() {
  const [location] = useLocation();

  const navItems = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/servers", icon: Server, label: "Servers" },
    { href: "/provision", icon: PlusCircle, label: "Deploy New" },
    { href: "/networking", icon: Network, label: "Networking" },
    { href: "/billing", icon: CreditCard, label: "Billing" },
    { href: "/account", icon: Settings, label: "Account" },
  ];

  return (
    <div className="h-screen w-64 flex flex-col glass-panel border-r border-white/5 fixed left-0 top-0 z-50">
      <div className="p-6 flex items-center justify-center">
        <img src={logo} alt="CloudASN" className="h-10 w-auto" />
      </div>

      <div className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div
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
        <div className="flex items-center gap-3 px-3 py-3 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 transition-colors cursor-pointer group">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shadow-inner">
            JD
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium text-white truncate group-hover:text-primary transition-colors">John Doe</p>
            <p className="text-xs text-muted-foreground truncate">$145.50 Credit</p>
          </div>
          <LogOut className="h-4 w-4 text-muted-foreground hover:text-white transition-colors" />
        </div>
      </div>
    </div>
  );
}
