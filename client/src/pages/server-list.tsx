import { AppShell } from "@/components/layout/app-shell";
import { GlassCard } from "@/components/ui/glass-card";
import { api } from "@/lib/api";
import { Server } from "@/lib/types";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Server as ServerIcon, 
  Power, 
  RotateCw, 
  Trash2, 
  TerminalSquare,
  MoreVertical,
  Search,
  Filter,
  Loader2,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function ServerList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: servers, isLoading, isError } = useQuery({
    queryKey: ['servers'],
    queryFn: () => api.listServers()
  });

  const powerMutation = useMutation({
    mutationFn: ({ id, action }: { id: string, action: 'boot' | 'reboot' | 'shutdown' }) => 
      api.powerAction(id, action),
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      toast({
        title: "Action Initiated",
        description: `Server ${action} command sent successfully.`,
      });
    }
  });

  const handlePowerAction = (e: React.MouseEvent, id: string, action: 'boot' | 'reboot' | 'shutdown') => {
    e.preventDefault();
    e.stopPropagation();
    powerMutation.mutate({ id, action });
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white mb-2">Servers</h1>
            <p className="text-muted-foreground">Manage your virtual private servers</p>
          </div>
          <div className="flex items-center gap-2">
             <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search servers..." 
                  className="pl-9 bg-black/20 border-white/10 focus-visible:ring-primary/50 text-white placeholder:text-muted-foreground/50 h-10"
                />
              </div>
              <Button variant="outline" className="border-white/10 bg-black/20 text-white hover:bg-white/5">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-10 w-10 animate-spin mb-4 text-primary" />
            <p>Loading fleet status...</p>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-20 text-red-400">
            <AlertCircle className="h-10 w-10 mb-4" />
            <p>Failed to load servers. Please try again.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {servers?.map((server) => (
              <Link key={server.id} href={`/server/${server.id}`}>
                <GlassCard className="p-6 transition-all duration-300 hover:border-primary/30 group cursor-pointer">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                  
                  {/* Status Icon & Basic Info */}
                  <div className="flex items-center gap-4 min-w-[250px]">
                    <div className={cn(
                      "h-12 w-12 rounded-xl flex items-center justify-center border shadow-[0_0_15px_-3px_rgba(0,0,0,0.5)]",
                      server.status === 'running' ? "bg-green-500/10 border-green-500/20 text-green-500 shadow-green-500/20" : 
                      server.status === 'stopped' ? "bg-red-500/10 border-red-500/20 text-red-500 shadow-red-500/20" :
                      "bg-yellow-500/10 border-yellow-500/20 text-yellow-500 animate-pulse"
                    )}>
                      <ServerIcon className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-lg text-white group-hover:text-primary transition-colors">{server.name}</h3>
                        <span className={cn(
                          "text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border",
                          server.status === 'running' ? "bg-green-500/10 border-green-500/20 text-green-400" : 
                          server.status === 'stopped' ? "bg-red-500/10 border-red-500/20 text-red-400" :
                          "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
                        )}>
                          {server.status}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground font-mono mt-0.5">{server.primaryIp}</p>
                    </div>
                  </div>

                  {/* Specs Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-2 flex-1 text-sm">
                    <div>
                      <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Location</div>
                      <div className="text-white font-medium">{server.location.name}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Specs</div>
                      <div className="text-white font-medium">{server.plan.specs.vcpu} vCPU / {server.plan.specs.ram / 1024}GB</div>
                    </div>
                     <div>
                      <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Disk</div>
                      <div className="text-white font-medium">{server.plan.specs.disk}GB NVMe</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Image</div>
                      <div className="text-white font-medium truncate">{server.image.name}</div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-4 lg:pt-0 border-t lg:border-t-0 border-white/5">
                    <Button size="sm" variant="outline" className="h-9 border-white/10 hover:bg-white/5 hover:text-white text-muted-foreground">
                      <TerminalSquare className="h-4 w-4 mr-2" />
                      Console
                    </Button>
                    
                    <div className="flex items-center bg-black/20 rounded-md border border-white/10 p-1">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-7 w-7 text-muted-foreground hover:text-green-400 hover:bg-green-400/10 rounded-sm" 
                        title="Start"
                        disabled={server.status === 'running' || powerMutation.isPending}
                        onClick={(e) => handlePowerAction(e, server.id, 'boot')}
                      >
                        <Power className="h-4 w-4" />
                      </Button>
                      <div className="w-px h-4 bg-white/10 mx-1" />
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-7 w-7 text-muted-foreground hover:text-yellow-400 hover:bg-yellow-400/10 rounded-sm" 
                        title="Reboot"
                        disabled={server.status !== 'running' || powerMutation.isPending}
                        onClick={(e) => handlePowerAction(e, server.id, 'reboot')}
                      >
                        <RotateCw className="h-4 w-4" />
                      </Button>
                      <div className="w-px h-4 bg-white/10 mx-1" />
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-7 w-7 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-sm" 
                        title="Stop"
                        disabled={server.status === 'stopped' || powerMutation.isPending}
                        onClick={(e) => handlePowerAction(e, server.id, 'shutdown')}
                      >
                        <Power className="h-4 w-4 rotate-180" />
                      </Button>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-white">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-card/95 backdrop-blur-xl border-white/10 text-white">
                        <DropdownMenuLabel>Server Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator className="bg-white/10" />
                        <DropdownMenuItem className="focus:bg-white/10 cursor-pointer">View Details</DropdownMenuItem>
                        <DropdownMenuItem className="focus:bg-white/10 cursor-pointer">Resize Server</DropdownMenuItem>
                        <DropdownMenuItem className="focus:bg-white/10 cursor-pointer">Manage Network</DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-white/10" />
                        <DropdownMenuItem className="text-red-400 focus:bg-red-500/10 focus:text-red-400 cursor-pointer">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Destroy Server
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                </div>
                
                {/* Resource Bars */}
                {server.status === 'running' && (
                  <div className="mt-6 grid grid-cols-3 gap-4 border-t border-white/5 pt-4">
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">CPU</span>
                        <span className="text-white font-mono">{server.stats.cpu_usage}%</span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${server.stats.cpu_usage}%` }} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">RAM</span>
                        <span className="text-white font-mono">{server.stats.ram_usage}%</span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-500 transition-all duration-500" style={{ width: `${server.stats.ram_usage}%` }} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Disk</span>
                        <span className="text-white font-mono">{server.stats.disk_usage}%</span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 transition-all duration-500" style={{ width: `${server.stats.disk_usage}%` }} />
                      </div>
                    </div>
                  </div>
                )}
              </GlassCard>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
