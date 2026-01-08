import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Server, 
  LogOut,
  Menu,
  ChevronDown,
  Zap,
  Wallet,
  ShieldCheck,
  User,
  Settings,
  CreditCard
} from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getGravatarUrl } from "@/lib/gravatar";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/servers", icon: Server, label: "Servers" },
  { href: "/deploy", icon: Zap, label: "Deploy" },
  { href: "/billing", icon: Wallet, label: "Billing" },
];

const adminNavItems = [
  { href: "/admin", icon: ShieldCheck, label: "Admin Center" },
];

function formatBalance(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDisplayName(name?: string, email?: string): string {
  if (name) {
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  if (email) {
    const localPart = email.split('@')[0];
    return localPart.charAt(0).toUpperCase() + localPart.slice(1);
  }
  return 'User';
}

interface UserMeResponse {
  user: {
    id: number | string;
    email: string;
    name?: string;
    isAdmin?: boolean;
  };
}

function UserAvatar({ email, name, size = 32 }: { email: string; name?: string; size?: number }) {
  const gravatarUrl = getGravatarUrl(email, size * 2);
  const initials = name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : email[0].toUpperCase();
  
  return (
    <div 
      className="relative rounded-full overflow-hidden ring-2 ring-white/10 hover:ring-primary/50 transition-all"
      style={{ width: size, height: size }}
    >
      <img 
        src={gravatarUrl} 
        alt={name || email}
        className="w-full h-full object-cover"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
          e.currentTarget.nextElementSibling?.classList.remove('hidden');
        }}
      />
      <div className="hidden absolute inset-0 bg-primary/20 flex items-center justify-center text-xs font-medium text-white">
        {initials}
      </div>
    </div>
  );
}

function ProfileDropdown() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: userData } = useQuery<UserMeResponse>({
    queryKey: ['auth', 'me'],
    queryFn: () => api.getCurrentUser(),
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 30,
    retry: false,
  });

  const { data: walletData } = useQuery<{ wallet: { balanceCents: number } }>({
    queryKey: ['wallet'],
    queryFn: () => api.getWallet(),
    refetchInterval: 30000,
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      queryClient.setQueryData(['auth'], null);
      queryClient.setQueryData(['auth', 'me'], null);
      queryClient.setQueryData(['auth', 'session'], null);
      queryClient.clear();
      window.location.href = '/login';
    },
  });

  const user = userData?.user;
  const balance = walletData?.wallet?.balanceCents;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button 
          className="flex items-center gap-2 p-1.5 pr-2 rounded-full hover:bg-foreground/5 transition-colors"
          data-testid="button-profile-dropdown"
        >
          {user?.email && <UserAvatar email={user.email} name={user.name} size={36} />}
          <span className="hidden sm:block text-sm font-medium text-foreground max-w-[120px] truncate" data-testid="text-nav-username">
            {formatDisplayName(user?.name, user?.email)}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="w-64 bg-card/95 backdrop-blur-xl border-border"
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center gap-3 py-1">
            {user?.email && <UserAvatar email={user.email} name={user.name} size={40} />}
            <div className="flex flex-col space-y-0.5 overflow-hidden">
              <p className="text-sm font-medium text-foreground truncate">{formatDisplayName(user?.name, user?.email)}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
        </DropdownMenuLabel>
        
        {balance !== undefined && (
          <>
            <DropdownMenuSeparator className="bg-border" />
            <div className="px-2 py-2">
              <div className="flex items-center justify-between px-2 py-2 rounded-lg bg-primary/5 border border-primary/10">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Wallet className="h-3.5 w-3.5 text-primary" />
                  <span>Balance</span>
                </div>
                <span className="font-mono text-sm font-medium text-foreground" data-testid="text-dropdown-balance">
                  {formatBalance(balance)}
                </span>
              </div>
            </div>
          </>
        )}
        
        <DropdownMenuSeparator className="bg-border" />
        
        <Link href="/account">
          <DropdownMenuItem className="cursor-pointer focus:bg-foreground/5" data-testid="dropdown-account">
            <User className="mr-2 h-4 w-4" />
            <span>Profile Settings</span>
          </DropdownMenuItem>
        </Link>
        
        <Link href="/billing">
          <DropdownMenuItem className="cursor-pointer focus:bg-foreground/5" data-testid="dropdown-billing">
            <CreditCard className="mr-2 h-4 w-4" />
            <span>Billing & Payments</span>
          </DropdownMenuItem>
        </Link>
        
        <DropdownMenuSeparator className="bg-border" />
        
        <DropdownMenuItem 
          className="cursor-pointer focus:bg-foreground/5 text-red-400 focus:text-red-400"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          data-testid="dropdown-logout"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>{logoutMutation.isPending ? "Signing out..." : "Sign Out"}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DesktopNav() {
  const [location] = useLocation();
  
  const { data: userData } = useQuery<UserMeResponse>({
    queryKey: ['auth', 'me'],
    queryFn: () => api.getCurrentUser(),
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 30,
    retry: false,
  });

  const { data: walletData } = useQuery<{ wallet: { balanceCents: number } }>({
    queryKey: ['wallet'],
    queryFn: () => api.getWallet(),
    refetchInterval: 30000,
    retry: false,
  });

  const isAdmin = userData?.user?.isAdmin ?? false;
  const balance = walletData?.wallet?.balanceCents;

  return (
    <header className="hidden lg:block fixed top-0 left-0 right-0 z-50 glass-panel border-b border-border/50">
      <div className="container mx-auto max-w-7xl px-6">
        <div className="flex items-center justify-between h-20">
          <div className="flex items-center gap-8">
            <Link href="/dashboard">
              <img src={logo} alt="OzVPS" className="h-14 w-auto cursor-pointer" data-testid="img-logo" />
            </Link>
            
            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href));
                return (
                  <Link key={item.href} href={item.href}>
                    <div
                      data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                      )}
                    >
                      <item.icon className={cn("h-4 w-4", isActive ? "text-primary" : "")} />
                      {item.label}
                    </div>
                  </Link>
                );
              })}
              
              {isAdmin && (
                <>
                  <div className="w-px h-6 bg-border mx-2" />
                  {adminNavItems.map((item) => {
                    const isActive = location === item.href || location.startsWith(item.href);
                    return (
                      <Link key={item.href} href={item.href}>
                        <div
                          data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
                          className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer",
                            isActive
                              ? "bg-amber-500/10 text-amber-400"
                              : "text-amber-400/70 hover:text-amber-400 hover:bg-amber-500/5"
                          )}
                        >
                          <item.icon className={cn("h-4 w-4", isActive ? "text-amber-400" : "")} />
                          {item.label}
                        </div>
                      </Link>
                    );
                  })}
                </>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {balance !== undefined && (
              <Link href="/billing">
                <div 
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                  data-testid="nav-balance"
                >
                  <Wallet className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-400">
                    {formatBalance(balance)}
                  </span>
                </div>
              </Link>
            )}
            <div className="w-px h-6 bg-border" />
            <ProfileDropdown />
          </div>
        </div>
      </div>
    </header>
  );
}

function MobileNav() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: userData } = useQuery<UserMeResponse>({
    queryKey: ['auth', 'me'],
    queryFn: () => api.getCurrentUser(),
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 30,
    retry: false,
  });

  const { data: walletData } = useQuery<{ wallet: { balanceCents: number } }>({
    queryKey: ['wallet'],
    queryFn: () => api.getWallet(),
    refetchInterval: 30000,
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      queryClient.setQueryData(['auth'], null);
      queryClient.setQueryData(['auth', 'me'], null);
      queryClient.setQueryData(['auth', 'session'], null);
      queryClient.clear();
      window.location.href = '/login';
    },
  });

  const user = userData?.user;
  const isAdmin = user?.isAdmin ?? false;
  const balance = walletData?.wallet?.balanceCents;

  const allNavItems = [
    ...navItems,
    { href: "/account", icon: Settings, label: "Account" },
  ];

  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 z-50 glass-panel border-b border-border/50">
      <div className="flex items-center justify-between p-4">
        <Link href="/dashboard">
          <img src={logo} alt="OzVPS" className="h-12 w-auto cursor-pointer" data-testid="img-logo-mobile" />
        </Link>
        
        <div className="flex items-center gap-3">
          {balance !== undefined && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/5 border border-primary/10" data-testid="mobile-balance-display">
              <Wallet className="h-3.5 w-3.5 text-primary" />
              <span className="font-mono text-xs font-medium text-foreground">
                {formatBalance(balance)}
              </span>
            </div>
          )}
          
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                className="p-2 rounded-lg hover:bg-foreground/5 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                data-testid="button-mobile-menu"
                aria-label="Open navigation menu"
              >
                <Menu className="h-6 w-6" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-0 glass-panel border-l border-border">
              <div className="h-full flex flex-col">
                <div className="p-6 border-b border-border">
                  {user?.email && (
                    <div className="flex items-center gap-3">
                      <UserAvatar email={user.email} name={user.name} size={48} />
                      <div className="flex flex-col overflow-hidden">
                        <p className="text-sm font-medium text-foreground truncate">{formatDisplayName(user.name, user.email)}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex-1 px-3 py-4 space-y-1">
                  {allNavItems.map((item) => {
                    const isActive = location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href));
                    return (
                      <Link key={item.href} href={item.href}>
                        <div
                          onClick={() => setOpen(false)}
                          data-testid={`mobile-nav-${item.label.toLowerCase().replace(' ', '-')}`}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer",
                            isActive
                              ? "bg-primary/10 text-primary border border-primary/20"
                              : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                          )}
                        >
                          <item.icon className={cn("h-4 w-4", isActive ? "text-primary" : "")} />
                          {item.label}
                        </div>
                      </Link>
                    );
                  })}

                  {isAdmin && (
                    <>
                      <div className="my-3 border-t border-border" />
                      {adminNavItems.map((item) => {
                        const isActive = location === item.href || location.startsWith(item.href);
                        return (
                          <Link key={item.href} href={item.href}>
                            <div
                              onClick={() => setOpen(false)}
                              data-testid={`mobile-nav-${item.label.toLowerCase().replace(' ', '-')}`}
                              className={cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer",
                                isActive
                                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                  : "text-amber-400/70 hover:text-amber-400 hover:bg-amber-500/5"
                              )}
                            >
                              <item.icon className={cn("h-4 w-4", isActive ? "text-amber-400" : "")} />
                              {item.label}
                            </div>
                          </Link>
                        );
                      })}
                    </>
                  )}
                </div>

                <div className="p-4 border-t border-border space-y-3">
                  <button
                    onClick={() => logoutMutation.mutate()}
                    disabled={logoutMutation.isPending}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-all duration-200"
                    data-testid="mobile-button-logout"
                  >
                    <LogOut className="h-4 w-4" />
                    {logoutMutation.isPending ? "Signing out..." : "Sign Out"}
                  </button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

export function TopNav() {
  return (
    <>
      <DesktopNav />
      <MobileNav />
    </>
  );
}
