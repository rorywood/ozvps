import { AppShell } from "@/components/layout/app-shell";
import { GlassCard } from "@/components/ui/glass-card";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Server } from "@/lib/types";
import { 
  Activity, 
  Cpu, 
  HardDrive, 
  Server as ServerIcon, 
  Loader2,
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: servers = [], isLoading, error } = useQuery<Server[]>({
    queryKey: ['servers'],
    queryFn: () => api.listServers(),
  });

  const stats = {
    total_servers: servers.length,
    active_servers: servers.filter(s => s.status === 'running').length,
    total_cpu_cores: servers.reduce((sum, s) => sum + (s.plan?.specs?.vcpu || 0), 0),
    total_ram_gb: Math.round(servers.reduce((sum, s) => sum + (s.plan?.specs?.ram || 0), 0) / 1024),
  };

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-white mb-2" data-testid="text-page-title">Dashboard</h1>
            <p className="text-muted-foreground">Overview of your infrastructure</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <GlassCard className="p-4 flex flex-col justify-between h-32 relative overflow-hidden group">
            <div className="absolute right-0 top-0 h-full w-24 bg-gradient-to-l from-primary/10 to-transparent group-hover:from-primary/20 transition-all duration-500" />
            <div className="flex items-center justify-between relative z-10">
              <span className="text-sm font-medium text-muted-foreground">Active Servers</span>
              <ServerIcon className="h-4 w-4 text-primary" />
            </div>
            <div className="relative z-10">
              <div className="text-3xl font-bold text-white font-display" data-testid="text-active-servers">{stats.active_servers}/{stats.total_servers}</div>
              <div className="text-xs text-green-400 flex items-center gap-1 mt-1">
                <Activity className="h-3 w-3" />
                <span>{stats.total_servers === 0 ? 'No servers yet' : 'Systems operational'}</span>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-4 flex flex-col justify-between h-32 relative overflow-hidden group">
            <div className="absolute right-0 top-0 h-full w-24 bg-gradient-to-l from-purple-500/10 to-transparent group-hover:from-purple-500/20 transition-all duration-500" />
            <div className="flex items-center justify-between relative z-10">
              <span className="text-sm font-medium text-muted-foreground">CPU Allocation</span>
              <Cpu className="h-4 w-4 text-purple-500" />
            </div>
            <div className="relative z-10">
              <div className="text-3xl font-bold text-white font-display" data-testid="text-cpu-cores">{stats.total_cpu_cores} <span className="text-lg text-muted-foreground font-normal">Cores</span></div>
              <div className="w-full bg-white/10 h-1 mt-3 rounded-full overflow-hidden">
                <div className="bg-purple-500 h-full" style={{ width: stats.total_cpu_cores > 0 ? '45%' : '0%' }} />
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-4 flex flex-col justify-between h-32 relative overflow-hidden group">
            <div className="absolute right-0 top-0 h-full w-24 bg-gradient-to-l from-cyan-500/10 to-transparent group-hover:from-cyan-500/20 transition-all duration-500" />
            <div className="flex items-center justify-between relative z-10">
              <span className="text-sm font-medium text-muted-foreground">Memory</span>
              <HardDrive className="h-4 w-4 text-cyan-500" />
            </div>
            <div className="relative z-10">
              <div className="text-3xl font-bold text-white font-display" data-testid="text-ram-gb">{stats.total_ram_gb} <span className="text-lg text-muted-foreground font-normal">GB</span></div>
              <div className="w-full bg-white/10 h-1 mt-3 rounded-full overflow-hidden">
                <div className="bg-cyan-500 h-full" style={{ width: stats.total_ram_gb > 0 ? '60%' : '0%' }} />
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-4 flex flex-col justify-between h-32 relative overflow-hidden group">
            <div className="absolute right-0 top-0 h-full w-24 bg-gradient-to-l from-green-500/10 to-transparent group-hover:from-green-500/20 transition-all duration-500" />
            <div className="flex items-center justify-between relative z-10">
              <span className="text-sm font-medium text-muted-foreground">Status</span>
              <Activity className="h-4 w-4 text-green-500" />
            </div>
            <div className="relative z-10">
              <div className="text-2xl font-bold text-green-400 font-display" data-testid="text-status">Ready</div>
              <div className="text-xs text-muted-foreground mt-1">
                All Systems Online
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Servers Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-display font-semibold text-white">Your Servers</h2>
          
          {isLoading ? (
            <GlassCard className="p-12 flex flex-col items-center justify-center">
              <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
              <p className="text-muted-foreground">Loading servers...</p>
            </GlassCard>
          ) : error ? (
            <GlassCard className="p-12 flex flex-col items-center justify-center" data-testid="error-state">
              <div className="h-16 w-16 rounded-full bg-yellow-500/10 flex items-center justify-center mb-4">
                <ServerIcon className="h-8 w-8 text-yellow-400" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Connection Issue</h3>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                Unable to fetch servers. Please try again or contact support if the issue persists.
              </p>
            </GlassCard>
          ) : servers.length === 0 ? (
            <GlassCard className="p-12 flex flex-col items-center justify-center" data-testid="empty-servers-state">
              <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                <ServerIcon className="h-10 w-10 text-primary" />
              </div>
              <h3 className="text-xl font-display font-medium text-white mb-2">No Servers Yet</h3>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                You don't have any VPS servers. Order a server through your billing portal to get started.
              </p>
              <Button variant="outline" className="border-white/10 hover:bg-white/5" asChild>
                <a href="https://ozvps.com.au" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Order a Server
                </a>
              </Button>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {servers.map((server) => (
                <Link key={server.id} href={`/servers/${server.id}`}>
                  <GlassCard variant="interactive" className="p-4 flex items-center justify-between group cursor-pointer" data-testid={`card-server-${server.id}`}>
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "h-10 w-10 rounded-lg flex items-center justify-center border",
                        server.status === 'running' ? "bg-green-500/10 border-green-500/20 text-green-500" : 
                        server.status === 'stopped' ? "bg-red-500/10 border-red-500/20 text-red-500" :
                        "bg-yellow-500/10 border-yellow-500/20 text-yellow-500 animate-pulse"
                      )}>
                        <ServerIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-medium text-white group-hover:text-primary transition-colors">{server.name}</h3>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{server.primaryIp}</span>
                          <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                          <span>{server.location?.name || 'Unknown'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-8">
                      <div className="hidden md:block">
                        <div className="text-xs text-muted-foreground mb-1">CPU Usage</div>
                        <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${server.stats?.cpu_usage || 0}%` }} />
                        </div>
                      </div>
                      
                      <div className="hidden md:block">
                        <div className="text-xs text-muted-foreground mb-1">RAM Usage</div>
                        <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${server.stats?.ram_usage || 0}%` }} />
                        </div>
                      </div>

                      <div className="text-right min-w-[100px]">
                        <div className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border",
                          server.status === 'running' ? "bg-green-500/10 border-green-500/20 text-green-400" : 
                          server.status === 'stopped' ? "bg-red-500/10 border-red-500/20 text-red-400" :
                          "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
                        )}>
                          <div className={cn("w-1.5 h-1.5 rounded-full", 
                            server.status === 'running' ? "bg-green-400" : 
                            server.status === 'stopped' ? "bg-red-400" : 
                            "bg-yellow-400"
                          )} />
                          {server.status.toUpperCase()}
                        </div>
                      </div>
                    </div>
                  </GlassCard>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
