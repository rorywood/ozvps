import { useState, useEffect, useRef } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  Power, 
  RotateCw, 
  TerminalSquare, 
  Cpu, 
  HardDrive, 
  Network, 
  Activity,
  HardDrive as StorageIcon,
  Loader2,
  AlertCircle,
  AlignLeft,
  ChevronDown,
  Copy,
  ExternalLink,
  RefreshCw,
  X,
  ArrowDownToLine,
  ArrowUpFromLine,
  Gauge,
  Calendar,
  TrendingUp,
  Pencil,
  Check
} from "lucide-react";
import { Link, useRoute, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import flagAU from "@/assets/flag-au.png";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export default function ServerDetail() {
  const [, params] = useRoute("/servers/:id");
  const [, setLocation] = useLocation();
  const serverId = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reinstallDialogOpen, setReinstallDialogOpen] = useState(false);
  const [reinstallInProgress, setReinstallInProgress] = useState(false);
  const [reinstallStatus, setReinstallStatus] = useState<string>('');
  const [selectedOs, setSelectedOs] = useState<string>("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [isRenamingServer, setIsRenamingServer] = useState(false);
  const reinstallPollRef = useRef<NodeJS.Timeout | null>(null);
  const reinstallTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: server, isLoading, isError } = useQuery({
    queryKey: ['server', serverId],
    queryFn: () => api.getServer(serverId || ''),
    enabled: !!serverId,
    refetchInterval: 10000, // Poll every 10 seconds for status updates
  });

  const { data: networkInfo } = useQuery({
    queryKey: ['network', serverId],
    queryFn: () => api.getNetworkInfo(serverId || ''),
    enabled: !!serverId
  });

  const { data: osTemplates } = useQuery({
    queryKey: ['os-templates', serverId],
    queryFn: () => api.getOsTemplates(serverId || ''),
    enabled: !!serverId
  });

  const { data: trafficData, isFetching: isTrafficFetching, refetch: refetchTraffic } = useQuery({
    queryKey: ['traffic', serverId],
    queryFn: () => api.getTrafficHistory(serverId || ''),
    enabled: !!serverId
  });

  // Live stats polling every 5 seconds
  const { data: liveStats } = useQuery({
    queryKey: ['live-stats', serverId],
    queryFn: () => api.getLiveStats(serverId || ''),
    enabled: !!serverId && server?.status === 'running',
    refetchInterval: 5000, // Poll every 5 seconds
  });

  const [powerActionPending, setPowerActionPending] = useState<string | null>(null);

  const powerMutation = useMutation({
    mutationFn: ({ id, action }: { id: string, action: 'boot' | 'reboot' | 'shutdown' | 'poweroff' }) => 
      api.powerAction(id, action),
    onMutate: ({ action }) => {
      setPowerActionPending(action);
    },
    onSuccess: (_, { action }) => {
      toast({
        title: "Action Initiated",
        description: action === 'boot' ? "Starting server..." : 
                     action === 'reboot' ? "Rebooting server..." :
                     action === 'poweroff' ? "Force stopping server..." :
                     "Shutting down server...",
      });
      // Poll for status updates
      const pollInterval = setInterval(async () => {
        await queryClient.invalidateQueries({ queryKey: ['server', serverId] });
        const updatedServer = queryClient.getQueryData(['server', serverId]) as any;
        if (updatedServer) {
          const isComplete = 
            (action === 'boot' && updatedServer.status === 'running') ||
            ((action === 'shutdown' || action === 'poweroff') && updatedServer.status === 'stopped') ||
            (action === 'reboot' && updatedServer.status === 'running');
          if (isComplete) {
            clearInterval(pollInterval);
            setPowerActionPending(null);
            queryClient.invalidateQueries({ queryKey: ['servers'] });
          }
        }
      }, 2000);
      // Clear after 30 seconds regardless
      setTimeout(() => {
        clearInterval(pollInterval);
        setPowerActionPending(null);
        queryClient.invalidateQueries({ queryKey: ['server', serverId] });
        queryClient.invalidateQueries({ queryKey: ['servers'] });
      }, 30000);
    },
    onError: () => {
      setPowerActionPending(null);
      toast({
        title: "Action Failed",
        description: "Failed to perform power action. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Helper to cleanup reinstall polling
  const cleanupReinstallPolling = () => {
    if (reinstallPollRef.current) {
      clearInterval(reinstallPollRef.current);
      reinstallPollRef.current = null;
    }
    if (reinstallTimeoutRef.current) {
      clearTimeout(reinstallTimeoutRef.current);
      reinstallTimeoutRef.current = null;
    }
  };

  const reinstallMutation = useMutation({
    mutationFn: ({ id, osId }: { id: string, osId: number }) => 
      api.reinstallServer(id, osId),
    onSuccess: () => {
      setReinstallDialogOpen(false);
      setReinstallInProgress(true);
      setReinstallStatus('Initializing reinstall...');
      
      // Cleanup any existing polls
      cleanupReinstallPolling();
      
      // Poll build status to track rebuild progress (uses buildFailed flag for reliable error detection)
      reinstallPollRef.current = setInterval(async () => {
        try {
          const buildStatus = await api.getBuildStatus(serverId || '');
          
          if (buildStatus.isError) {
            // Only trigger error if buildFailed is explicitly true
            cleanupReinstallPolling();
            setReinstallInProgress(false);
            setReinstallStatus('');
            toast({
              title: "Reinstallation Failed",
              description: "Server reinstallation encountered an error.",
              variant: "destructive",
            });
          } else if (buildStatus.isBuilding) {
            setReinstallStatus(buildStatus.phase === 'queued' ? 'Queued for installation...' : 'Installing operating system...');
          } else if (buildStatus.isComplete) {
            cleanupReinstallPolling();
            setReinstallInProgress(false);
            setReinstallStatus('');
            queryClient.invalidateQueries({ queryKey: ['server', serverId] });
            queryClient.invalidateQueries({ queryKey: ['servers'] });
            toast({
              title: "Reinstallation Complete",
              description: "Your server has been successfully reinstalled.",
            });
          }
        } catch (e) {
          // Keep polling on error
        }
      }, 5000);
      
      // Timeout after 10 minutes - use ref check instead of stale closure
      reinstallTimeoutRef.current = setTimeout(() => {
        if (reinstallPollRef.current) {
          cleanupReinstallPolling();
          setReinstallInProgress(false);
          setReinstallStatus('');
          queryClient.invalidateQueries({ queryKey: ['server', serverId] });
          toast({
            title: "Reinstallation Timeout",
            description: "Reinstallation is taking longer than expected. Please check your server status.",
            variant: "destructive",
          });
        }
      }, 600000);
      
      toast({
        title: "Reinstallation Started",
        description: "Server is being reinstalled. This may take a few minutes.",
      });
    },
    onError: () => {
      toast({
        title: "Reinstallation Failed",
        description: "Failed to start reinstallation. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handlePowerAction = (action: 'boot' | 'reboot' | 'shutdown' | 'poweroff') => {
    if (serverId) {
      powerMutation.mutate({ id: serverId, action });
    }
  };

  const handleOpenVnc = () => {
    if (!serverId) return;
    // Open console in a popout window
    const width = 1024;
    const height = 768;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;
    const popup = window.open(
      `/servers/${serverId}/console?popout=true`,
      'vnc_console',
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,resizable=yes`
    );
    // Fallback to in-tab navigation if popup was blocked
    if (!popup || popup.closed) {
      setLocation(`/servers/${serverId}/console`);
    }
  };

  const handleStartEditName = () => {
    if (server) {
      setEditedName(server.name);
      setIsEditingName(true);
    }
  };

  const handleCancelEditName = () => {
    setIsEditingName(false);
    setEditedName("");
  };

  const handleSaveName = async () => {
    if (!serverId || !editedName.trim()) return;
    
    setIsRenamingServer(true);
    try {
      await api.renameServer(serverId, editedName.trim());
      queryClient.invalidateQueries({ queryKey: ['server', serverId] });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      toast({
        title: "Server Renamed",
        description: "Server name has been updated successfully.",
      });
      setIsEditingName(false);
    } catch (error) {
      toast({
        title: "Rename Failed",
        description: "Could not rename server. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRenamingServer(false);
    }
  };


  const handleReinstall = () => {
    if (!serverId || !selectedOs) return;
    reinstallMutation.mutate({ id: serverId, osId: parseInt(selectedOs) });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Copied to clipboard",
    });
  };

  // Get bandwidth allowance from server plan specs (traffic limit in GB)
  const bandwidthAllowance = server?.plan?.specs?.traffic || 0;
  const currentMonth = new Date().getMonth() + 1;

  // Parse OS templates - group by distro, dedupe by uuid, show version + variant
  interface OsTemplate {
    id: string;
    uuid: string;
    name: string;
    version: string;
    variant: string;
    group: string;
    displayName: string;
  }
  
  const osTemplateMap = new Map<string, OsTemplate>();
  const osGroups: Array<{ name: string; icon: string; templates: OsTemplate[] }> = [];
  
  if (osTemplates && Array.isArray(osTemplates)) {
    osTemplates.forEach((group: any) => {
      const groupTemplates: OsTemplate[] = [];
      
      if (group.templates && Array.isArray(group.templates)) {
        group.templates.forEach((template: any) => {
          const uuid = template.uuid || template.id?.toString() || '';
          // Skip if we've already seen this template (dedupe by uuid)
          if (osTemplateMap.has(uuid)) return;
          
          const version = template.version || '';
          const variant = template.variant || '';
          const templateName = template.name || 'Unknown OS';
          // Create a proper display name with fallback to template name
          const displayName = version 
            ? `${version}${variant ? ` (${variant})` : ''}`
            : templateName + (variant ? ` (${variant})` : '');
          
          const templateObj: OsTemplate = {
            id: template.id?.toString() || '',
            uuid,
            name: template.name || 'Unknown OS',
            version,
            variant,
            group: group.name || 'Other',
            displayName
          };
          
          osTemplateMap.set(uuid, templateObj);
          groupTemplates.push(templateObj);
        });
      }
      
      if (groupTemplates.length > 0) {
        osGroups.push({
          name: group.name || 'Other',
          icon: group.icon || 'linux_logo.png',
          templates: groupTemplates
        });
      }
    });
  }
  
  // Flatten for backward compatibility
  const osOptions = Array.from(osTemplateMap.values());

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground h-[50vh]">
          <Loader2 className="h-10 w-10 animate-spin mb-4 text-primary" />
          <p>Loading server details...</p>
        </div>
      </AppShell>
    );
  }

  if (isError || !server) {
    return (
      <AppShell>
         <div className="flex flex-col items-center justify-center py-20 text-red-400 h-[50vh]">
            <AlertCircle className="h-10 w-10 mb-4" />
            <p>Server not found or access denied.</p>
            <Link href="/servers">
              <Button variant="outline" className="mt-4 border-white/10 text-white">Return to Fleet</Button>
            </Link>
          </div>
      </AppShell>
    );
  }

  const isSuspended = server?.suspended === true;

  return (
    <AppShell>
      <div className="space-y-6 pb-20">
        
        {/* Suspension Banner */}
        {isSuspended && (
          <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-4 flex items-center gap-3" data-testid="banner-suspended">
            <AlertCircle className="h-5 w-5 text-yellow-400 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-yellow-300">This VPS has been suspended</h3>
              <p className="text-sm text-yellow-300/80">
                Please contact support for assistance.
              </p>
            </div>
          </div>
        )}
        
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 pb-6 border-b border-white/5">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
               <Link href="/servers">
                <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2 text-muted-foreground hover:text-white hover:bg-white/5" data-testid="button-back">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="h-8 w-48 bg-black/30 border-white/20 text-white font-display font-bold text-lg"
                    maxLength={50}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName();
                      if (e.key === 'Escape') handleCancelEditName();
                    }}
                    data-testid="input-server-name"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-green-400 hover:bg-green-500/20"
                    onClick={handleSaveName}
                    disabled={isRenamingServer || !editedName.trim()}
                    data-testid="button-save-name"
                  >
                    {isRenamingServer ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:bg-white/10"
                    onClick={handleCancelEditName}
                    disabled={isRenamingServer}
                    data-testid="button-cancel-name"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <h1 className="text-2xl font-display font-bold text-white tracking-tight" data-testid="text-server-name">{server.name}</h1>
                  {!isSuspended && (
                    <button
                      onClick={handleStartEditName}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-white p-1"
                      data-testid="button-edit-name"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
              {powerActionPending ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
                  <span className="text-xs text-yellow-400 font-medium">
                    {powerActionPending === 'boot' ? 'Starting...' :
                     powerActionPending === 'reboot' ? 'Rebooting...' :
                     powerActionPending === 'poweroff' ? 'Stopping...' :
                     'Shutting down...'}
                  </span>
                </div>
              ) : (
                <div className={cn(
                  "h-2.5 w-2.5 rounded-full shadow-[0_0_8px]",
                  server.status === 'running' ? "bg-green-500 shadow-green-500/50" : 
                  server.status === 'stopped' ? "bg-red-500 shadow-red-500/50" :
                  "bg-yellow-500 shadow-yellow-500/50"
                )} data-testid="status-indicator" />
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground font-medium">
              <div className="flex items-center gap-2">
                <div className="bg-white/10 px-1.5 py-0.5 rounded text-[10px] font-mono text-white border border-white/10">IP</div>
                <span className="text-white/80 font-mono" data-testid="text-primary-ip">{server.primaryIp}</span>
                <button 
                  onClick={() => copyToClipboard(server.primaryIp)} 
                  className="text-muted-foreground hover:text-white"
                  data-testid="button-copy-ip"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <img src={flagAU} alt="Australia" className="h-4 w-6 object-cover rounded-sm shadow-sm" />
                <span className="text-white/80">{server.location.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <AlignLeft className="h-3.5 w-3.5" />
                <span className="text-white/80">{server.image.name}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button 
              variant="secondary" 
              className={cn(
                "shadow-none font-medium h-9",
                (powerActionPending || server.status !== 'running' || isSuspended)
                  ? "bg-white/5 text-muted-foreground border-white/5 cursor-not-allowed" 
                  : "bg-white/5 hover:bg-white/10 text-white border-white/10"
              )}
              onClick={handleOpenVnc}
              disabled={!!powerActionPending || server.status !== 'running' || isSuspended}
              data-testid="button-console"
            >
              <TerminalSquare className="h-4 w-4 mr-2 text-muted-foreground" />
              Console
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  className={cn(
                    "font-medium h-9 border-0",
                    isSuspended 
                      ? "bg-white/10 text-muted-foreground cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)]"
                  )}
                  data-testid="button-power-options"
                  disabled={!!powerActionPending || isSuspended}
                >
                  {powerActionPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Power className="h-4 w-4 mr-2" />
                  )}
                  Power Options
                  <ChevronDown className="h-3 w-3 ml-2 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-[#0a0a0a]/95 backdrop-blur-xl border-white/10 text-white">
                 <DropdownMenuItem 
                    className="focus:bg-white/10 cursor-pointer text-green-400 focus:text-green-400"
                    disabled={server.status === 'running' || !!powerActionPending || isSuspended}
                    onClick={() => handlePowerAction('boot')}
                    data-testid="menu-item-start"
                  >
                   <Power className="h-4 w-4 mr-2" /> Start Server
                 </DropdownMenuItem>
                 <DropdownMenuItem 
                    className="focus:bg-white/10 cursor-pointer text-yellow-400 focus:text-yellow-400"
                    disabled={server.status !== 'running' || !!powerActionPending || isSuspended}
                    onClick={() => handlePowerAction('reboot')}
                    data-testid="menu-item-reboot"
                  >
                   <RotateCw className="h-4 w-4 mr-2" /> Reboot
                 </DropdownMenuItem>
                 <DropdownMenuItem 
                    className="focus:bg-white/10 cursor-pointer text-orange-400 focus:text-orange-400"
                    disabled={server.status === 'stopped' || !!powerActionPending || isSuspended}
                    onClick={() => handlePowerAction('shutdown')}
                    data-testid="menu-item-shutdown"
                  >
                   <Power className="h-4 w-4 mr-2" /> Shutdown
                 </DropdownMenuItem>
                 <DropdownMenuItem 
                    className="focus:bg-white/10 cursor-pointer text-red-400 focus:text-red-400"
                    disabled={server.status === 'stopped' || !!powerActionPending || isSuspended}
                    onClick={() => handlePowerAction('poweroff')}
                    data-testid="menu-item-poweroff"
                  >
                   <Power className="h-4 w-4 mr-2 rotate-180" /> Force Stop
                 </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Specs Bar */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <GlassCard className="p-4 flex items-center gap-4 bg-white/[0.02] border-white/5">
             <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center text-white/70">
                <Cpu className="h-5 w-5" />
             </div>
             <div>
                <div className="text-sm font-bold text-white">{server.plan.specs.vcpu} vCore</div>
                <div className="text-xs text-muted-foreground">CPU Allocated</div>
             </div>
          </GlassCard>
          
          <GlassCard className="p-4 flex items-center gap-4 bg-white/[0.02] border-white/5">
             <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center text-white/70">
                <Activity className="h-5 w-5" />
             </div>
             <div>
                <div className="text-sm font-bold text-white">{server.plan.specs.ram >= 1024 ? (server.plan.specs.ram / 1024).toFixed(0) : server.plan.specs.ram} {server.plan.specs.ram >= 1024 ? 'GB' : 'MB'}</div>
                <div className="text-xs text-muted-foreground">RAM Allocated</div>
             </div>
          </GlassCard>

          <GlassCard className="p-4 flex items-center gap-4 bg-white/[0.02] border-white/5">
             <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center text-white/70">
                <StorageIcon className="h-5 w-5" />
             </div>
             <div>
                <div className="text-sm font-bold text-white">{server.plan.specs.disk} GB</div>
                <div className="text-xs text-muted-foreground">Storage Allocated</div>
             </div>
          </GlassCard>

          <GlassCard className="p-4 flex items-center gap-4 bg-white/[0.02] border-white/5">
             <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center text-white/70">
                <Network className="h-5 w-5" />
             </div>
             <div>
                <div className="text-sm font-bold text-white" data-testid="text-traffic">
                  {server.primaryIp !== 'N/A' ? server.primaryIp : 'No IP'}
                </div>
                <div className="text-xs text-muted-foreground">Primary IP</div>
             </div>
          </GlassCard>
        </div>

        {/* Navigation Tabs */}
        <Tabs defaultValue="statistics" className="space-y-6">
          <div className="border-b border-white/10">
            <TabsList className="bg-transparent h-auto p-0 gap-6 w-full flex flex-wrap justify-start">
              {["Statistics", "IP Management", "Reinstallation", "Rescue", "Configuration"].map(tab => (
                 <TabsTrigger 
                    key={tab} 
                    value={tab.toLowerCase().replace(' ', '-')}
                    className="bg-transparent border-b-2 border-transparent rounded-none px-1 py-3 text-muted-foreground data-[state=active]:border-blue-500 data-[state=active]:text-blue-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-all hover:text-white"
                    data-testid={`tab-${tab.toLowerCase().replace(' ', '-')}`}
                  >
                    {tab}
                 </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="statistics" className="space-y-6 animate-in fade-in duration-300">
            
            {/* Live Stats - CPU, Memory, Disk */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* CPU Card */}
              <GlassCard className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">CPU</h3>
                  {server.status === 'running' && !powerActionPending ? (
                    <span className="text-lg font-bold text-white" data-testid="text-cpu-percent">
                      {liveStats ? `${liveStats.cpu_usage.toFixed(1)}%` : '—'}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      {(powerActionPending || server.status !== 'stopped') && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                      {powerActionPending === 'boot' ? 'Starting...' : 
                       powerActionPending ? 'Please wait...' :
                       server.status === 'stopped' ? 'Offline' : 'Loading...'}
                    </span>
                  )}
                </div>
                <div className="w-full bg-white/10 rounded-full h-1.5">
                  <div 
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-500",
                      server.status === 'running' && !powerActionPending ? "bg-blue-500" : "bg-white/20"
                    )}
                    style={{ width: server.status === 'running' && !powerActionPending ? `${liveStats?.cpu_usage || 0}%` : '0%' }}
                    data-testid="progress-cpu"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
                  <span>{server.plan.specs.vcpu} Core{server.plan.specs.vcpu > 1 ? 's' : ''}</span>
                </div>
              </GlassCard>

              {/* Memory Card */}
              <GlassCard className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Memory</h3>
                  {server.status === 'running' && !powerActionPending ? (
                    <span className="text-lg font-bold text-white" data-testid="text-memory-percent">
                      {liveStats ? `${liveStats.ram_usage.toFixed(1)}%` : '—'}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      {(powerActionPending || server.status !== 'stopped') && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                      {powerActionPending === 'boot' ? 'Starting...' : 
                       powerActionPending ? 'Please wait...' :
                       server.status === 'stopped' ? 'Offline' : 'Loading...'}
                    </span>
                  )}
                </div>
                <div className="w-full bg-white/10 rounded-full h-1.5">
                  <div 
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-500",
                      server.status === 'running' && !powerActionPending ? "bg-green-500" : "bg-white/20"
                    )}
                    style={{ width: server.status === 'running' && !powerActionPending ? `${liveStats?.ram_usage || 0}%` : '0%' }}
                    data-testid="progress-memory"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
                  <span data-testid="text-memory-used">
                    {server.status === 'running' && !powerActionPending && liveStats?.memory_used_mb 
                      ? `${liveStats.memory_used_mb} MB / ${liveStats.memory_total_mb} MB` 
                      : '—'}
                  </span>
                </div>
              </GlassCard>

              {/* Disk Card */}
              <GlassCard className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Disk</h3>
                  {server.status === 'running' && !powerActionPending ? (
                    <span className="text-lg font-bold text-white" data-testid="text-disk-percent">
                      {liveStats ? `${liveStats.disk_usage.toFixed(1)}%` : '—'}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      {(powerActionPending || server.status !== 'stopped') && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                      {powerActionPending === 'boot' ? 'Starting...' : 
                       powerActionPending ? 'Please wait...' :
                       server.status === 'stopped' ? 'Offline' : 'Loading...'}
                    </span>
                  )}
                </div>
                <div className="w-full bg-white/10 rounded-full h-1.5">
                  <div 
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-500",
                      server.status === 'running' && !powerActionPending ? "bg-purple-500" : "bg-white/20"
                    )}
                    style={{ width: server.status === 'running' && !powerActionPending ? `${liveStats?.disk_usage || 0}%` : '0%' }}
                    data-testid="progress-disk"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
                  <span data-testid="text-disk-used">
                    {server.status === 'running' && !powerActionPending && liveStats?.disk_used_gb 
                      ? `${liveStats.disk_used_gb} GB / ${liveStats.disk_total_gb} GB` 
                      : '—'}
                  </span>
                </div>
              </GlassCard>
            </div>

            {/* Bandwidth Stats Card - Compact */}
            <GlassCard className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-white uppercase tracking-wider flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-400" />
                  Bandwidth Usage
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => refetchTraffic()}
                  disabled={isTrafficFetching}
                  data-testid="button-refresh-bandwidth"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", isTrafficFetching && "animate-spin")} />
                </Button>
              </div>

              {(() => {
                const current = trafficData?.current;
                const network = trafficData?.network;
                
                // Calculate values with 2 decimal places for precision
                const usedGBNum = current?.total ? current.total / (1024 * 1024 * 1024) : 0;
                const usedGB = usedGBNum.toFixed(2);
                const rxGB = current?.rx ? (current.rx / (1024 * 1024 * 1024)).toFixed(2) : '0.00';
                const txGB = current?.tx ? (current.tx / (1024 * 1024 * 1024)).toFixed(2) : '0.00';
                const limitGB = current?.limit || bandwidthAllowance || 0;
                const remainingGBNum = limitGB > 0 ? Math.max(0, limitGB - usedGBNum) : null;
                const remainingGB = remainingGBNum !== null ? remainingGBNum.toFixed(2) : null;
                const usagePercent = limitGB > 0 ? Math.min(100, (usedGBNum / limitGB) * 100) : 0;
                
                const periodStart = current?.periodStart ? new Date(current.periodStart).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : null;
                const periodEnd = current?.periodEnd ? new Date(current.periodEnd).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : null;
                
                return (
                  <div className="space-y-2">
                    {/* Compact Usage Display */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg font-bold text-white" data-testid="text-bandwidth-used">{usedGB} GB</span>
                        <span className="text-xs text-muted-foreground">/ {limitGB > 0 ? `${limitGB} GB` : '∞'}</span>
                      </div>
                      {remainingGB !== null ? (
                        <div className="text-right">
                          <span className="text-sm font-semibold text-green-400" data-testid="text-bandwidth-remaining">{remainingGB} GB</span>
                          <span className="text-[10px] text-muted-foreground ml-1">left</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unlimited</span>
                      )}
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="w-full bg-white/10 rounded-full h-2">
                      <div 
                        className={cn(
                          "h-2 rounded-full transition-all duration-500",
                          usagePercent > 90 ? "bg-red-500" :
                          usagePercent > 70 ? "bg-yellow-500" :
                          "bg-blue-500"
                        )}
                        style={{ width: `${Math.max(usagePercent, 1)}%` }}
                        data-testid="progress-bandwidth"
                      />
                    </div>
                    
                    {/* Compact Stats Row */}
                    <div className="grid grid-cols-4 gap-1.5 text-center">
                      <div className="p-1.5 bg-white/5 rounded border border-white/10">
                        <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                          <ArrowDownToLine className="h-2.5 w-2.5 text-green-400" />IN
                        </div>
                        <div className="text-xs font-semibold text-white" data-testid="text-bandwidth-rx">{rxGB}</div>
                      </div>
                      <div className="p-1.5 bg-white/5 rounded border border-white/10">
                        <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                          <ArrowUpFromLine className="h-2.5 w-2.5 text-blue-400" />OUT
                        </div>
                        <div className="text-xs font-semibold text-white" data-testid="text-bandwidth-tx">{txGB}</div>
                      </div>
                      <div className="p-1.5 bg-white/5 rounded border border-white/10">
                        <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                          <Gauge className="h-2.5 w-2.5 text-purple-400" />PORT
                        </div>
                        <div className="text-xs font-semibold text-white" data-testid="text-port-speed">{network?.portSpeed || 500}M</div>
                      </div>
                      <div className="p-1.5 bg-white/5 rounded border border-white/10">
                        <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                          <Network className="h-2.5 w-2.5 text-cyan-400" />%
                        </div>
                        <div className="text-xs font-semibold text-white" data-testid="text-bandwidth-percent">{usagePercent.toFixed(1)}%</div>
                      </div>
                    </div>
                    
                    {/* Period - inline */}
                    {periodStart && periodEnd && (
                      <div className="text-[10px] text-muted-foreground text-center">{periodStart} - {periodEnd}</div>
                    )}
                  </div>
                );
              })()}
            </GlassCard>
          </TabsContent>

          {/* IP Management Tab */}
          <TabsContent value="ip-management" className="space-y-4 animate-in fade-in duration-300">
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-white">Network Interfaces</h3>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="border-white/10"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['network', serverId] })}
                  data-testid="button-refresh-network"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
              
              {networkInfo?.interfaces && networkInfo.interfaces.length > 0 ? (
                <div className="space-y-4">
                  {networkInfo.interfaces.map((iface, index) => (
                    <div key={index} className="p-4 bg-white/5 rounded-lg border border-white/10">
                      <div className="flex items-center gap-3 mb-4">
                        <Network className="h-5 w-5 text-blue-400" />
                        <span className="font-mono font-bold text-white">{iface.name}</span>
                        <span className="text-xs text-muted-foreground">MAC: {iface.mac}</span>
                      </div>
                      
                      {iface.ipv4.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">IPv4 Addresses</div>
                          {iface.ipv4.map((ip, ipIndex) => (
                            <div key={ipIndex} className="flex items-center justify-between p-3 bg-white/5 rounded-md">
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-white" data-testid={`text-ip-${index}-${ipIndex}`}>{ip.address}</span>
                                <span className="text-xs text-muted-foreground">/ {ip.netmask}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Gateway: {ip.gateway}</span>
                                <button 
                                  onClick={() => copyToClipboard(ip.address)}
                                  className="text-muted-foreground hover:text-white p-1"
                                  data-testid={`button-copy-ip-${index}-${ipIndex}`}
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {iface.ipv6.length > 0 && (
                        <div className="space-y-2 mt-4">
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">IPv6 Addresses</div>
                          {iface.ipv6.map((ip, ipIndex) => (
                            <div key={ipIndex} className="flex items-center justify-between p-3 bg-white/5 rounded-md">
                              <span className="font-mono text-white text-sm">{ip.address}</span>
                              <button 
                                onClick={() => copyToClipboard(ip.address)}
                                className="text-muted-foreground hover:text-white p-1"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Network className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No network interfaces found</p>
                </div>
              )}
            </GlassCard>
          </TabsContent>

          {/* Reinstallation Tab */}
          <TabsContent value="reinstallation" className="space-y-4 animate-in fade-in duration-300">
            <GlassCard className="p-6">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white mb-2">Reinstall Operating System</h3>
                  <p className="text-sm text-muted-foreground">
                    This will completely erase all data on your server and install a fresh operating system.
                    Make sure to backup any important data before proceeding.
                  </p>
                </div>
                
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
                    <div>
                      <div className="font-medium text-red-400">Warning: Data Loss</div>
                      <div className="text-sm text-red-400/80">
                        All existing data on the server will be permanently deleted. This action cannot be undone.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-white mb-2 block">Current Operating System</label>
                    <div className="p-3 bg-white/5 rounded-md border border-white/10">
                      <span className="text-white">{server.image.name}</span>
                    </div>
                  </div>

                  <Button 
                    className={cn(
                      "text-white",
                      isSuspended 
                        ? "bg-white/10 text-muted-foreground cursor-not-allowed"
                        : "bg-red-600 hover:bg-red-700"
                    )}
                    onClick={() => setReinstallDialogOpen(true)}
                    disabled={isSuspended}
                    data-testid="button-reinstall"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reinstall Server
                  </Button>
                  {isSuspended && (
                    <p className="text-sm text-yellow-400/80 mt-2">
                      Reinstall is disabled while the server is suspended.
                    </p>
                  )}
                </div>
              </div>
            </GlassCard>
          </TabsContent>

          {/* Other Tabs Placeholder */}
          {["rescue", "configuration"].map(tab => (
            <TabsContent key={tab} value={tab}>
               <GlassCard className="p-12 text-center border-dashed border-white/10 bg-transparent">
                  <p className="text-muted-foreground">This feature is coming soon.</p>
               </GlassCard>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Reinstall Dialog */}
      <Dialog open={reinstallDialogOpen} onOpenChange={setReinstallDialogOpen}>
        <DialogContent className="bg-[#0a0a0a] border-white/10 text-white max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Reinstall Server</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Select an operating system to install on your server. This will erase all existing data.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto py-4 space-y-4">
            {osGroups.length > 0 ? (
              osGroups.map((group) => (
                <div key={group.name} className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-sm font-semibold text-white">{group.name}</span>
                    <span className="text-xs text-muted-foreground">({group.templates.length} options)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.templates.map((template) => (
                      <button
                        key={template.uuid}
                        onClick={() => setSelectedOs(template.id)}
                        className={cn(
                          "p-3 rounded-lg border text-left transition-all",
                          selectedOs === template.id
                            ? "bg-primary/20 border-primary text-white"
                            : "bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20"
                        )}
                        data-testid={`button-os-${template.id}`}
                      >
                        <div className="font-medium text-sm">{template.version || template.name}</div>
                        {template.variant && (
                          <div className="text-xs text-muted-foreground mt-0.5">{template.variant}</div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No operating systems available for this server.</p>
              </div>
            )}
            
            {selectedOs && (
              <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                <div className="text-xs text-muted-foreground mb-1">Selected</div>
                <div className="text-white font-medium">
                  {osOptions.find(os => os.id === selectedOs)?.group} - {osOptions.find(os => os.id === selectedOs)?.displayName}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-white/10 pt-4">
            <Button 
              variant="outline" 
              onClick={() => setReinstallDialogOpen(false)}
              className="border-white/10"
            >
              Cancel
            </Button>
            <Button 
              className="bg-red-600 hover:bg-red-700"
              onClick={handleReinstall}
              disabled={!selectedOs || reinstallMutation.isPending}
              data-testid="button-confirm-reinstall"
            >
              {reinstallMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Reinstalling...
                </>
              ) : (
                'Confirm Reinstall'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reinstall Progress Dialog */}
      <Dialog open={reinstallInProgress} onOpenChange={() => {}}>
        <DialogContent className="bg-[#0a0a0a] border-white/10 text-white max-w-md" hideCloseButton>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 animate-spin text-primary" />
              Reinstalling Server
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Please wait while your server is being reinstalled. This may take several minutes.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-6 space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{reinstallStatus}</span>
              </div>
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary rounded-full animate-pulse"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span>Reinstall initiated</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  reinstallStatus.includes('Installing') ? "bg-primary animate-pulse" : "bg-white/20"
                )} />
                <span>Installing operating system</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-white/20" />
                <span>Finalizing configuration</span>
              </div>
            </div>
          </div>
          
          <div className="text-xs text-muted-foreground text-center">
            Do not close this window. Your server will be available shortly.
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
