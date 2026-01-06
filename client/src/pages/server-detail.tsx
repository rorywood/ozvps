import { useState, useEffect, useRef, useMemo } from "react";
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
  Check,
  Search,
  AlertTriangle,
  Clock
} from "lucide-react";
import { Link, useRoute, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { api, type SshKey } from "@/lib/api";
import { Checkbox } from "@/components/ui/checkbox";
import { KeyRound } from "lucide-react";
import flagAU from "@/assets/flag-au.png";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { OsTemplateRow } from "@/components/os-template-row";
import { getOsCategory, getOsLogoUrl, FALLBACK_LOGO, type OsTemplate as OsTemplateType } from "@/lib/os-logos";
import { ReinstallProgressPanel } from "@/components/reinstall-progress-panel";
import { useReinstallTask } from "@/hooks/use-reinstall-task";
import { useConsoleLock } from "@/hooks/use-console-lock";
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
} from "@/components/ui/dialog";

export default function ServerDetail() {
  const [, params] = useRoute("/servers/:id");
  const [, setLocation] = useLocation();
  const serverId = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reinstallDialogOpen, setReinstallDialogOpen] = useState(false);
  const [selectedOs, setSelectedOs] = useState<string>("");
  const [hostname, setHostname] = useState<string>("");
  const [hostnameError, setHostnameError] = useState<string>("");
  const [osSearchQuery, setOsSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [isRenamingServer, setIsRenamingServer] = useState(false);
  const [selectedSshKeyIds, setSelectedSshKeyIds] = useState<number[]>([]);
  
  const reinstallTask = useReinstallTask(serverId || '');

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
    queryKey: ['reinstall-templates', serverId],
    queryFn: () => api.getReinstallTemplates(serverId || ''),
    enabled: !!serverId && reinstallDialogOpen
  });
  
  // SSH Keys for reinstall
  const { data: sshKeys } = useQuery({
    queryKey: ['sshKeys'],
    queryFn: () => api.listSshKeys(),
    enabled: reinstallDialogOpen
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

  // Console lock hook - must be after server query
  const consoleLock = useConsoleLock(serverId || '', server?.status);

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
      
      // Start console lock for boot/reboot actions
      if (action === 'boot' || action === 'reboot') {
        consoleLock.startLock();
      }
      
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

  const reinstallMutation = useMutation({
    mutationFn: ({ id, osId, hostname, sshKeyIds }: { id: string, osId: number, hostname: string, sshKeyIds?: number[] }) => 
      api.reinstallServer(id, osId, hostname, sshKeyIds),
    onSuccess: (response) => {
      // Reset dialog state before closing
      setSelectedOs("");
      setHostname("");
      setHostnameError("");
      setOsSearchQuery("");
      setSelectedCategory("All");
      setSelectedSshKeyIds([]);
      setReinstallDialogOpen(false);
      
      // Start the reinstall task polling with the generated password and server IP
      const password = response.data?.generatedPassword;
      reinstallTask.startTask(undefined, password, server?.primaryIp);
      
      // Start console lock (server will reboot after reinstall)
      consoleLock.startLock();
      
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
    // Don't open console if locked
    if (consoleLock.isLocked) return;
    
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


  const validateHostname = (value: string): string => {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return 'Hostname is required';
    if (trimmed.length > 63) return 'Hostname must be 63 characters or less';
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(trimmed)) {
      if (trimmed.startsWith('-') || trimmed.endsWith('-')) {
        return 'Hostname cannot start or end with a hyphen';
      }
      return 'Hostname can only contain lowercase letters, numbers, and hyphens';
    }
    return '';
  };

  const handleHostnameChange = (value: string) => {
    setHostname(value);
    if (value.trim()) {
      setHostnameError(validateHostname(value));
    } else {
      setHostnameError('');
    }
  };

  const isHostnameValid = hostname.trim() && !validateHostname(hostname);

  const handleReinstall = () => {
    if (!serverId || !selectedOs) return;
    
    // Validate hostname
    const normalizedHostname = hostname.trim().toLowerCase();
    const hostnameValidation = validateHostname(hostname);
    if (hostnameValidation) {
      setHostnameError(hostnameValidation);
      return;
    }
    
    // Verify selected template is in the allowed list
    const selectedTemplate = allTemplates.find(t => t.id === selectedOs);
    if (!selectedTemplate) {
      toast({
        title: "Invalid Selection",
        description: "Please select an available OS template.",
        variant: "destructive",
      });
      return;
    }
    
    reinstallMutation.mutate({ 
      id: serverId, 
      osId: parseInt(selectedOs),
      hostname: normalizedHostname,
      sshKeyIds: selectedSshKeyIds.length > 0 ? selectedSshKeyIds : undefined
    });
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

  // Parse OS templates into flat list with categories
  const allTemplates = useMemo(() => {
    const templates: OsTemplateType[] = [];
    const seenUuids = new Set<string>();
    
    if (osTemplates && Array.isArray(osTemplates)) {
      osTemplates.forEach((group: any) => {
        if (group.templates && Array.isArray(group.templates)) {
          group.templates.forEach((template: any) => {
            const uuid = template.uuid || template.id?.toString() || '';
            if (seenUuids.has(uuid)) return;
            seenUuids.add(uuid);
            
            templates.push({
              id: template.id?.toString() || '',
              uuid,
              name: template.name || 'Unknown OS',
              version: template.version || '',
              variant: template.variant || '',
              distro: template.distro || group.name || '',
              slug: template.slug || '',
              description: template.description || group.description || '',
              group: group.name || 'Other',
            });
          });
        }
      });
    }
    return templates;
  }, [osTemplates]);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    allTemplates.forEach(t => cats.add(getOsCategory(t)));
    return ['All', ...Array.from(cats)];
  }, [allTemplates]);

  // Filter templates by search and category
  const filteredTemplates = useMemo(() => {
    return allTemplates.filter(t => {
      const matchesSearch = osSearchQuery === '' || 
        t.name.toLowerCase().includes(osSearchQuery.toLowerCase()) ||
        t.version.toLowerCase().includes(osSearchQuery.toLowerCase()) ||
        t.variant.toLowerCase().includes(osSearchQuery.toLowerCase()) ||
        (t.group || '').toLowerCase().includes(osSearchQuery.toLowerCase());
      
      const matchesCategory = selectedCategory === 'All' || 
        getOsCategory(t) === selectedCategory;
      
      return matchesSearch && matchesCategory;
    });
  }, [allTemplates, osSearchQuery, selectedCategory]);

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
                <img 
                  src={getOsLogoUrl({ id: server.image.id, name: server.image.name, distro: server.image.distro })}
                  alt={server.image.name}
                  className="h-4 w-4 object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_LOGO; }}
                />
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
              disabled={!!powerActionPending || server.status !== 'running' || isSuspended || consoleLock.isLocked}
              data-testid="button-console"
            >
              {consoleLock.isLocked ? (
                <>
                  <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
                  Console ({consoleLock.remainingSeconds}s)
                </>
              ) : (
                <>
                  <TerminalSquare className="h-4 w-4 mr-2 text-muted-foreground" />
                  Console
                </>
              )}
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
              {["Statistics", "IP Management", "Reinstallation", "Configuration"].map(tab => (
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
                
                // Smart unit formatter - shows MB for small values, GB for large
                const formatBytes = (bytes: number): string => {
                  if (bytes === 0) return '0 MB';
                  const gb = bytes / (1024 * 1024 * 1024);
                  if (gb >= 1) {
                    return `${gb.toFixed(2)} GB`;
                  }
                  const mb = bytes / (1024 * 1024);
                  if (mb >= 1) {
                    return `${mb.toFixed(1)} MB`;
                  }
                  const kb = bytes / 1024;
                  return `${kb.toFixed(0)} KB`;
                };
                
                const usedBytes = current?.total || 0;
                const usedGBNum = usedBytes / (1024 * 1024 * 1024);
                const usedDisplay = formatBytes(usedBytes);
                const rxDisplay = formatBytes(current?.rx || 0);
                const txDisplay = formatBytes(current?.tx || 0);
                const limitGB = current?.limit || bandwidthAllowance || 0;
                const remainingBytes = limitGB > 0 ? Math.max(0, (limitGB * 1024 * 1024 * 1024) - usedBytes) : null;
                const remainingDisplay = remainingBytes !== null ? formatBytes(remainingBytes) : null;
                const usagePercent = limitGB > 0 ? Math.min(100, (usedGBNum / limitGB) * 100) : 0;
                
                const periodStart = current?.periodStart ? new Date(current.periodStart).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : null;
                const periodEnd = current?.periodEnd ? new Date(current.periodEnd).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : null;
                
                return (
                  <div className="space-y-2">
                    {/* Compact Usage Display */}
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-white whitespace-nowrap" data-testid="text-bandwidth-used">
                        {usedDisplay} <span className="text-muted-foreground font-normal">/ {limitGB > 0 ? `${limitGB} GB` : '∞'}</span>
                      </span>
                      {remainingDisplay !== null ? (
                        <span className="text-sm font-semibold text-green-400 whitespace-nowrap" data-testid="text-bandwidth-remaining">
                          {remainingDisplay} <span className="text-[10px] text-muted-foreground font-normal">left</span>
                        </span>
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
                        <div className="text-xs font-semibold text-white" data-testid="text-bandwidth-rx">{rxDisplay}</div>
                      </div>
                      <div className="p-1.5 bg-white/5 rounded border border-white/10">
                        <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                          <ArrowUpFromLine className="h-2.5 w-2.5 text-blue-400" />OUT
                        </div>
                        <div className="text-xs font-semibold text-white" data-testid="text-bandwidth-tx">{txDisplay}</div>
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

          {/* Configuration Tab Placeholder */}
          <TabsContent value="configuration">
            <GlassCard className="p-12 text-center border-dashed border-white/10 bg-transparent">
              <p className="text-muted-foreground">This feature is coming soon.</p>
            </GlassCard>
          </TabsContent>
        </Tabs>
      </div>

      {/* Reinstall Dialog - Searchable Template Picker */}
      <Dialog open={reinstallDialogOpen} onOpenChange={(open) => {
        setReinstallDialogOpen(open);
        if (!open) {
          setSelectedOs("");
          setHostname("");
          setHostnameError("");
          setOsSearchQuery("");
          setSelectedCategory("All");
          setSelectedSshKeyIds([]);
        }
      }}>
        <DialogContent className="bg-[#0a0a0a] border-white/10 text-white max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="p-6 pb-4 border-b border-white/10">
            <DialogTitle className="text-xl">Reinstall Server</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Select an operating system to install on your server.
            </DialogDescription>
          </DialogHeader>

          {/* Warning Banner */}
          <div className="mx-6 mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-400">Warning: All data will be erased</p>
              <p className="text-xs text-red-400/80 mt-0.5">
                Reinstalling will completely wipe the disk. Make sure to backup any important data first.
              </p>
            </div>
          </div>

          {/* Hostname Input - Required */}
          <div className="px-6 pt-4">
            <label className="text-sm font-medium text-white block mb-2">
              Hostname <span className="text-red-400">*</span>
            </label>
            <Input
              value={hostname}
              onChange={(e) => handleHostnameChange(e.target.value)}
              placeholder="e.g., myserver"
              className={cn(
                "bg-white/5 border-white/10 text-white placeholder:text-muted-foreground",
                hostnameError && "border-red-500/50 focus-visible:ring-red-500"
              )}
              data-testid="input-hostname"
            />
            {hostnameError ? (
              <p className="text-xs text-red-400 mt-1">{hostnameError}</p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Lowercase letters, numbers, and hyphens only (1-63 characters)
              </p>
            )}
          </div>
          
          {/* SSH Key Selection */}
          {sshKeys && sshKeys.length > 0 && (
            <div className="px-6 pt-4">
              <label className="text-sm font-medium text-white flex items-center gap-2 mb-3">
                <KeyRound className="h-4 w-4 text-purple-400" />
                SSH Keys (optional)
              </label>
              <div className="space-y-2 max-h-28 overflow-y-auto bg-white/5 rounded-lg p-3 border border-white/10">
                {sshKeys.map((key) => (
                  <label
                    key={key.id}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-white/5 cursor-pointer transition-colors"
                    data-testid={`checkbox-ssh-key-${key.id}`}
                  >
                    <Checkbox
                      checked={selectedSshKeyIds.includes(key.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedSshKeyIds([...selectedSshKeyIds, key.id]);
                        } else {
                          setSelectedSshKeyIds(selectedSshKeyIds.filter(id => id !== key.id));
                        }
                      }}
                      className="border-white/30 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{key.name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">
                        {key.publicKey.substring(0, 40)}...
                      </p>
                    </div>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Selected keys will be added to authorized_keys for root login
              </p>
            </div>
          )}

          {/* Search and Category Filter */}
          <div className="px-6 pt-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={osSearchQuery}
                onChange={(e) => setOsSearchQuery(e.target.value)}
                placeholder="Search templates..."
                className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-muted-foreground"
                data-testid="input-os-search"
              />
            </div>
            
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                    selectedCategory === cat
                      ? "bg-primary text-white"
                      : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-white"
                  )}
                  data-testid={`button-category-${cat.toLowerCase().replace(/[^a-z]/g, '-')}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          
          {/* Template List */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {filteredTemplates.length > 0 ? (
              <div className="space-y-2">
                {filteredTemplates.map((template) => (
                  <OsTemplateRow
                    key={template.uuid || template.id}
                    template={template}
                    isSelected={selectedOs === template.id.toString()}
                    onSelect={() => setSelectedOs(template.id.toString())}
                  />
                ))}
              </div>
            ) : osTemplates && osTemplates.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-yellow-500" />
                <p className="font-medium">No OS templates available</p>
                <p className="text-sm mt-1">There are no templates available for this server.</p>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No operating systems found matching your search.</p>
              </div>
            )}
          </div>

          {/* Footer with Install Button */}
          <div className="border-t border-white/10 p-6">
            <Button 
              className="w-full bg-red-600 hover:bg-red-700 h-12 text-base font-semibold disabled:opacity-50"
              onClick={handleReinstall}
              disabled={!selectedOs || !isHostnameValid || reinstallMutation.isPending}
              data-testid="button-confirm-reinstall"
            >
              {reinstallMutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Installing...
                </>
              ) : (
                'Reinstall Server'
              )}
            </Button>
            {!isHostnameValid && hostname.trim() === '' && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Enter a hostname to continue
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reinstall Progress Dialog */}
      <Dialog open={reinstallTask.isActive} onOpenChange={() => {}}>
        <DialogContent className="bg-[#0a0a0a] border-white/10 text-white max-w-md" hideCloseButton>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {reinstallTask.status === 'complete' ? (
                <>
                  <Check className="h-5 w-5 text-green-500" />
                  Reinstall Complete
                </>
              ) : reinstallTask.status === 'failed' ? (
                <>
                  <AlertCircle className="h-5 w-5 text-red-500" />
                  Reinstall Failed
                </>
              ) : (
                <>
                  <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                  Reinstalling Server
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {reinstallTask.status === 'complete' 
                ? 'Your server has been reinstalled successfully.'
                : reinstallTask.status === 'failed'
                ? 'There was a problem reinstalling your server.'
                : 'Please wait while your server is being reinstalled. This may take several minutes.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <ReinstallProgressPanel 
              state={reinstallTask} 
              onDismiss={() => {
                reinstallTask.reset();
                queryClient.invalidateQueries({ queryKey: ['server', serverId] });
                queryClient.invalidateQueries({ queryKey: ['servers'] });
              }}
            />
          </div>
          
          {reinstallTask.status !== 'complete' && reinstallTask.status !== 'failed' && (
            <div className="text-xs text-muted-foreground text-center">
              Do not close this window. Your server will be available shortly.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

