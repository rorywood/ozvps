import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ServerCard } from "@/components/ui/server-card";
import { SkeletonServerGrid } from "@/components/ui/skeleton-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useQuery } from "@tanstack/react-query";
import {
  Server as ServerIcon,
  Search,
  Filter,
  Loader2,
  AlertCircle,
  Zap,
  AlertTriangle,
  Wallet,
  Ban
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useSyncPowerActions } from "@/hooks/use-power-actions";
import { useState } from "react";
import { EmailVerificationBanner } from "@/components/email-verification-banner";
import { useAuth } from "@/hooks/use-auth";

export default function ServerList() {
  useDocumentTitle('Servers');
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const { user } = useAuth();

  // Check if account is suspended - show blocked message
  if (user?.accountSuspended) {
    return (
      <AppShell>
        <div className="max-w-3xl mx-auto py-12">
          <div className="bg-destructive/10 border-l-4 border-l-destructive rounded-lg p-6">
            <div className="flex items-start gap-4">
              <Ban className="h-6 w-6 text-destructive flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h2 className="text-xl font-bold text-foreground mb-2">
                  Account Suspended
                </h2>
                <p className="text-muted-foreground mb-4">
                  Your account has been suspended and you cannot access your servers at this time.
                </p>
                {user.accountSuspendedReason && (
                  <div className="bg-destructive/10 rounded p-3 mb-4">
                    <p className="text-xs uppercase text-muted-foreground mb-1">Reason:</p>
                    <p className="text-sm text-foreground">{user.accountSuspendedReason}</p>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  Please contact support if you believe this is an error or to discuss reactivating your account.
                </p>
                <div className="mt-6 flex gap-3">
                  <Button variant="outline" asChild>
                    <Link href="/billing">View Billing</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/support">Contact Support</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const { data: dashboardData, isLoading, isError } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: () => api.getDashboardOverview(),
    refetchInterval: 10000, // 10 second refresh to reduce API load
  });

  const servers = dashboardData?.servers || [];
  const cancellations = dashboardData?.cancellations || {};
  const billingStatuses = dashboardData?.billingStatuses || {};

  // Find servers with billing issues (exclude admin suspensions)
  const billingSuspendedServers = servers.filter(s =>
    billingStatuses[s.id]?.status === 'suspended' && !billingStatuses[s.id]?.adminSuspended
  );
  const adminSuspendedServers = servers.filter(s =>
    billingStatuses[s.id]?.adminSuspended === true
  );
  const unpaidServers = servers.filter(s => billingStatuses[s.id]?.status === 'unpaid');
  const hasOverdueServers = billingSuspendedServers.length > 0 || unpaidServers.length > 0;

  useSyncPowerActions(servers);

  // Filter servers based on search query
  const filteredServers = servers.filter(server => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      server.name?.toLowerCase().includes(query) ||
      server.primaryIp?.toLowerCase().includes(query) ||
      server.plan?.name?.toLowerCase().includes(query) ||
      server.location?.name?.toLowerCase().includes(query)
    );
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <EmailVerificationBanner />

        {/* Admin Suspended Servers Alert */}
        {adminSuspendedServers.length > 0 && (
          <div className="border border-destructive/50 rounded-lg p-4 bg-destructive/5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-destructive mb-1">Account Suspended</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  <span className="block">
                    <span className="text-destructive font-medium">{adminSuspendedServers.length} server{adminSuspendedServers.length > 1 ? 's' : ''} suspended</span> due to terms of service violation.
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Please contact support if you believe this is an error.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Overdue Servers Alert (billing-related only) */}
        {hasOverdueServers && (
          <div className="border border-destructive/50 rounded-lg p-4 bg-destructive/5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-destructive mb-1">Payment Required</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  {billingSuspendedServers.length > 0 && (
                    <span className="block">
                      <span className="text-destructive font-medium">{billingSuspendedServers.length} server{billingSuspendedServers.length > 1 ? 's' : ''} suspended</span> due to non-payment.
                    </span>
                  )}
                  {unpaidServers.length > 0 && (
                    <span className="block mt-1">
                      <span className="text-warning font-medium">{unpaidServers.length} server{unpaidServers.length > 1 ? 's' : ''} unpaid</span> and will be suspended soon.
                    </span>
                  )}
                </p>
                <Button size="sm" variant="destructive" asChild>
                  <Link href="/billing">
                    <Wallet className="h-4 w-4 mr-2" />
                    Add Funds
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        )}

        <PageHeader
          title="Servers"
          description="Manage your virtual private servers"
          action={
            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search servers..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button variant="outline">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
            </div>
          }
        />

        {isLoading ? (
          <SkeletonServerGrid count={6} />
        ) : isError ? (
          <Card padding="lg" className="flex flex-col items-center justify-center text-center">
            <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Failed to Load Servers</h3>
            <p className="text-muted-foreground max-w-md">
              Unable to fetch servers. Please try again later.
            </p>
          </Card>
        ) : filteredServers.length === 0 ? (
          <Card padding="lg" className="flex flex-col items-center justify-center text-center py-14" data-testid="empty-servers-state">
            <div className="relative mb-8">
              <div className="h-24 w-24 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <ServerIcon className="h-12 w-12 text-primary" />
              </div>
              <div className="absolute -inset-4 rounded-3xl bg-primary/5 -z-10 blur-xl" />
            </div>
            <h3 className="text-2xl font-semibold text-foreground mb-3">
              {searchQuery ? 'No Matching Servers' : 'No Servers Yet'}
            </h3>
            <p className="text-muted-foreground max-w-sm mb-8 text-sm leading-relaxed">
              {searchQuery
                ? `No servers match "${searchQuery}". Try a different search term.`
                : "Deploy your first VPS in seconds. Australian infrastructure, instant setup, no lock-in contracts."
              }
            </p>
            {!searchQuery && (
              <>
                <Button data-testid="button-order-server" asChild className="btn-glow mb-8">
                  <Link href="/deploy">
                    <Zap className="h-4 w-4 mr-2" />
                    Deploy Your First Server
                  </Link>
                </Button>
                <div className="flex items-center gap-6 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-success inline-block" />Brisbane, AU</span>
                  <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-primary inline-block" />From $7/mo</span>
                  <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-info inline-block" />No lock-in</span>
                </div>
              </>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredServers.map((server) => (
              <ServerCard
                key={server.id}
                server={server}
                cancellation={cancellations[server.id]}
                billingStatus={billingStatuses[server.id]}
                onClick={() => setLocation(`/servers/${server.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
