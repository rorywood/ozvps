import { AppShell } from "@/components/layout/app-shell";
import { GlassCard } from "@/components/ui/glass-card";
import { api } from "@/lib/api";
import { Server } from "@/lib/types";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Server as ServerIcon, 
  Power, 
  RotateCw, 
  TerminalSquare,
  MoreVertical,
  Search,
  Filter,
  Loader2,
  AlertCircle,
  Square,
  MonitorCog,
  AlertTriangle,
  Zap
} from "lucide-react";
import { getOsLogoUrlFromServer, FALLBACK_LOGO } from "@/lib/os-logos";
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
import { usePowerActions, useSyncPowerActions } from "@/hooks/use-power-actions";
import flagAU from "@/assets/flag-au.png";
import { Clock } from "lucide-react";

// Helper to detect placeholder server names like "Server 123" 
function getDisplayServerName(name: string | undefined): string {
  if (!name) return 'New Server';
  // Check if name matches pattern "Server <number>" 
  if (/^Server\s+\d+$/i.test(name.trim())) {
    return 'New Server';
  }
  return name;
}

// Helper to check if server is actively building (setup wizard in progress)
function isServerBuilding(serverId: string): boolean {
  try {
    const setupMode = sessionStorage.getItem(`setupMode:${serverId}`);
    const setupMinimized = sessionStorage.getItem(`setupMinimized:${serverId}`);
    return setupMode === 'true' || setupMinimized === 'true';
  } catch {
    return false;
  }
}

export default function ServerList() {
  useDocumentTitle('Servers');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { markPending, getDisplayStatus } = usePowerActions();

  const { data: servers, isLoading, isError } = useQuery({
    queryKey: ['servers'],
    queryFn: () => api.listServers(),
    refetchInterval: 10000,
  });
  
  // Fetch pending cancellations for all servers
  const { data: cancellationsData } = useQuery({
    queryKey: ['cancellations'],
    queryFn: () => api.getAllCancellations(),
    refetchInterval: 10000, // Match servers refetch interval for consistency
  });
  
  const pendingCancellations = cancellationsData?.cancellations || {};

  // Fetch billing statuses for all servers (for overdue badges)
  const { data: billingData } = useQuery({
    queryKey: ['server-billing-statuses'],
    queryFn: () => api.getServerBillingStatuses(),
    refetchInterval: 30000,
  });
  
  const serverBillingStatuses = billingData?.billing || {};

  useSyncPowerActions(servers);

  const powerMutation = useMutation({
    mutationFn: ({ id, action }: { id: string, action: 'boot' | 'reboot' | 'shutdown' }) => 
      api.powerAction(id, action),
    onMutate: ({ id, action }) => {
      const actionMap: Record<string, string> = { boot: 'start', reboot: 'reboot', shutdown: 'shutdown' };
      markPending(id, actionMap[action] || action);
    },
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
            <h1 className="text-3xl font-display font-bold text-foreground mb-2">Servers</h1>
            <p className="text-muted-foreground">Manage your virtual private servers</p>
          </div>
          <div className="flex items-center gap-2">
             <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search servers..." 
                  className="pl-9 bg-card/30 border-border focus-visible:ring-primary/50 text-foreground placeholder:text-muted-foreground/50 h-10"
                />
              </div>
              <Button variant="outline" className="border-border bg-card/30 text-foreground hover:bg-muted/50">
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
        ) : servers?.length === 0 ? (
          <GlassCard className="p-12 flex flex-col items-center justify-center" data-testid="empty-servers-state">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <ServerIcon className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-xl font-display font-medium text-foreground mb-2">No Servers Yet</h3>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              You don't have any VPS servers yet. Order a server through your billing portal to get started.
            </p>
            <Button variant="outline" className="border-border hover:bg-muted/50" data-testid="button-order-server" asChild>
              <Link href="/deploy">
                <Zap className="h-4 w-4 mr-2" />
                Deploy a Server
              </Link>
            </Button>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {servers?.map((server) => (
              <Link key={server.id} href={`/servers/${server.id}`}>
                <GlassCard className="p-6 transition-all duration-300 hover:border-primary/30 group cursor-pointer">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                  
                  {/* Status Icon & Basic Info */}
                  <div className="flex items-center gap-4 min-w-[250px]">
                    {(() => {
                      const displayStatus = getDisplayStatus(server.id, server.status);
                      const isTransitioning = ['rebooting', 'starting', 'stopping'].includes(displayStatus);
                      const needsSetup = server.needsSetup === true;
                      const hasActiveSetup = isServerBuilding(server.id);
                      const building = hasActiveSetup;
                      return (
                        <>
                          <div className={cn(
                            "h-12 w-12 rounded-xl flex items-center justify-center border shadow-[0_0_15px_-3px_rgba(0,0,0,0.5)]",
                            server.suspended ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-500 shadow-yellow-500/20" :
                            building ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-500 shadow-cyan-500/20" :
                            needsSetup ? "bg-blue-500/10 border-blue-500/20 text-blue-500 shadow-blue-500/20" :
                            displayStatus === 'running' ? "bg-green-500/10 border-green-500/20 text-green-500 shadow-green-500/20" : 
                            displayStatus === 'stopped' ? "bg-red-500/10 border-red-500/20 text-red-500 shadow-red-500/20" :
                            "bg-yellow-500/10 border-yellow-500/20 text-yellow-500"
                          )}>
                            {isTransitioning || building ? (
                              <Loader2 className="h-6 w-6 animate-spin" />
                            ) : needsSetup ? (
                              <MonitorCog className="h-6 w-6" />
                            ) : (
                              <ServerIcon className="h-6 w-6" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors">{getDisplayServerName(server.name)}</h3>
                              {server.suspended ? (
                                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border bg-yellow-500/20 border-yellow-500/30 text-yellow-400">
                                  SUSPENDED
                                </span>
                              ) : building ? (
                                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border bg-cyan-500/20 border-cyan-500/30 text-cyan-400 flex items-center gap-1">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  BUILDING
                                </span>
                              ) : needsSetup ? (
                                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border bg-blue-500/20 border-blue-500/30 text-blue-400">
                                  NEEDS SETUP
                                </span>
                              ) : (
                                <span className={cn(
                                  "text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border",
                                  displayStatus === 'running' ? "bg-green-500/10 border-green-500/20 text-green-400" : 
                                  displayStatus === 'stopped' ? "bg-red-500/10 border-red-500/20 text-red-400" :
                                  "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
                                )}>
                                  {displayStatus}
                                </span>
                              )}
                              {serverBillingStatuses[server.id]?.status === 'overdue' && (
                                <span 
                                  className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border bg-amber-500/20 border-amber-500/30 text-amber-400 flex items-center gap-1"
                                  data-testid={`badge-overdue-${server.id}`}
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                  PAYMENT OVERDUE
                                </span>
                              )}
                              {pendingCancellations[server.id] && (
                                pendingCancellations[server.id].status === 'processing' ? (
                                  <span 
                                    className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border bg-red-500/20 border-red-500/30 text-red-400 flex items-center gap-1"
                                    data-testid={`badge-deleting-${server.id}`}
                                  >
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    DELETING
                                  </span>
                                ) : pendingCancellations[server.id].mode === 'immediate' ? (
                                  <span 
                                    className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border bg-orange-500/20 border-orange-500/30 text-orange-400 flex items-center gap-1"
                                    data-testid={`badge-queued-${server.id}`}
                                  >
                                    <Clock className="h-3 w-3" />
                                    QUEUED FOR DELETION
                                  </span>
                                ) : (
                                  <span 
                                    className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border bg-orange-500/20 border-orange-500/30 text-orange-400 flex items-center gap-1"
                                    data-testid={`badge-pending-cancellation-${server.id}`}
                                  >
                                    <Clock className="h-3 w-3" />
                                    PENDING CANCELLATION
                                  </span>
                                )
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground font-mono mt-0.5">{server.primaryIp}</p>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Specs Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 sm:gap-x-8 gap-y-2 flex-1 text-sm">
                    <div>
                      <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Location</div>
                      <div className="text-foreground font-medium flex items-center gap-2">
                        <img src={flagAU} alt="AU" className="h-3.5 w-5 object-cover rounded-sm" />
                        {server.location.name}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Specs</div>
                      <div className="text-foreground font-medium">{server.plan.specs.vcpu} vCPU / {server.plan.specs.ram / 1024}GB</div>
                    </div>
                     <div>
                      <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Disk</div>
                      <div className="text-foreground font-medium">{server.plan.specs.disk}GB NVMe</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Image</div>
                      <div className="text-foreground font-medium flex items-center gap-2">
                        {server.needsSetup ? (
                          <span className="text-blue-400 italic text-sm">No OS installed</span>
                        ) : (
                          <>
                            <img 
                              src={getOsLogoUrlFromServer(server.image)} 
                              alt="" 
                              className="h-5 w-5 object-contain"
                              loading="lazy"
                              onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_LOGO; }}
                            />
                            <span className="truncate max-w-[100px]">{server.image?.name || 'Unknown'}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-4 lg:pt-0 border-t lg:border-t-0 border-border flex-wrap">
                    {server.suspended && (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-yellow-500/10 border border-yellow-500/20">
                        <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                        <span className="text-sm font-medium text-yellow-400">Suspended</span>
                      </div>
                    )}
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-9 border-border hover:bg-muted/50 hover:text-foreground text-muted-foreground hidden sm:flex"
                      disabled={server.suspended}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Open console in a pop-out window
                        window.open(
                          `/servers/${server.id}/console?popout=true`,
                          `console-${server.id}`,
                          'width=1200,height=800,resizable=yes,scrollbars=yes'
                        );
                      }}
                      data-testid={`button-console-${server.id}`}
                    >
                      <TerminalSquare className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Console</span>
                    </Button>
                    
                    <div className="flex items-center bg-card/30 rounded-md border border-border p-1">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-10 w-10 sm:h-9 sm:w-9 text-muted-foreground hover:text-green-400 hover:bg-green-400/10 rounded-sm" 
                        title={server.suspended ? "Suspended" : "Start"}
                        disabled={displayStatus === 'running' || isTransitioning || powerMutation.isPending || server.suspended}
                        onClick={(e) => handlePowerAction(e, server.id, 'boot')}
                        aria-label="Start server"
                      >
                        <Power className="h-5 w-5 sm:h-4 sm:w-4" />
                      </Button>
                      <div className="w-px h-5 bg-muted mx-0.5" />
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-10 w-10 sm:h-9 sm:w-9 text-muted-foreground hover:text-yellow-400 hover:bg-yellow-400/10 rounded-sm" 
                        title={server.suspended ? "Suspended" : "Reboot"}
                        disabled={displayStatus !== 'running' || isTransitioning || powerMutation.isPending || server.suspended}
                        onClick={(e) => handlePowerAction(e, server.id, 'reboot')}
                        aria-label="Reboot server"
                      >
                        <RotateCw className="h-5 w-5 sm:h-4 sm:w-4" />
                      </Button>
                      <div className="w-px h-5 bg-muted mx-0.5" />
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-10 w-10 sm:h-9 sm:w-9 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-sm" 
                        title={server.suspended ? "Suspended" : "Stop"}
                        disabled={displayStatus === 'stopped' || isTransitioning || powerMutation.isPending || server.suspended}
                        onClick={(e) => handlePowerAction(e, server.id, 'shutdown')}
                        aria-label="Stop server"
                      >
                        <Square className="h-4 w-4 sm:h-3.5 sm:w-3.5 fill-current" />
                      </Button>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-foreground">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-card/95 backdrop-blur-xl border-border text-foreground">
                        <DropdownMenuLabel>Server Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator className="bg-muted" />
                        <DropdownMenuItem className="focus:bg-muted cursor-pointer">View Details</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                </div>
                
              </GlassCard>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
