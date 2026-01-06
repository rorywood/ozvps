import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/sidebar";
import { ShieldCheck, Users, CreditCard, Package, RefreshCw, AlertTriangle } from "lucide-react";
import { Redirect } from "wouter";

interface UserMeResponse {
  user: {
    id: number | string;
    email: string;
    name?: string;
    isAdmin?: boolean;
  };
}

export default function AdminPage() {
  const { data: userData, isLoading } = useQuery<UserMeResponse>({
    queryKey: ['auth', 'me'],
    queryFn: () => api.getCurrentUser(),
    staleTime: 1000 * 60 * 5,
  });

  const isAdmin = userData?.user?.isAdmin ?? false;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-dark">
        <Sidebar />
        <main className="lg:pl-64 pt-16 lg:pt-0 min-h-screen">
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="animate-pulse">
              <div className="h-8 bg-white/5 rounded w-48 mb-4" />
              <div className="h-4 bg-white/5 rounded w-96 mb-8" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!isAdmin) {
    return <Redirect to="/dashboard" />;
  }

  return (
    <div className="min-h-screen bg-gradient-dark">
      <Sidebar />
      <main className="lg:pl-64 pt-16 lg:pt-0 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <ShieldCheck className="h-8 w-8 text-amber-400" />
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-white">
                Admin Panel
              </h1>
            </div>
            <p className="text-muted-foreground">
              Manage users, wallets, plans, and system settings.
            </p>
          </div>

          <div className="glass-panel rounded-xl p-6 border border-amber-500/20 bg-amber-500/5 mb-8">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-medium text-amber-400 mb-1">Admin Access</h3>
                <p className="text-sm text-muted-foreground">
                  You have administrator access. For advanced operations, use the <code className="px-1.5 py-0.5 rounded bg-white/10 text-amber-300 font-mono text-xs">ozvpsctl</code> command-line tool on the server.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <AdminCard
              icon={Users}
              title="User Management"
              description="View and manage user accounts, wallet balances, and transaction history."
              status="Use ozvpsctl users"
            />
            <AdminCard
              icon={CreditCard}
              title="Wallet Operations"
              description="Add, remove, or adjust user credits and view transaction logs."
              status="Use ozvpsctl wallet"
            />
            <AdminCard
              icon={Package}
              title="Plan Management"
              description="View and sync VPS plans from VirtFusion. Plans auto-sync every 10 minutes."
              status="Use ozvpsctl plans"
            />
            <AdminCard
              icon={RefreshCw}
              title="System Sync"
              description="Force synchronization of plans, Stripe data, or other system components."
              status="Use ozvpsctl sync"
            />
          </div>

          <div className="mt-8 glass-panel rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">CLI Quick Reference</h2>
            <div className="space-y-3 font-mono text-sm">
              <CliCommand cmd="sudo ozvpsctl" desc="Start interactive admin menu" />
              <CliCommand cmd="sudo ozvpsctl users list" desc="List all users with balances" />
              <CliCommand cmd="sudo ozvpsctl wallet add <email> <amount>" desc="Add credits to user" />
              <CliCommand cmd="sudo ozvpsctl wallet remove <email> <amount>" desc="Remove credits" />
              <CliCommand cmd="sudo ozvpsctl plans sync" desc="Force VirtFusion plan sync" />
              <CliCommand cmd="sudo ozvpsctl stripe verify" desc="Verify Stripe configuration" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function AdminCard({ 
  icon: Icon, 
  title, 
  description, 
  status 
}: { 
  icon: React.ElementType; 
  title: string; 
  description: string; 
  status: string;
}) {
  return (
    <div className="glass-panel rounded-xl p-6 border border-white/5 hover:border-white/10 transition-colors">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-lg bg-amber-500/10">
          <Icon className="h-5 w-5 text-amber-400" />
        </div>
        <h3 className="font-semibold text-white">{title}</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">{description}</p>
      <div className="text-xs text-amber-400/70 font-mono">{status}</div>
    </div>
  );
}

function CliCommand({ cmd, desc }: { cmd: string; desc: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
      <code className="px-2 py-1 rounded bg-white/5 text-primary flex-shrink-0">{cmd}</code>
      <span className="text-muted-foreground text-xs sm:text-sm">{desc}</span>
    </div>
  );
}
