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
  ChevronRight
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { usePowerActions, useSyncPowerActions } from "@/hooks/use-power-actions";
import { cn } from "@/lib/utils";
import { EmailVerificationBanner } from "@/components/email-verification-banner";

export default function Dashboard() {
  useDocumentTitle('Dashboard');
  const [, setLocation] = useLocation();
  const { getDisplayStatus } = usePowerActions();

  // Combined dashboard query - reduces 4 API calls to 1
  const { data: dashboardData, isLoading, error } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: () => api.getDashboardOverview(),
    refetchInterval: (query) => {
      // If any server needs setup or is provisioning, poll aggressively (500ms)
      const data = query.state.data;
      const hasProvisioningServers = data?.servers?.some((s: any) =>
        s.needsSetup || s.status === 'building' || s.status === 'provisioning'
      );
      if (hasProvisioningServers) {
        return 500;
      }
      // Normal operation: 1 second refresh for real-time updates
      return 1000;
    },
  });

  const servers = dashboardData?.servers || [];
  const bandwidthData = dashboardData?.bandwidth;
  const cancellations = dashboardData?.cancellations || {};

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
                  ? `${(bandwidthData.totalLimit / 1024).toFixed(2)} TB`
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

                return (
                  <Link key={server.id} href={`/servers/${server.id}`}>
                    <div
                      className={cn(
                        "flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer",
                        index !== 0 && "border-t border-border"
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
                        <div className="font-semibold text-foreground truncate">
                          {server.name || 'New Server'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {server.primaryIp}
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
                          isRunning ? "success" :
                          isDeleting ? "destructive" :
                          isScheduledDeletion ? "warning" :
                          isProvisioning ? "info" :
                          "secondary"
                        }
                        className="capitalize"
                      >
                        {displayStatus === 'destroying' ? 'Removing' :
                         displayStatus === 'queued_deletion' ? 'Removing' :
                         displayStatus === 'scheduled_deletion' ? 'Scheduled' :
                         displayStatus}
                      </Badge>

                      {/* Arrow */}
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </PageSection>
      </div>
    </AppShell>
  );
}
