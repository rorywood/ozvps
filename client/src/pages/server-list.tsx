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
  Wallet
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useSyncPowerActions } from "@/hooks/use-power-actions";
import { useState } from "react";
import { EmailVerificationBanner } from "@/components/email-verification-banner";

export default function ServerList() {
  useDocumentTitle('Servers');
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: dashboardData, isLoading, isError } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: () => api.getDashboardOverview(),
    refetchInterval: 1000, // 1 second refresh for real-time updates
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
          <Card padding="lg" className="flex flex-col items-center justify-center text-center" data-testid="empty-servers-state">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <ServerIcon className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">
              {searchQuery ? 'No Matching Servers' : 'No Servers Yet'}
            </h3>
            <p className="text-muted-foreground max-w-md mb-6">
              {searchQuery
                ? `No servers match "${searchQuery}". Try a different search term.`
                : "You don't have any VPS servers yet. Deploy a server to get started."
              }
            </p>
            {!searchQuery && (
              <Button variant="outline" data-testid="button-order-server" asChild>
                <Link href="/deploy">
                  <Zap className="h-4 w-4 mr-2" />
                  Deploy a Server
                </Link>
              </Button>
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
