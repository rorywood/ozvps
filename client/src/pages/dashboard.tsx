import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { PageSection } from "@/components/layout/page-section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useDocumentTitle } from "@/hooks/use-document-title";
import {
  Server as ServerIcon,
  AlertCircle,
  ChevronRight,
  AlertTriangle,
  Wallet,
  Ban,
  Gift
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { usePowerActions, useSyncPowerActions } from "@/hooks/use-power-actions";
import { cn } from "@/lib/utils";
import { EmailVerificationBanner } from "@/components/email-verification-banner";
import { useAuth } from "@/hooks/use-auth";

export default function Dashboard() {
  useDocumentTitle('Dashboard');
  const [, setLocation] = useLocation();
  const { getDisplayStatus } = usePowerActions();
  const { user } = useAuth();

  // Combined dashboard query - reduces 4 API calls to 1
  const { data: dashboardData, isLoading, error } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: () => api.getDashboardOverview(),
    staleTime: 0, // Always fetch fresh data for real-time status
    refetchInterval: (query) => {
      // If any server needs setup or is provisioning, poll faster
      const data = query.state.data;
      const hasProvisioningServers = data?.servers?.some((s: any) =>
        s.needsSetup || s.status === 'building' || s.status === 'provisioning'
      );
      if (hasProvisioningServers) {
        return 3000; // 3 seconds during provisioning
      }
      // Normal operation: 10 second refresh to reduce API load
      return 10000;
    },
  });

  // Query wallet balance for overdue payment handling
  const { data: walletData } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.getWallet(),
    staleTime: 30000,
  });

  const servers = dashboardData?.servers || [];
  const bandwidthData = dashboardData?.bandwidth;
  const cancellations = dashboardData?.cancellations || {};
  const billingStatuses = dashboardData?.billingStatuses || {};
  const walletBalance = walletData?.wallet?.balanceCents || 0;

  // Helper to calculate days overdue (uses UTC to avoid timezone/DST issues)
  const getDaysOverdue = (nextBillAt?: string): number => {
    if (!nextBillAt) return 0;
    const billDate = new Date(nextBillAt);
    const now = new Date();
    const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const billDateUTC = Date.UTC(billDate.getFullYear(), billDate.getMonth(), billDate.getDate());
    const daysUntil = Math.round((billDateUTC - todayUTC) / (1000 * 60 * 60 * 24));
    return daysUntil < 0 ? Math.abs(daysUntil) : 0;
  };

  // Find servers with billing issues (exclude admin suspensions)
  const billingSuspendedServers = servers.filter(s =>
    billingStatuses[s.id]?.status === 'suspended' && !billingStatuses[s.id]?.adminSuspended
  );
  const adminSuspendedServers = servers.filter(s =>
    billingStatuses[s.id]?.adminSuspended === true
  );
  const unpaidServers = servers.filter(s => billingStatuses[s.id]?.status === 'unpaid');
  const hasOverdueServers = billingSuspendedServers.length > 0 || unpaidServers.length > 0;

  // Find servers overdue by more than 2 days (critical)
  const criticalOverdueServers = servers.filter(s => {
    const billing = billingStatuses[s.id];
    if (!billing || billing.freeServer || billing.adminSuspended) return false;
    const daysOverdue = getDaysOverdue(billing.nextBillAt);
    return daysOverdue > 2;
  });

  // Calculate total amount owed for critical overdue servers
  const totalAmountOwed = criticalOverdueServers.reduce((sum, s) => {
    return sum + (billingStatuses[s.id]?.monthlyPriceCents || 0);
  }, 0);

  const hasSufficientFunds = walletBalance >= totalAmountOwed;

  useSyncPowerActions(servers);

  const stats = {
    total_servers: servers.length,
    active_servers: servers.filter(s => s.status === 'running').length,
    total_cpu_cores: servers.reduce((sum, s) => sum + (s.plan?.specs?.vcpu || 0), 0),
    total_ram_gb: Math.round(servers.reduce((sum, s) => sum + (s.plan?.specs?.ram || 0), 0) / 1024),
    total_disk_gb: servers.reduce((sum, s) => sum + (s.plan?.specs?.disk || 0), 0),
  };

  const formatBandwidth = (bytes: number): string => {
    const gb = bytes / (1024 * 1024 * 1024);
    // Bandwidth uses decimal units (1TB = 1000GB), not binary (1TiB = 1024GiB)
    if (gb >= 1000) {
      const tb = gb / 1000;
      return `${tb.toFixed(2)} TB`;
    } else if (gb >= 1) {
      return `${gb.toFixed(2)} GB`;
    } else {
      const mb = bytes / (1024 * 1024);
      return `${mb.toFixed(2)} MB`;
    }
  };

  return (
    <AppShell>
      <div className="space-y-8">
        <EmailVerificationBanner />

        {/* Account Suspended Banner */}
        {user?.accountSuspended && (
          <div className="border-2 border-orange-500 rounded-lg p-5 bg-orange-500/10">
            <div className="flex items-start gap-4">
              <div className="bg-orange-500 rounded-full p-2 flex-shrink-0">
                <Ban className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-orange-500 text-lg mb-2">Account Suspended</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Your account has been suspended. You cannot deploy new servers or make changes to existing servers.
                </p>
                {user.accountSuspendedReason && (
                  <div className="mt-2 p-2 bg-orange-500/10 rounded border border-orange-500/20">
                    <p className="text-xs uppercase text-muted-foreground mb-1">Reason:</p>
                    <p className="text-sm text-foreground">{user.accountSuspendedReason}</p>
                  </div>
                )}
                <p className="text-sm text-muted-foreground mt-3">
                  Please contact support if you believe this is an error.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Critical Overdue Banner - More than 2 days overdue */}
        {criticalOverdueServers.length > 0 && (
          <div className="border-2 border-red-500 rounded-lg p-5 bg-red-500/10">
            <div className="flex items-start gap-4">
              <div className="bg-red-500 rounded-full p-2 flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-red-500 text-lg mb-2">Urgent: Payment Overdue</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  You have <span className="text-red-500 font-semibold">{criticalOverdueServers.length} server{criticalOverdueServers.length > 1 ? 's' : ''}</span> with
                  payments overdue by more than 2 days. Your server{criticalOverdueServers.length > 1 ? 's' : ''} may be suspended or deleted if payment is not received.
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {criticalOverdueServers.map(s => {
                    const daysOverdue = getDaysOverdue(billingStatuses[s.id]?.nextBillAt);
                    return (
                      <span key={s.id} className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded">
                        {s.name || `Server #${s.id}`} ({daysOverdue} days overdue)
                      </span>
                    );
                  })}
                </div>
                <div className="flex items-center gap-3 pt-2 border-t border-red-500/30">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Amount owed: </span>
                    <span className="font-bold text-red-500">
                      {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(totalAmountOwed / 100)}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Wallet balance: </span>
                    <span className={`font-bold ${hasSufficientFunds ? 'text-green-500' : 'text-amber-500'}`}>
                      {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(walletBalance / 100)}
                    </span>
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  {hasSufficientFunds ? (
                    <Button variant="destructive" asChild>
                      <Link href="/billing">
                        <Wallet className="h-4 w-4 mr-2" />
                        Pay Now
                      </Link>
                    </Button>
                  ) : (
                    <>
                      <Button variant="destructive" asChild>
                        <Link href="/billing">
                          <Wallet className="h-4 w-4 mr-2" />
                          Top Up Wallet
                        </Link>
                      </Button>
                      <p className="text-xs text-amber-500 self-center">
                        Insufficient funds - please add{' '}
                        {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format((totalAmountOwed - walletBalance) / 100)}{' '}
                        to your wallet
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

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
                    {adminSuspendedServers.map(s => (
                      <span key={s.id} className="text-muted-foreground"> • {s.name || `Server #${s.id}`}</span>
                    ))}
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
                      {billingSuspendedServers.map(s => (
                        <span key={s.id} className="text-muted-foreground"> • {s.name || `Server #${s.id}`}</span>
                      ))}
                    </span>
                  )}
                  {unpaidServers.length > 0 && (
                    <span className="block mt-1">
                      <span className="text-warning font-medium">{unpaidServers.length} server{unpaidServers.length > 1 ? 's' : ''} unpaid</span> and will be suspended soon.
                      {unpaidServers.map(s => (
                        <span key={s.id} className="text-muted-foreground"> • {s.name || `Server #${s.id}`}</span>
                      ))}
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
          title="Dashboard"
          description="Overview of your infrastructure"
        />

        {/* DO-Style Minimal Stats - No icons, just numbers */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="border border-border rounded-lg p-4 hover:border-primary/50 transition-colors">
            <div className="text-3xl font-bold text-foreground" data-testid="text-active-servers">
              {stats.active_servers}/{stats.total_servers}
            </div>
            <div className="text-xs uppercase text-muted-foreground mt-1 tracking-wide">
              Active Servers
            </div>
          </div>

          <div className="border border-border rounded-lg p-4 hover:border-primary/50 transition-colors">
            <div className="text-3xl font-bold text-foreground" data-testid="text-cpu-cores">
              {stats.total_cpu_cores}
            </div>
            <div className="text-xs uppercase text-muted-foreground mt-1 tracking-wide">
              CPU Cores
            </div>
          </div>

          <div className="border border-border rounded-lg p-4 hover:border-primary/50 transition-colors">
            <div className="text-3xl font-bold text-foreground" data-testid="text-ram-gb">
              {stats.total_ram_gb} GB
            </div>
            <div className="text-xs uppercase text-muted-foreground mt-1 tracking-wide">
              Memory
            </div>
          </div>

          <div className="border border-border rounded-lg p-4 hover:border-primary/50 transition-colors">
            <div className="text-3xl font-bold text-foreground" data-testid="text-disk-gb">
              {stats.total_disk_gb} GB
            </div>
            <div className="text-xs uppercase text-muted-foreground mt-1 tracking-wide">
              Storage
            </div>
          </div>

          <div className="border border-border rounded-lg p-4 hover:border-primary/50 transition-colors">
            <div className="text-3xl font-bold text-foreground" data-testid="text-bandwidth">
              {bandwidthData ? formatBandwidth(bandwidthData.totalBandwidth) : '—'}
            </div>
            <div className="text-xs uppercase text-muted-foreground mt-1 tracking-wide">
              Bandwidth
              {bandwidthData?.totalLimit && ` / ${
                bandwidthData.totalLimit >= 1000
                  ? `${(bandwidthData.totalLimit / 1000).toFixed(0)} TB`
                  : `${bandwidthData.totalLimit} GB`
              }`}
            </div>
          </div>
        </div>

        {/* DO-Style Horizontal Server Rows */}
        <PageSection title="Your Servers" className="mt-4">
          {isLoading ? (
            <div className="border border-border rounded-lg p-8 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                Loading servers...
              </div>
            </div>
          ) : error ? (
            <Card padding="lg" className="flex flex-col items-center justify-center text-center">
              <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Connection Issue</h3>
              <p className="text-muted-foreground max-w-md mb-6">
                Unable to fetch servers. Please try again or contact support if the issue persists.
              </p>
            </Card>
          ) : servers.length === 0 ? (
            <Card padding="lg" className="flex flex-col items-center justify-center text-center" data-testid="empty-servers-state">
              <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                <ServerIcon className="h-10 w-10 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">No Servers Yet</h3>
              <p className="text-muted-foreground max-w-md mb-6">
                You don't have any VPS servers. Deploy your first server to get started.
              </p>
              <Button asChild>
                <Link href="/deploy">Deploy Your First Server</Link>
              </Button>
            </Card>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden bg-card">
              {servers.map((server, index) => {
                const cancellation = cancellations[server.id];
                const displayStatus = getDisplayStatus(server.id, server.status, cancellation, server.needsSetup);
                const isRunning = displayStatus === 'running';
                const isStopped = displayStatus === 'stopped';
                const isDeleting = displayStatus === 'destroying' || displayStatus === 'queued_deletion';
                const isScheduledDeletion = displayStatus === 'scheduled_deletion';
                const isProvisioning = displayStatus === 'setting up';
                const isAccountSuspended = user?.accountSuspended;

                const serverContent = (
                  <div
                    className={cn(
                      "flex items-center gap-4 px-4 py-3 transition-colors",
                      index !== 0 && "border-t border-border",
                      isAccountSuspended ? "opacity-60 cursor-not-allowed" : "hover:bg-muted/30 cursor-pointer"
                    )}
                  >
                    {/* Status dot - small and minimal */}
                    <div className={cn(
                      "h-2 w-2 rounded-full flex-shrink-0",
                      isRunning && "bg-success",
                      isStopped && "bg-muted-foreground",
                      isDeleting && "bg-red-500 animate-pulse",
                      isScheduledDeletion && "bg-orange-500",
                      isProvisioning && "bg-blue-500 animate-pulse",
                      !isRunning && !isStopped && !isDeleting && !isScheduledDeletion && !isProvisioning && "bg-warning"
                    )} />

                    {/* Server name - bold */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground truncate">
                          {server.name || 'New Server'}
                        </span>
                        {billingStatuses[server.id]?.freeServer && (
                          <Badge variant="info" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                            <Gift className="h-2.5 w-2.5 mr-0.5" />
                            FREE
                          </Badge>
                        )}
                        {billingStatuses[server.id]?.status === 'suspended' && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                            <Ban className="h-2.5 w-2.5 mr-0.5" />
                            SUSPENDED
                          </Badge>
                        )}
                        {billingStatuses[server.id]?.status === 'unpaid' && !billingStatuses[server.id]?.freeServer && (
                          <Badge variant="warning" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                            UNPAID
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {isAccountSuspended ? (
                          <span className="text-orange-500">This server can't be viewed or modified while your account is suspended</span>
                        ) : (
                          <>
                            <span>{billingStatuses[server.id]?.planName || server.plan?.name || 'Unknown Plan'}</span>
                            <span className="mx-1.5">·</span>
                            <span>{server.primaryIp}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Specs - compact display */}
                    <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
                      <div>{server.plan?.specs?.vcpu || 0} vCPU</div>
                      <div>{Math.round((server.plan?.specs?.ram || 0) / 1024)}GB RAM</div>
                      <div>{server.plan?.specs?.disk || 0}GB</div>
                    </div>

                    {/* Status badge - minimal */}
                    <Badge
                      variant={
                        isAccountSuspended ? "warning" :
                        isRunning ? "success" :
                        isDeleting ? "destructive" :
                        isScheduledDeletion ? "warning" :
                        isProvisioning ? "info" :
                        "secondary"
                      }
                      className="capitalize"
                    >
                      {isAccountSuspended ? "Locked" :
                       displayStatus === 'destroying' ? 'Removing' :
                       displayStatus === 'queued_deletion' ? 'Removing' :
                       displayStatus === 'scheduled_deletion' ? 'Scheduled' :
                       displayStatus}
                    </Badge>

                    {/* Arrow or Lock icon */}
                    {isAccountSuspended ? (
                      <Ban className="h-4 w-4 text-orange-500 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                  </div>
                );

                return isAccountSuspended ? (
                  <div key={server.id}>{serverContent}</div>
                ) : (
                  <Link key={server.id} href={`/servers/${server.id}`}>{serverContent}</Link>
                );
              })}
            </div>
          )}
        </PageSection>
      </div>
    </AppShell>
  );
}
