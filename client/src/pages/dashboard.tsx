import { AppShell } from "@/components/layout/app-shell";
import { GlassCard } from "@/components/ui/glass-card";
import { mockServers, mockStats } from "@/lib/mock-data";
import { 
  Activity, 
  Cpu, 
  HardDrive, 
  Server as ServerIcon, 
  TrendingUp, 
  AlertCircle,
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function Dashboard() {
  return (
    <AppShell>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-white mb-2">Dashboard</h1>
            <p className="text-muted-foreground">Overview of your infrastructure and usage</p>
          </div>
          <Link href="/provision">
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_20px_rgba(59,130,246,0.3)] border-0">
              Deploy Server
            </Button>
          </Link>
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
              <div className="text-3xl font-bold text-white font-display">{mockStats.active_servers}/{mockStats.total_servers}</div>
              <div className="text-xs text-green-400 flex items-center gap-1 mt-1">
                <Activity className="h-3 w-3" />
                <span>All systems operational</span>
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
              <div className="text-3xl font-bold text-white font-display">{mockStats.total_cpu_cores} <span className="text-lg text-muted-foreground font-normal">Cores</span></div>
              <div className="w-full bg-white/10 h-1 mt-3 rounded-full overflow-hidden">
                <div className="bg-purple-500 h-full w-[45%]" />
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-4 flex flex-col justify-between h-32 relative overflow-hidden group">
             <div className="absolute right-0 top-0 h-full w-24 bg-gradient-to-l from-cyan-500/10 to-transparent group-hover:from-cyan-500/20 transition-all duration-500" />
            <div className="flex items-center justify-between relative z-10">
              <span className="text-sm font-medium text-muted-foreground">Memory Usage</span>
              <HardDrive className="h-4 w-4 text-cyan-500" />
            </div>
            <div className="relative z-10">
              <div className="text-3xl font-bold text-white font-display">{mockStats.total_ram_gb} <span className="text-lg text-muted-foreground font-normal">GB</span></div>
               <div className="w-full bg-white/10 h-1 mt-3 rounded-full overflow-hidden">
                <div className="bg-cyan-500 h-full w-[60%]" />
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-4 flex flex-col justify-between h-32 relative overflow-hidden group">
             <div className="absolute right-0 top-0 h-full w-24 bg-gradient-to-l from-orange-500/10 to-transparent group-hover:from-orange-500/20 transition-all duration-500" />
            <div className="flex items-center justify-between relative z-10">
              <span className="text-sm font-medium text-muted-foreground">Month-to-date Cost</span>
              <TrendingUp className="h-4 w-4 text-orange-500" />
            </div>
            <div className="relative z-10">
              <div className="text-3xl font-bold text-white font-display">${mockStats.projected_cost}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Proj. ${mockStats.projected_cost * 1.5} by month end
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Recent Servers */}
        <div className="space-y-4">
          <h2 className="text-xl font-display font-semibold text-white">Your Servers</h2>
          <div className="grid grid-cols-1 gap-4">
            {mockServers.map((server) => (
              <GlassCard key={server.id} variant="interactive" className="p-4 flex items-center justify-between group">
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
                      <span>{server.ip}</span>
                      <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                      <span>{server.location}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-8">
                  <div className="hidden md:block">
                    <div className="text-xs text-muted-foreground mb-1">CPU Usage</div>
                    <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${server.usage_cpu}%` }} />
                    </div>
                  </div>
                  
                  <div className="hidden md:block">
                    <div className="text-xs text-muted-foreground mb-1">RAM Usage</div>
                     <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${server.usage_ram}%` }} />
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
            ))}
          </div>
        </div>

        {/* Activity Log */}
        <div className="space-y-4">
          <h2 className="text-xl font-display font-semibold text-white">Recent Activity</h2>
          <GlassCard className="p-0 overflow-hidden">
            <div className="divide-y divide-white/5">
              {[
                { action: "Server Created", target: "staging-env", time: "2 minutes ago", status: "pending" },
                { action: "Server Rebooted", target: "web-prod-01", time: "2 hours ago", status: "success" },
                { action: "Backup Completed", target: "db-primary", time: "5 hours ago", status: "success" },
                { action: "Failed Login Attempt", target: "Account", time: "1 day ago", status: "warning" },
              ].map((log, i) => (
                <div key={i} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center",
                      log.status === 'success' ? "bg-green-500/10 text-green-500" :
                      log.status === 'pending' ? "bg-blue-500/10 text-blue-500" :
                      "bg-orange-500/10 text-orange-500"
                    )}>
                      {log.status === 'warning' ? <AlertCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{log.action}</p>
                      <p className="text-xs text-muted-foreground">{log.target}</p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">{log.time}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </AppShell>
  );
}
