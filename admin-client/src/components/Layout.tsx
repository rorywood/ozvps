import { useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import logo from "../assets/logo.png";
import {
  LayoutDashboard,
  Users,
  Server,
  CreditCard,
  MessageSquare,
  Activity,
  FileText,
  Shield,
  ShieldCheck,
  Tag,
  LogOut,
  Menu,
  X,
  Plus,
  ChevronRight,
} from "lucide-react";

const navItems = [
  { path: "/", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/users", icon: Users, label: "Users" },
  {
    path: "/servers",
    icon: Server,
    label: "Servers",
    children: [{ path: "/servers/provision", label: "Provision Server" }],
  },
  { path: "/billing", icon: CreditCard, label: "Billing" },
  { path: "/promo-codes", icon: Tag, label: "Promo Codes" },
  { path: "/tickets", icon: MessageSquare, label: "Tickets" },
  { path: "/health", icon: Activity, label: "Health" },
  { path: "/logs", icon: FileText, label: "Logs" },
  { path: "/security", icon: ShieldCheck, label: "Security" },
  { path: "/whitelist", icon: Shield, label: "IP Whitelist" },
];

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/users": "Users",
  "/servers": "Servers",
  "/servers/provision": "Provision Server",
  "/billing": "Billing",
  "/promo-codes": "Promo Codes",
  "/tickets": "Support Tickets",
  "/health": "System Health",
  "/logs": "Logs",
  "/security": "Security Settings",
  "/whitelist": "IP Whitelist",
};

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
  };

  const pageTitle = pageTitles[location.pathname] || "Admin Panel";

  const isNavActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  return (
    <div className="min-h-screen bg-[hsl(216_33%_6%)]">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-[hsl(216_28%_7%)] border-r border-white/8 transform transition-transform duration-200 ease-in-out lg:translate-x-0 flex flex-col ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/8">
          <div className="flex items-center gap-3">
            <img src={logo} alt="OzVPS" className="h-10" />
            <div>
              <p className="text-xs font-medium text-white/40 uppercase tracking-wider">Admin Panel</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-white/40 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Provision Server CTA */}
        <div className="px-3 pt-4 pb-2">
          <Link
            to="/servers/provision"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-[hsl(210_100%_50%)] hover:bg-[hsl(210_100%_45%)] text-white rounded-lg font-medium text-sm transition-colors"
          >
            <Plus className="h-4 w-4" />
            Provision Server
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const active = isNavActive(item.path);
            const hasChildren = item.children && item.children.length > 0;

            return (
              <div key={item.path}>
                <Link
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    active && location.pathname === item.path
                      ? "bg-[hsl(210_100%_50%)/10] text-[hsl(210_100%_70%)] border-l-2 border-[hsl(210_100%_50%)] pl-[10px]"
                      : active
                      ? "bg-white/5 text-white border-l-2 border-transparent"
                      : "text-white/60 hover:text-white hover:bg-white/5 border-l-2 border-transparent"
                  }`}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {hasChildren && <ChevronRight className="h-3 w-3 opacity-40" />}
                </Link>

                {/* Sub-items - show when parent is active */}
                {hasChildren && active && item.children && (
                  <div className="ml-6 mt-0.5 space-y-0.5">
                    {item.children.map((child) => (
                      <Link
                        key={child.path}
                        to={child.path}
                        onClick={() => setSidebarOpen(false)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                          location.pathname === child.path
                            ? "text-[hsl(210_100%_70%)] bg-[hsl(210_100%_50%)/10]"
                            : "text-white/50 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* User / Logout */}
        <div className="border-t border-white/8 p-3 space-y-1">
          <div className="px-3 py-2">
            <p className="text-sm font-medium text-white truncate">{user?.name || user?.email}</p>
            <p className="text-xs text-white/40 truncate">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 rounded-lg transition-all"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-[hsl(216_28%_7%)] border-b border-white/8 h-14 flex items-center px-4 gap-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-white/60 hover:text-white transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1 lg:hidden flex justify-center">
            <img src={logo} alt="OzVPS" className="h-9" />
          </div>

          <h1 className="hidden lg:block text-base font-semibold text-white">{pageTitle}</h1>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden sm:block text-xs text-white/40">
              {new Date().toLocaleDateString("en-AU", {
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
