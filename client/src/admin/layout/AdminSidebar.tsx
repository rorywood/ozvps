import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  LayoutDashboard,
  Users,
  Server,
  DollarSign,
  MessageSquare,
  ArrowLeft,
  LogOut,
  ShieldCheck,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/servers", label: "Servers", icon: Server },
  { href: "/admin/billing", label: "Billing", icon: DollarSign },
  { href: "/admin/tickets", label: "Tickets", icon: MessageSquare },
];

export function AdminSidebar() {
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: auth } = useQuery({
    queryKey: ['auth'],
    queryFn: () => api.getAuthUser(),
    retry: false,
  });

  const handleLogout = async () => {
    try {
      await api.logout();
      queryClient.clear();
      window.location.href = '/login';
    } catch {
      window.location.href = '/login';
    }
  };

  const isActive = (href: string) => {
    if (href === "/admin") {
      return location === "/admin";
    }
    return location.startsWith(href);
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">OZVPS</h1>
            <p className="text-xs text-amber-400 font-medium">Admin Panel</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                active
                  ? "bg-amber-500/10 text-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.1)]"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "text-amber-400" : ""}`} />
              <span className="font-medium">{item.label}</span>
              {active && (
                <div className="ml-auto h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Info & Actions */}
      <div className="p-4 border-t border-white/5 space-y-2">
        {auth && (
          <div className="px-4 py-3 rounded-lg bg-white/5">
            <p className="text-sm text-white font-medium truncate">{auth.email}</p>
            <p className="text-xs text-slate-500">Administrator</p>
          </div>
        )}

        <Link
          href="/dashboard"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">Exit Admin</span>
        </Link>

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all w-full"
        >
          <LogOut className="h-5 w-5" />
          <span className="font-medium">Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Menu Button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 lg:hidden bg-slate-900/90 text-white hover:bg-slate-800"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-200 ease-in-out lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ backgroundColor: 'hsl(219, 95%, 4%)' }}
      >
        <SidebarContent />
      </aside>

      {/* Desktop Sidebar */}
      <aside
        className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0"
        style={{ backgroundColor: 'hsl(219, 95%, 4%)' }}
      >
        <SidebarContent />
      </aside>
    </>
  );
}
