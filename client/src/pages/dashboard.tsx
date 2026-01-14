import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { PageSection } from "@/components/layout/page-section";
import { Card } from "@/components/ui/card";
import { ServerCard } from "@/components/ui/server-card";
import { SkeletonServerGrid } from "@/components/ui/skeleton-card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useDocumentTitle } from "@/hooks/use-document-title";
import {
  Server as ServerIcon,
  Cpu,
  HardDrive,
  TrendingUp,
  AlertCircle
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { usePowerActions, useSyncPowerActions } from "@/hooks/use-power-actions";

export default function Dashboard() {
  useDocumentTitle('Dashboard');
  const [, setLocation] = useLocation();
  const { getDisplayStatus } = usePowerActions();

  // Combined dashboard query - reduces 4 API calls to 1
  const { data: dashboardData, isLoading, error } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: () => api.getDashboardOverview(),
    refetchInterval: 3000, // 3 second refresh for real-time updates
  });

  const servers = dashboardData?.servers || [];
  const bandwidthData = dashboardData?.bandwidth;

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
    if (gb >= 1000) {
      const tb = gb / 1024;
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
        <PageHeader
          title="Dashboard"
          description="Overview of your infrastructure"
        />

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card padding="sm" className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <ServerIcon className="h-5 w-5 text-primary" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground font-display" data-testid="text-active-servers">
                {stats.active_servers}/{stats.total_servers}
              </div>
              <div className="text-sm text-muted-foreground">Active Servers</div>
            </div>
          </Card>

          <Card padding="sm" className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Cpu className="h-5 w-5 text-blue-500" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground font-display" data-testid="text-cpu-cores">
                {stats.total_cpu_cores}
              </div>
              <div className="text-sm text-muted-foreground">CPU Cores</div>
            </div>
          </Card>

          <Card padding="sm" className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                <HardDrive className="h-5 w-5 text-cyan-500" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground font-display" data-testid="text-ram-gb">
                {stats.total_ram_gb} GB
              </div>
              <div className="text-sm text-muted-foreground">Memory</div>
            </div>
          </Card>

          <Card padding="sm" className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                <HardDrive className="h-5 w-5 text-green-500" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground font-display" data-testid="text-disk-gb">
                {stats.total_disk_gb} GB
              </div>
              <div className="text-sm text-muted-foreground">Storage</div>
            </div>
          </Card>

          <Card padding="sm" className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-blue-500" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground font-display" data-testid="text-bandwidth">
                {bandwidthData ? formatBandwidth(bandwidthData.totalBandwidth) : '—'}
              </div>
              <div className="text-xs text-muted-foreground">
                Total Bandwidth
                {bandwidthData?.totalLimit && ` / ${
                  bandwidthData.totalLimit >= 1000
                    ? `${(bandwidthData.totalLimit / 1024).toFixed(2)} TB`
                    : `${bandwidthData.totalLimit} GB`
                }`}
              </div>
            </div>
          </Card>
        </div>

        {/* Servers Section */}
        <PageSection title="Your Servers">
          {isLoading ? (
            <SkeletonServerGrid count={3} />
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {servers.map((server) => (
                <ServerCard
                  key={server.id}
                  server={server}
                  onClick={() => setLocation(`/servers/${server.id}`)}
                />
              ))}
            </div>
          )}
        </PageSection>
      </div>
    </AppShell>
  );
}
