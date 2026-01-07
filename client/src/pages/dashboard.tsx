import { AppShell } from "@/components/layout/app-shell";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Server } from "@/lib/types";
import { 
  Activity, 
  Cpu, 
  HardDrive, 
  Server as ServerIcon, 
  Loader2,
  ExternalLink,
  Clock,
  AlertTriangle,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import flagAU from "@/assets/flag-au.png";
import { getOsLogoUrlFromServer, FALLBACK_LOGO } from "@/lib/os-logos";
import { usePowerActions, useSyncPowerActions } from "@/hooks/use-power-actions";

export default function Dashboard() {
  const { getDisplayStatus } = usePowerActions();
  const { data: servers = [], isLoading, error } = useQuery<Server[]>({
    queryKey: ['servers'],
    queryFn: () => api.listServers(),
    refetchInterval: 10000,
  });
  
  const { data: cancellationsData } = useQuery({
    queryKey: ['cancellations'],
    queryFn: () => api.getAllCancellations(),
    refetchInterval: 10000,
  });
  
  const pendingCancellations = cancellationsData?.cancellations || {};

  const { data: billingData } = useQuery({
    queryKey: ['server-billing-statuses'],
    queryFn: () => api.getServerBillingStatuses(),
    refetchInterval: 30000,
  });
  
  const serverBillingStatuses = billingData?.billing || {};

  useSyncPowerActions(servers);

  const stats = {
    total_servers: servers.length,
    active_servers: servers.filter(s => s.status === 'running').length,
    total_cpu_cores: servers.reduce((sum, s) => sum + (s.plan?.specs?.vcpu || 0), 0),
    total_ram_gb: Math.round(servers.reduce((sum, s) => sum + (s.plan?.specs?.ram || 0), 0) / 1024),
    total_disk_gb: servers.reduce((sum, s) => sum + (s.plan?.specs?.disk || 0), 0),
    avg_disk_usage: servers.length > 0 
      ? Math.round(servers.reduce((sum, s) => sum + (s.stats?.disk_usage || 0), 0) / servers.length) 
      : 0,
  };

  return (
    <AppShell>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-white mb-2" data-testid="text-page-title">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your infrastructure</p>
        </div>

        {/* Stats - Grid of cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-panel rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <ServerIcon className="h-5 w-5 text-primary" />
              </div>
            </div>
            <div className="text-2xl font-bold text-white font-display" data-testid="text-active-servers">{stats.active_servers}/{stats.total_servers}</div>
            <div className="text-sm text-muted-foreground">Active Servers</div>
          </div>

          <div className="glass-panel rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <Cpu className="h-5 w-5 text-purple-500" />
              </div>
            </div>
            <div className="text-2xl font-bold text-white font-display" data-testid="text-cpu-cores">{stats.total_cpu_cores}</div>
            <div className="text-sm text-muted-foreground">CPU Cores</div>
          </div>

          <div className="glass-panel rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                <HardDrive className="h-5 w-5 text-cyan-500" />
              </div>
            </div>
            <div className="text-2xl font-bold text-white font-display" data-testid="text-ram-gb">{stats.total_ram_gb} GB</div>
            <div className="text-sm text-muted-foreground">Memory</div>
          </div>

          <div className="glass-panel rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                <HardDrive className="h-5 w-5 text-green-500" />
              </div>
            </div>
            <div className="text-2xl font-bold text-white font-display" data-testid="text-disk-gb">{stats.total_disk_gb} GB</div>
            <div className="text-sm text-muted-foreground">Storage</div>
          </div>
        </div>

        {/* Servers Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-display font-semibold text-white">Your Servers</h2>
          
          {isLoading ? (
            <div className="rounded-2xl bg-white/[0.02] ring-1 ring-white/5 p-12 flex flex-col items-center justify-center">
              <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
              <p className="text-muted-foreground">Loading servers...</p>
            </div>
          ) : error ? (
            <div className="rounded-2xl bg-white/[0.02] ring-1 ring-white/5 p-12 flex flex-col items-center justify-center" data-testid="error-state">
              <div className="h-16 w-16 rounded-full bg-yellow-500/10 flex items-center justify-center mb-4">
                <ServerIcon className="h-8 w-8 text-yellow-400" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Connection Issue</h3>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                Unable to fetch servers. Please try again or contact support if the issue persists.
              </p>
            </div>
          ) : servers.length === 0 ? (
            <div className="rounded-2xl bg-white/[0.02] ring-1 ring-white/5 p-12 flex flex-col items-center justify-center" data-testid="empty-servers-state">
              <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                <ServerIcon className="h-10 w-10 text-primary" />
              </div>
              <h3 className="text-xl font-display font-medium text-white mb-2">No Servers Yet</h3>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                You don't have any VPS servers. Deploy your first server to get started.
              </p>
              <Button className="bg-primary hover:bg-primary/90" asChild>
                <Link href="/deploy">
                  Deploy Your First Server
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {servers.map((server) => {
                const displayStatus = getDisplayStatus(server.id, server.status);
                const isTransitioning = ['rebooting', 'starting', 'stopping'].includes(displayStatus);
                const cancellation = pendingCancellations[server.id];
                const billingStatus = serverBillingStatuses[server.id];
                
                return (
                  <Link key={server.id} href={`/servers/${server.id}`}>
                    <div 
                      className="group rounded-xl bg-white/[0.02] ring-1 ring-white/5 hover:ring-white/10 hover:bg-white/[0.04] transition-all duration-200 p-4 cursor-pointer"
                      data-testid={`card-server-${server.id}`}
                    >
                      <div className="flex items-center gap-4">
                        {/* Status indicator & icon */}
                        <div className={cn(
                          "h-12 w-12 rounded-xl flex items-center justify-center transition-colors",
                          server.suspended ? "bg-yellow-500/10 text-yellow-500" :
                          server.needsSetup ? "bg-blue-500/10 text-blue-500" :
                          displayStatus === 'running' ? "bg-green-500/10 text-green-500" : 
                          displayStatus === 'stopped' ? "bg-red-500/10 text-red-500" :
                          "bg-yellow-500/10 text-yellow-500"
                        )}>
                          {isTransitioning ? (
                            <Loader2 className="h-6 w-6 animate-spin" />
                          ) : (
                            <ServerIcon className="h-6 w-6" />
                          )}
                        </div>

                        {/* Server info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="font-medium text-white group-hover:text-primary transition-colors truncate">
                              {server.name || 'New Server'}
                            </h3>
                            
                            {/* Needs Setup badge */}
                            {server.needsSetup && (
                              <span 
                                className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 flex items-center gap-1"
                                data-testid={`badge-needs-setup-${server.id}`}
                              >
                                NEEDS SETUP
                              </span>
                            )}
                            
                            {/* Status badges */}
                            {billingStatus?.status === 'overdue' && (
                              <span 
                                className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 flex items-center gap-1"
                                data-testid={`badge-overdue-${server.id}`}
                              >
                                <AlertTriangle className="h-3 w-3" />
                                OVERDUE
                              </span>
                            )}
                            
                            {cancellation && (
                              cancellation.status === 'processing' ? (
                                <span 
                                  className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 flex items-center gap-1"
                                  data-testid={`badge-deleting-${server.id}`}
                                >
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  DELETING
                                </span>
                              ) : cancellation.mode === 'immediate' ? (
                                <span 
                                  className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 flex items-center gap-1"
                                  data-testid={`badge-queued-${server.id}`}
                                >
                                  <Clock className="h-3 w-3" />
                                  DELETING SOON
                                </span>
                              ) : (
                                <span 
                                  className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 flex items-center gap-1"
                                  data-testid={`badge-pending-cancellation-${server.id}`}
                                >
                                  <Clock className="h-3 w-3" />
                                  CANCELLING
                                </span>
                              )
                            )}
                          </div>

                          {/* Server details row */}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            <span className="font-mono">{server.primaryIp || 'IP pending'}</span>
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                            <div className="flex items-center gap-1">
                              <img src={flagAU} alt="AU" className="h-3 w-4 object-cover rounded-sm" />
                              <span>{server.location?.name || 'Sydney'}</span>
                            </div>
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                            <div className="flex items-center gap-1">
                              {server.needsSetup ? (
                                <span className="text-blue-400 italic">No OS installed</span>
                              ) : (
                                <>
                                  <img 
                                    src={getOsLogoUrlFromServer(server.image)} 
                                    alt="" 
                                    className="h-3.5 w-3.5 object-contain"
                                    loading="lazy"
                                    onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_LOGO; }}
                                  />
                                  <span className="truncate max-w-[80px]" title={server.image?.name}>
                                    {server.image?.name || 'Unknown'}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Resource usage - desktop */}
                        <div className="hidden md:flex items-center gap-6">
                          <div className="text-center">
                            <div className="text-xs text-muted-foreground mb-1">CPU</div>
                            <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${server.stats?.cpu_usage || 0}%` }} />
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-muted-foreground mb-1">RAM</div>
                            <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${server.stats?.ram_usage || 0}%` }} />
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-muted-foreground mb-1">Disk</div>
                            <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${server.stats?.disk_usage || 0}%` }} />
                            </div>
                          </div>
                        </div>

                        {/* Status & arrow */}
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5",
                            server.suspended ? "bg-yellow-500/10 text-yellow-400" :
                            server.needsSetup ? "bg-blue-500/10 text-blue-400" :
                            displayStatus === 'running' ? "bg-green-500/10 text-green-400" : 
                            displayStatus === 'stopped' ? "bg-red-500/10 text-red-400" :
                            "bg-yellow-500/10 text-yellow-400"
                          )}>
                            <div className={cn("w-1.5 h-1.5 rounded-full", 
                              server.suspended ? "bg-yellow-400" :
                              server.needsSetup ? "bg-blue-400 animate-pulse" :
                              displayStatus === 'running' ? "bg-green-400" : 
                              displayStatus === 'stopped' ? "bg-red-400" : 
                              "bg-yellow-400 animate-pulse"
                            )} />
                            {server.suspended ? 'Suspended' : server.needsSetup ? 'Awaiting Setup' : displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
