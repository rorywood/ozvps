import { useState, useEffect, useRef, useMemo } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { useDocumentTitle } from "@/hooks/use-document-title";
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
  Check,
  Search,
  AlertTriangle,
  Clock,
  Settings,
  Rocket,
  Trash2,
  XCircle,
  Key,
  Eye,
  EyeOff,
  Shield
} from "lucide-react";
import { Link, useRoute, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import flagAU from "@/assets/flag-au.png";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { OsTemplateRow } from "@/components/os-template-row";
import { getOsCategory, getOsLogoUrl, FALLBACK_LOGO, type OsTemplate as OsTemplateType } from "@/lib/os-logos";
import { ReinstallProgressPanel } from "@/components/reinstall-progress-panel";
import { SetupProgressChecklist } from "@/components/setup-progress-checklist";
import { useReinstallTask } from "@/hooks/use-reinstall-task";
import { useConsoleLock } from "@/hooks/use-console-lock";
import { usePowerActions, useSyncPowerActions } from "@/hooks/use-power-actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";

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
  
  // Setup wizard state
  const [setupSelectedOs, setSetupSelectedOs] = useState<string>("");
  const [setupHostname, setSetupHostname] = useState<string>("");
  const [setupHostnameError, setSetupHostnameError] = useState<string>("");
  const [setupOsSearchQuery, setSetupOsSearchQuery] = useState("");
  const [setupExpandedGroups, setSetupExpandedGroups] = useState<string[]>([]);
  
  // Track if current task is initial setup vs reinstall
  // Persist to sessionStorage to survive page reloads during the process
  const [isSetupMode, setIsSetupMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const stored = sessionStorage.getItem(`setupMode:${serverId}`);
      return stored === 'true';
    } catch {
      return false;
    }
  });
  
  // Persist setup mode to sessionStorage when it changes
  const updateSetupMode = (value: boolean) => {
    setIsSetupMode(value);
    try {
      if (value) {
        sessionStorage.setItem(`setupMode:${serverId}`, 'true');
      } else {
        sessionStorage.removeItem(`setupMode:${serverId}`);
      }
    } catch {
      // Ignore storage errors
    }
  };
  
  // Cancellation state
  const [cancellationReason, setCancellationReason] = useState<string>("");
  const [immediateConfirmOpen, setImmediateConfirmOpen] = useState(false);
  const [immediateConfirmText, setImmediateConfirmText] = useState("");
  
  // Password reset state
  const [passwordResetDialogOpen, setPasswordResetDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);
  
  // Persistent setup credentials (survives dialog close and page refreshes)
  const [savedCredentials, setSavedCredentials] = useState<{
    serverIp: string;
    username: string;
    password: string;
  } | null>(() => {
    // Restore from sessionStorage on mount (guard for SSR)
    if (typeof window === 'undefined') return null;
    try {
      const stored = sessionStorage.getItem(`credentials:${serverId}`);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // Ignore parse errors
    }
    return null;
  });
  const [showSavedCredentials, setShowSavedCredentials] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return !!sessionStorage.getItem(`credentials:${serverId}`);
    } catch {
      return false;
    }
  });
  const [showCredentialsPassword, setShowCredentialsPassword] = useState(false);
  
  // Persist credentials to sessionStorage when they change
  const updateSavedCredentials = (creds: { serverIp: string; username: string; password: string } | null) => {
    setSavedCredentials(creds);
    try {
      if (creds) {
        sessionStorage.setItem(`credentials:${serverId}`, JSON.stringify(creds));
      } else {
        sessionStorage.removeItem(`credentials:${serverId}`);
      }
    } catch {
      // Ignore storage errors
    }
  };
  
  // Auto-hide credentials banner after 2 minutes
  useEffect(() => {
    if (showSavedCredentials && savedCredentials) {
      const timer = setTimeout(() => {
        setShowSavedCredentials(false);
        updateSavedCredentials(null);
      }, 2 * 60 * 1000); // 2 minutes
      return () => clearTimeout(timer);
    }
  }, [showSavedCredentials, savedCredentials]);
  
  
  // Setup progress minimized state (persistent banner when minimized)
  const [setupMinimized, setSetupMinimized] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const stored = sessionStorage.getItem(`setupMinimized:${serverId}`);
      return stored === 'true';
    } catch {
      return false;
    }
  });
  
  const updateSetupMinimized = (value: boolean) => {
    setSetupMinimized(value);
    try {
      if (value) {
        sessionStorage.setItem(`setupMinimized:${serverId}`, 'true');
      } else {
        sessionStorage.removeItem(`setupMinimized:${serverId}`);
      }
    } catch {
      // Ignore storage errors
    }
  };
  
  const reinstallTask = useReinstallTask(serverId || '');

  const { data: server, isLoading, isError } = useQuery({
    queryKey: ['server', serverId],
    queryFn: () => api.getServer(serverId || ''),
    enabled: !!serverId,
    refetchInterval: 10000, // Poll every 10 seconds for status updates
  });

  // Dynamic page title
  useDocumentTitle(server?.name ? `${server.name}` : 'Server Details');

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
  
  // Fetch OS templates for initial setup (when server needs setup)
  const { data: setupTemplates, isLoading: loadingSetupTemplates } = useQuery({
    queryKey: ['setup-templates', serverId],
    queryFn: () => api.getReinstallTemplates(serverId || ''),
    enabled: !!serverId && !!server?.needsSetup
  });
  
  const { data: trafficData, isFetching: isTrafficFetching, refetch: refetchTraffic } = useQuery({
    queryKey: ['traffic', serverId],
    queryFn: () => api.getTrafficHistory(serverId || ''),
    enabled: !!serverId
  });
  
  
  // Fetch cancellation status
  const { data: cancellationData, refetch: refetchCancellation } = useQuery({
    queryKey: ['cancellation', serverId],
    queryFn: () => api.getCancellationStatus(serverId || ''),
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
  
  // Clear building flags when server no longer needs setup AND reinstall task is complete
  useEffect(() => {
    if (server && !server.needsSetup && serverId && !reinstallTask.isActive) {
      try {
        // Server setup is complete and task is done, clear any leftover building flags
        if (sessionStorage.getItem(`setupMode:${serverId}`) || 
            sessionStorage.getItem(`setupMinimized:${serverId}`)) {
          sessionStorage.removeItem(`setupMode:${serverId}`);
          sessionStorage.removeItem(`setupMinimized:${serverId}`);
          setIsSetupMode(false);
          setSetupMinimized(false);
        }
      } catch {
        // Ignore storage errors
      }
    }
  }, [server?.needsSetup, serverId, reinstallTask.isActive]);
  
  // Set credentials in state when they become available (persists to sessionStorage)
  useEffect(() => {
    if (reinstallTask.credentials && serverId && !savedCredentials) {
      updateSavedCredentials(reinstallTask.credentials);
      setShowSavedCredentials(true);
    }
  }, [reinstallTask.credentials, serverId, savedCredentials]);
  
  // Refetch server data when build completes to update needsSetup status
  // This ensures the UI transitions properly after a build finishes (even if tabbed out)
  useEffect(() => {
    if (reinstallTask.status === 'complete' && serverId) {
      queryClient.invalidateQueries({ queryKey: ['server', serverId] });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    }
  }, [reinstallTask.status, serverId, queryClient]);
  
  // Track if we've already triggered auto-password-reset to avoid duplicates
  const autoPasswordResetTriggeredRef = useRef(false);
  const autoPasswordResetInProgressRef = useRef(false);
  
  // Auto-fetch credentials when setup completes but no password was returned from build
  // This handles cases where VirtFusion doesn't include the password in the build response
  // Uses a 2-second delay to allow credentials to be populated from the build response first
  useEffect(() => {
    const shouldAutoReset = 
      reinstallTask.status === 'complete' && 
      !reinstallTask.credentials && 
      !savedCredentials &&
      serverId && 
      server?.primaryIp &&
      !autoPasswordResetTriggeredRef.current &&
      !autoPasswordResetInProgressRef.current;
    
    if (shouldAutoReset) {
      autoPasswordResetTriggeredRef.current = true;
      autoPasswordResetInProgressRef.current = true;
      
      // Add a short delay before auto-reset to give time for any async credential updates
      const timeoutId = setTimeout(() => {
        // Double-check we still need credentials after the delay
        if (!savedCredentials) {
          api.resetServerPassword(serverId).then(response => {
            if (response.password) {
              const creds = {
                serverIp: server.primaryIp || 'N/A',
                username: response.username || 'root',
                password: response.password
              };
              updateSavedCredentials(creds);
              setShowSavedCredentials(true);
            }
          }).catch(() => {
            // Silent fail - user can manually reset password
          }).finally(() => {
            autoPasswordResetInProgressRef.current = false;
          });
        } else {
          autoPasswordResetInProgressRef.current = false;
        }
      }, 2000);
      
      return () => clearTimeout(timeoutId);
    }
    
    // Reset the flag when task is reset
    if (!reinstallTask.isActive) {
      autoPasswordResetTriggeredRef.current = false;
    }
  }, [reinstallTask.status, reinstallTask.credentials, reinstallTask.isActive, savedCredentials, serverId, server?.primaryIp]);

  const [powerActionPending, setPowerActionPending] = useState<string | null>(null);
  const { markPending, clearPending, getDisplayStatus } = usePowerActions();
  
  useSyncPowerActions(server ? [server] : []);
  
  const displayStatus = server ? getDisplayStatus(server.id, server.status) : 'unknown';
  const isTransitioning = ['rebooting', 'starting', 'stopping'].includes(displayStatus);

  const powerMutation = useMutation({
    mutationFn: ({ id, action }: { id: string, action: 'boot' | 'reboot' | 'shutdown' | 'poweroff' }) => 
      api.powerAction(id, action),
    onMutate: ({ id, action }) => {
      setPowerActionPending(action);
      const actionMap: Record<string, string> = { boot: 'start', reboot: 'reboot', shutdown: 'shutdown', poweroff: 'shutdown' };
      markPending(id, actionMap[action] || action);
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
        consoleLock.startLock(action);
      }
      
      // Poll for status updates with stabilization delay
      let completionDetectedAt: number | null = null;
      const pollInterval = setInterval(async () => {
        await queryClient.invalidateQueries({ queryKey: ['server', serverId] });
        const updatedServer = queryClient.getQueryData(['server', serverId]) as any;
        if (updatedServer) {
          const isComplete =
            (action === 'boot' && updatedServer.status === 'running') ||
            ((action === 'shutdown' || action === 'poweroff') && updatedServer.status === 'stopped') ||
            (action === 'reboot' && updatedServer.status === 'running');

          if (isComplete) {
            // Mark when we first detected completion
            if (!completionDetectedAt) {
              completionDetectedAt = Date.now();
            }

            // Wait longer for shutdown/poweroff to ensure server is fully stopped
            // Boot/reboot can be faster (2s), but shutdown needs more time (4s)
            const stabilizationDelay = (action === 'shutdown' || action === 'poweroff') ? 4000 : 2000;

            if (Date.now() - completionDetectedAt >= stabilizationDelay) {
              clearInterval(pollInterval);
              // Refetch status FIRST before clearing pending state
              await queryClient.refetchQueries({ queryKey: ['server', serverId] });
              await queryClient.refetchQueries({ queryKey: ['servers'] });
              // Now clear pending state after fresh data is loaded
              setPowerActionPending(null);
              if (serverId) clearPending(serverId);
            }
          } else {
            // Reset if status changed back (shouldn't happen but just in case)
            completionDetectedAt = null;
          }
        }
      }, 2000);
      // Clear after 60 seconds regardless (reboots can take a while)
      setTimeout(async () => {
        clearInterval(pollInterval);
        // Refetch current status FIRST before clearing pending state
        await queryClient.refetchQueries({ queryKey: ['server', serverId] });
        await queryClient.refetchQueries({ queryKey: ['servers'] });
        // Now clear pending state after status is updated
        setPowerActionPending(null);
        if (serverId) clearPending(serverId);
      }, 60000);
    },
    onError: async (error: any) => {
      // Refetch current status FIRST before clearing pending state
      await queryClient.refetchQueries({ queryKey: ['server', serverId] });
      await queryClient.refetchQueries({ queryKey: ['servers'] });
      // Now clear pending state
      setPowerActionPending(null);
      if (serverId) clearPending(serverId);
      toast({
        title: "Action Failed",
        description: error?.message || "Failed to perform power action. Please try again.",
        variant: "destructive",
      });
    }
  });

  const reinstallMutation = useMutation({
    mutationFn: ({ id, osId, hostname }: { id: string, osId: number, hostname: string }) => 
      api.reinstallServer(id, osId, hostname),
    onSuccess: (response) => {
      // Reset dialog state before closing
      setSelectedOs("");
      setHostname("");
      setHostnameError("");
      setOsSearchQuery("");
      setSelectedCategory("All");
      setReinstallDialogOpen(false);
      
      // Mark as reinstall mode (not initial setup)
      updateSetupMode(false);
      
      // Start the reinstall task polling with the generated password and server IP
      const password = response.data?.generatedPassword;
      reinstallTask.startTask(undefined, password, server?.primaryIp);

      // Start console lock (server will reboot after reinstall)
      consoleLock.startLock('reinstall');
      
      toast({
        title: "Reinstallation Started",
        description: "Server is being reinstalled. This may take a few minutes.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Reinstallation Failed",
        description: error?.message || "Failed to start reinstallation. Please try again.",
        variant: "destructive",
      });
    }
  });
  
  // Setup mutation for initial OS installation (same endpoint as reinstall)
  const setupMutation = useMutation({
    mutationFn: ({ id, osId, hostname }: { id: string, osId: number, hostname: string }) => 
      api.reinstallServer(id, osId, hostname),
    onSuccess: (response) => {
      // Reset setup wizard state
      setSetupSelectedOs("");
      setSetupHostname("");
      setSetupHostnameError("");
      setSetupOsSearchQuery("");
      setSetupExpandedGroups([]);
      
      // Mark as setup mode (initial setup, not reinstall)
      updateSetupMode(true);
      
      // Start the reinstall task polling with the generated password and server IP
      const password = response.data?.generatedPassword;
      reinstallTask.startTask(undefined, password, server?.primaryIp);
      
      // Refetch server data to update the UI
      queryClient.invalidateQueries({ queryKey: ['server', serverId] });
      
      toast({
        title: "Setup Started",
        description: "Your server is being configured. This may take a few minutes.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Setup Failed",
        description: error?.message || "Failed to start server setup. Please try again.",
        variant: "destructive",
      });
    }
  });
  
  // Password reset mutation
  const passwordResetMutation = useMutation({
    mutationFn: (id: string) => api.resetServerPassword(id),
    onSuccess: (response) => {
      if (response.password) {
        setNewPassword(response.password);
        setPasswordCopied(false);
        toast({
          title: "Password Reset Successful",
          description: "Your new server password has been generated. Please save it now.",
        });
      }
    },
    onError: (error: any) => {
      setPasswordResetDialogOpen(false);
      toast({
        title: "Password Reset Failed",
        description: error.message || "Failed to reset server password. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Cancellation mutations
  const requestCancellationMutation = useMutation({
    mutationFn: ({ id, reason, mode }: { id: string, reason?: string, mode: 'grace' | 'immediate' }) =>
      api.requestCancellation(id, reason, mode),
    onSuccess: (_, variables) => {
      setCancellationReason("");
      setImmediateConfirmOpen(false);
      setImmediateConfirmText("");
      refetchCancellation();
      toast({
        title: variables.mode === 'immediate' ? "Immediate Deletion Scheduled" : "Cancellation Requested",
        description: variables.mode === 'immediate' 
          ? "Your server will be permanently deleted within 5 minutes. This cannot be undone."
          : "Your server will be deleted in 30 days. You can revoke this at any time.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Cancellation Failed",
        description: error.message || "Failed to request cancellation. Please try again.",
        variant: "destructive",
      });
    }
  });
  
  const revokeCancellationMutation = useMutation({
    mutationFn: (id: string) => api.revokeCancellation(id),
    onSuccess: () => {
      refetchCancellation();
      toast({
        title: "Cancellation Revoked",
        description: "Your server cancellation has been revoked. Your server will remain active.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Revoke Failed",
        description: error.message || "Failed to revoke cancellation. Please try again.",
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
    if (trimmed.length > 253) return 'Hostname must be 253 characters or less';
    const labels = trimmed.split('.');
    for (const label of labels) {
      if (label.length === 0) return 'Hostname cannot have empty labels (consecutive dots)';
      if (label.length > 63) return 'Each part of the hostname must be 63 characters or less';
      if (label.length === 1 && !/^[a-z0-9]$/.test(label)) {
        return 'Single character parts must be a letter or number';
      }
      if (label.length > 1 && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label)) {
        if (label.startsWith('-') || label.endsWith('-')) {
          return 'Hostname parts cannot start or end with a hyphen';
        }
        return 'Hostname can only contain lowercase letters, numbers, hyphens, and dots';
      }
    }
    return '';
  };

  const handleHostnameChange = (value: string) => {
    const normalizedValue = value.toLowerCase().trim();
    setHostname(normalizedValue);
    if (normalizedValue) {
      setHostnameError(validateHostname(normalizedValue));
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
      hostname: normalizedHostname
    });
  };

  // Setup wizard handlers
  const handleSetupHostnameChange = (value: string) => {
    const normalizedValue = value.toLowerCase().trim();
    setSetupHostname(normalizedValue);
    if (normalizedValue) {
      setSetupHostnameError(validateHostname(normalizedValue));
    } else {
      setSetupHostnameError('');
    }
  };
  
  const isSetupHostnameValid = setupHostname.trim() && !validateHostname(setupHostname);
  
  // Parse setup templates into flat list with categories
  const setupAllTemplates = useMemo(() => {
    const templates: OsTemplateType[] = [];
    const seenUuids = new Set<string>();
    
    if (setupTemplates && Array.isArray(setupTemplates)) {
      setupTemplates.forEach((group: any) => {
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
  }, [setupTemplates]);
  
  // Group templates by category for accordion display
  const setupGroupedTemplates = useMemo(() => {
    const groups: Record<string, OsTemplateType[]> = {};
    
    setupAllTemplates.forEach(t => {
      // Filter by search query
      const matchesSearch = !setupOsSearchQuery || 
        t.name.toLowerCase().includes(setupOsSearchQuery.toLowerCase()) ||
        (t.distro || '').toLowerCase().includes(setupOsSearchQuery.toLowerCase()) ||
        (t.version || '').toLowerCase().includes(setupOsSearchQuery.toLowerCase());
      
      if (!matchesSearch) return;
      
      const category = getOsCategory(t);
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(t);
    });
    
    // Sort categories and templates within each category
    const sortedGroups: { category: string; templates: OsTemplateType[] }[] = [];
    const categoryOrder = ['Debian-based', 'RHEL-based', 'SUSE', 'Other'];
    const addedCategories = new Set<string>();
    
    // Add categories in preferred order first
    categoryOrder.forEach(cat => {
      if (groups[cat] && groups[cat].length > 0) {
        groups[cat].sort((a, b) => a.name.localeCompare(b.name));
        sortedGroups.push({ category: cat, templates: groups[cat] });
        addedCategories.add(cat);
      }
    });
    
    // Add any remaining categories not in the preferred order
    Object.keys(groups).forEach(cat => {
      if (!addedCategories.has(cat) && groups[cat].length > 0) {
        groups[cat].sort((a, b) => a.name.localeCompare(b.name));
        sortedGroups.push({ category: cat, templates: groups[cat] });
      }
    });
    
    return sortedGroups;
  }, [setupAllTemplates, setupOsSearchQuery]);
  
  const handleSetup = () => {
    if (!serverId || !setupSelectedOs) return;
    
    // Validate hostname
    const normalizedHostname = setupHostname.trim().toLowerCase();
    const hostnameValidation = validateHostname(setupHostname);
    if (hostnameValidation) {
      setSetupHostnameError(hostnameValidation);
      return;
    }
    
    // Verify selected template is in the allowed list
    const selectedTemplate = setupAllTemplates.find(t => t.id === setupSelectedOs);
    if (!selectedTemplate) {
      toast({
        title: "Invalid Selection",
        description: "Please select an available OS template.",
        variant: "destructive",
      });
      return;
    }
    
    setupMutation.mutate({ 
      id: serverId, 
      osId: parseInt(setupSelectedOs),
      hostname: normalizedHostname
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
        (t.version || '').toLowerCase().includes(osSearchQuery.toLowerCase()) ||
        (t.variant || '').toLowerCase().includes(osSearchQuery.toLowerCase()) ||
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
              <Button variant="outline" className="mt-4 border-border text-foreground">Return to Fleet</Button>
            </Link>
          </div>
      </AppShell>
    );
  }

  const isSuspended = server?.suspended === true;
  const needsSetup = server?.needsSetup === true;
  
  // Check if initial setup is in progress (blocks server usage until complete)
  // reinstallTask now hydrates from backend on mount, so isActive is authoritative
  // isSetupMode distinguishes initial setup from reinstall (for UI purposes)
  const isSettingUp = reinstallTask.isActive && (needsSetup || isSetupMode);
  
  // Also block server usage during ANY active build task (setup or reinstall)
  // This ensures cross-session protection even without sessionStorage

  // If server needs setup, show the setup wizard
  if (needsSetup && !reinstallTask.isActive) {
    return (
      <AppShell>
        <div className="py-6 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <Link href="/servers">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted/50" data-testid="button-back-setup">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">{server.name && !/^Server\s+\d+$/i.test(server.name.trim()) ? server.name : 'New Server'}</h1>
              <p className="text-sm text-muted-foreground">Complete setup to start using your server</p>
            </div>
          </div>
          
          {/* Setup Wizard Card */}
          <div className="glass-card rounded-xl border border-border overflow-hidden">
            <div className="bg-gradient-to-r from-primary/20 to-blue-500/20 p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-primary/20">
                  <Settings className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-display font-semibold text-foreground">Setup Your Server</h2>
                  <p className="text-sm text-muted-foreground">Choose an operating system and set your hostname</p>
                </div>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Server Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg bg-muted/50 border border-border">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Plan</p>
                  <p className="text-sm font-medium text-foreground">{server.plan.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Location</p>
                  <p className="text-sm font-medium text-foreground">{server.location.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">IP Address</p>
                  <p className="text-sm font-mono text-foreground">{server.primaryIp}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p>
                  <p className="text-sm font-medium text-yellow-400">Awaiting Setup</p>
                </div>
              </div>
              
              {/* Hostname Input */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">Hostname</Label>
                <Input
                  placeholder="e.g. web-server-1"
                  value={setupHostname}
                  onChange={(e) => handleSetupHostnameChange(e.target.value)}
                  className={cn(
                    "bg-card/30 border-border text-foreground placeholder:text-muted-foreground focus:border-primary",
                    setupHostnameError && "border-red-500 focus:border-red-500"
                  )}
                  data-testid="input-setup-hostname"
                />
                {setupHostnameError && (
                  <p className="text-xs text-red-400">{setupHostnameError}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Enter a hostname (e.g., server01) or full domain (e.g., server01.example.com)
                </p>
              </div>
              
              {/* OS Selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-foreground">Operating System</Label>
                  <div className="relative w-48">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search OS..."
                      value={setupOsSearchQuery}
                      onChange={(e) => setSetupOsSearchQuery(e.target.value)}
                      className="pl-9 h-8 bg-card/30 border-border text-foreground text-sm"
                      data-testid="input-setup-search"
                    />
                  </div>
                </div>
                
                {/* OS Grid */}
                {loadingSetupTemplates ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : setupGroupedTemplates.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No operating systems found
                  </div>
                ) : (
                  <div className="space-y-6">
                    {setupGroupedTemplates.map(({ category, templates }) => (
                      <div key={category}>
                        <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                          {category}
                          <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                            {templates.length}
                          </span>
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                          {templates.map(template => {
                            const templateId = String(template.id);
                            const isSelected = setupSelectedOs === templateId;
                            const displayName = template.version && !template.name.includes(template.version)
                              ? `${template.name} ${template.version}`
                              : template.name;
                            
                            return (
                              <button
                                key={templateId}
                                onClick={() => setSetupSelectedOs(templateId)}
                                className={cn(
                                  "flex flex-col items-center p-4 rounded-xl border transition-all text-center",
                                  isSelected
                                    ? "bg-primary/15 border-primary ring-1 ring-primary/50"
                                    : "bg-muted/20 border-border hover:bg-muted/30 hover:border-border"
                                )}
                                data-testid={`button-setup-os-${templateId}`}
                              >
                                <img
                                  src={getOsLogoUrl({ id: template.id, name: template.name, distro: template.distro })}
                                  alt={template.name}
                                  className="h-10 w-10 object-contain mb-2"
                                  onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_LOGO; }}
                                />
                                <span className="text-sm font-medium text-foreground leading-tight">
                                  {displayName}
                                </span>
                                {isSelected && (
                                  <div className="mt-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                                    <Check className="h-3 w-3 text-foreground" />
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Setup Button */}
              <Button
                className="w-full bg-primary hover:bg-primary/90 text-foreground font-medium py-3 h-12"
                onClick={handleSetup}
                disabled={!setupSelectedOs || !isSetupHostnameValid || setupMutation.isPending}
                data-testid="button-start-setup"
              >
                {setupMutation.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Starting Setup...
                  </>
                ) : (
                  <>
                    <Rocket className="h-5 w-5 mr-2" />
                    Setup Server
                  </>
                )}
              </Button>
              
              {!isSetupHostnameValid && setupHostname.trim() === '' && (
                <p className="text-xs text-muted-foreground text-center">
                  Enter a hostname to continue
                </p>
              )}
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // If server has immediate mode cancellation OR is in processing status (VirtFusion deleting), show locked deletion state
  const activeCancellation = cancellationData?.cancellation;
  const isBeingDeleted = activeCancellation && 
    (activeCancellation.mode === 'immediate' || activeCancellation.status === 'processing');
  
  if (isBeingDeleted && activeCancellation) {
    const scheduledAt = new Date(activeCancellation.scheduledDeletionAt);
    const now = new Date();
    const timeRemaining = Math.max(0, scheduledAt.getTime() - now.getTime());
    const minutesRemaining = Math.ceil(timeRemaining / (1000 * 60));
    const isProcessing = activeCancellation.status === 'processing';
    
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-20 h-[70vh]">
          <div className="max-w-md mx-auto text-center space-y-6">
            {/* Animated deletion icon */}
            <div className="relative mx-auto w-24 h-24">
              <div className="absolute inset-0 rounded-full bg-red-500/20 animate-ping" style={{ animationDuration: '2s' }} />
              <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-red-500/30 border-2 border-red-500/50">
                <Trash2 className="h-10 w-10 text-red-400" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-display font-bold text-foreground">
                {isProcessing ? 'Server Deletion In Progress' : 'Server Queued for Deletion'}
              </h2>
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">{server.name}</span> {isProcessing ? 'is being permanently deleted.' : 'will be permanently deleted shortly.'}
              </p>
            </div>
            
            {/* Status indicator */}
            <div className="glass-card rounded-xl border border-red-500/30 p-6 bg-red-500/10">
              {isProcessing ? (
                <>
                  <div className="flex items-center justify-center gap-3 mb-3">
                    <Loader2 className="h-5 w-5 text-red-400 animate-spin" />
                    <span className="text-red-400 font-medium">Actively deleting...</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Your server has been submitted for deletion and is now being removed from our systems.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-center gap-3 mb-3">
                    <Clock className="h-5 w-5 text-orange-400" />
                    <span className="text-orange-400 font-medium">Queued for deletion</span>
                  </div>
                  {timeRemaining > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Deletion will begin in approximately {minutesRemaining} minute{minutesRemaining !== 1 ? 's' : ''}. Once started, the server will be fully removed within a few minutes.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Deletion is about to begin. The server will be fully removed within a few minutes.
                    </p>
                  )}
                </>
              )}
            </div>
            
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>This action cannot be stopped or reversed.</p>
              <p>All data on this server will be permanently destroyed.</p>
            </div>
            
            <Link href="/servers">
              <Button variant="outline" className="mt-4 border-border text-foreground hover:bg-muted/50">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Return to Fleet
              </Button>
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6 pb-20">
        
        {/* Building Banner - Shown when setup is minimized (but not when complete) */}
        {reinstallTask.isActive && isSetupMode && setupMinimized && reinstallTask.status !== 'complete' && (
          <div 
            className="bg-blue-500/20 border border-blue-500/50 rounded-lg p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-blue-500/30 transition-colors" 
            data-testid="banner-building"
            onClick={() => updateSetupMinimized(false)}
          >
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 text-blue-400 animate-spin flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-blue-300">Server Building</h3>
                <p className="text-sm text-blue-300/80">
                  Your server is being set up. Click to view progress. ({reinstallTask.percent}% complete)
                </p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="border-blue-400/50 text-blue-300 hover:bg-blue-500/20"
              onClick={(e) => {
                e.stopPropagation();
                updateSetupMinimized(false);
              }}
            >
              View Progress
            </Button>
          </div>
        )}
        
        {/* Saved Credentials Banner - Shows after build completes and setup dialog closes */}
        {showSavedCredentials && savedCredentials && (!reinstallTask.isActive || reinstallTask.status === 'complete') && (
          <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4" data-testid="banner-credentials">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-green-400 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-green-300">SSH Login Credentials</h3>
                  <p className="text-sm text-green-300/80">
                    Save these credentials - they won't be shown again
                  </p>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="icon"
                className="h-8 w-8 text-green-400 hover:bg-green-500/20"
                onClick={() => {
                  setShowSavedCredentials(false);
                  updateSavedCredentials(null);
                }}
                data-testid="button-close-credentials"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="bg-card/30 rounded-lg px-3 py-2 flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground block">Server IP</span>
                  <span className="font-mono text-green-300">{savedCredentials.serverIp}</span>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 text-green-400 hover:bg-green-500/20"
                  onClick={() => {
                    navigator.clipboard.writeText(savedCredentials.serverIp);
                    toast({ title: "Copied", description: "Server IP copied to clipboard" });
                  }}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <div className="bg-card/30 rounded-lg px-3 py-2 flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground block">Username</span>
                  <span className="font-mono text-green-300">{savedCredentials.username}</span>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 text-green-400 hover:bg-green-500/20"
                  onClick={() => {
                    navigator.clipboard.writeText(savedCredentials.username);
                    toast({ title: "Copied", description: "Username copied to clipboard" });
                  }}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <div className="bg-card/30 rounded-lg px-3 py-2 flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground block">Password</span>
                  <span className="font-mono text-green-300">
                    {showCredentialsPassword ? savedCredentials.password : '••••••••••••'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-green-400 hover:bg-green-500/20"
                    onClick={() => setShowCredentialsPassword(!showCredentialsPassword)}
                    data-testid="button-toggle-password-visibility"
                  >
                    {showCredentialsPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-green-400 hover:bg-green-500/20"
                    onClick={() => {
                      navigator.clipboard.writeText(savedCredentials.password);
                      toast({ title: "Copied", description: "Password copied to clipboard" });
                      // Dismiss the credentials banner after copying password
                      setShowSavedCredentials(false);
                      updateSavedCredentials(null);
                    }}
                    data-testid="button-copy-password"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
        
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
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 pb-6 border-b border-border">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
               <Link href="/servers">
                <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2 text-muted-foreground hover:text-foreground hover:bg-muted/50" data-testid="button-back">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="h-8 w-48 bg-card/30 border-border text-foreground font-display font-bold text-lg"
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
                    className="h-7 w-7 text-muted-foreground hover:bg-muted"
                    onClick={handleCancelEditName}
                    disabled={isRenamingServer}
                    data-testid="button-cancel-name"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 
                    className={cn(
                      "text-2xl font-display font-bold text-foreground tracking-tight",
                      !isSuspended && "cursor-pointer hover:text-foreground/80 transition-colors"
                    )}
                    onClick={!isSuspended ? handleStartEditName : undefined}
                    data-testid="text-server-name"
                    title={!isSuspended ? "Click to rename" : undefined}
                  >
                    {server.name}
                  </h1>
                  {cancellationData?.cancellation && (
                    <span className="text-[10px] uppercase font-bold px-2 py-1 rounded border bg-orange-500/20 border-orange-500/30 text-orange-400 flex items-center gap-1" data-testid="badge-pending-cancellation">
                      <Calendar className="h-3 w-3" />
                      PENDING CANCELLATION
                    </span>
                  )}
                </div>
              )}
              {(powerActionPending || isTransitioning || consoleLock.isLocked) ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-orange-400" />
                  <span className="text-xs text-orange-400 font-medium">
                    {consoleLock.isLocked && consoleLock.action === 'boot' ? 'Starting...' :
                     consoleLock.isLocked && consoleLock.action === 'reboot' ? 'Rebooting...' :
                     consoleLock.isLocked && consoleLock.action === 'reinstall' ? 'Rebooting...' :
                     consoleLock.isLocked ? 'Rebooting...' :
                     displayStatus === 'starting' ? 'Starting...' :
                     displayStatus === 'rebooting' ? 'Rebooting...' :
                     displayStatus === 'stopping' ? 'Stopping...' :
                     powerActionPending === 'boot' ? 'Starting...' :
                     powerActionPending === 'reboot' ? 'Rebooting...' :
                     powerActionPending === 'poweroff' ? 'Stopping...' :
                     'Processing...'}
                  </span>
                </div>
              ) : (
                <div className={cn(
                  "h-2.5 w-2.5 rounded-full shadow-[0_0_8px]",
                  displayStatus === 'running' ? "bg-green-500 shadow-green-500/50" : 
                  displayStatus === 'stopped' ? "bg-red-500 shadow-red-500/50" :
                  "bg-yellow-500 shadow-yellow-500/50"
                )} data-testid="status-indicator" />
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground font-medium">
              <div className="flex items-center gap-2">
                <div className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono text-foreground border border-border">IP</div>
                <span className="text-foreground font-mono" data-testid="text-primary-ip">{server.primaryIp}</span>
                <button 
                  onClick={() => copyToClipboard(server.primaryIp)} 
                  className="text-muted-foreground hover:text-foreground"
                  data-testid="button-copy-ip"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <img src={flagAU} alt="Australia" className="h-4 w-6 object-cover rounded-sm shadow-sm" />
                <span className="text-foreground">{server.location.name}</span>
              </div>
              {server.image && (
                <div className="flex items-center gap-2">
                  <img
                    src={getOsLogoUrl({ id: server.image.id, name: server.image.name, distro: server.image.distro })}
                    alt={server.image.name}
                    className="h-4 w-4 object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_LOGO; }}
                  />
                  <span className="text-foreground">{server.image.name}</span>
                </div>
              )}
              {server.billing?.nextBillAt && (
                <div className="flex items-center gap-2">
                  <div className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono text-foreground border border-border">NEXT BILL</div>
                  <span className="text-foreground">
                    {new Date(server.billing.nextBillAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button 
              variant="secondary" 
              className={cn(
                "shadow-none font-medium h-9",
                (powerActionPending || server.status !== 'running' || isSuspended || reinstallTask.isActive)
                  ? "bg-muted/50 text-muted-foreground border-border cursor-not-allowed" 
                  : "bg-muted/50 hover:bg-muted text-foreground border-border"
              )}
              onClick={handleOpenVnc}
              disabled={!!powerActionPending || server.status !== 'running' || isSuspended || consoleLock.isLocked || reinstallTask.isActive}
              data-testid="button-console"
            >
              {reinstallTask.isActive ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin text-muted-foreground" />
                  {isSettingUp ? "Setting up..." : "Building..."}
                </>
              ) : consoleLock.isLocked ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin text-muted-foreground" />
                  {consoleLock.action === 'boot' ? 'Starting...' :
                   consoleLock.action === 'reinstall' ? 'Rebuilding...' : 'Restarting...'}
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
                    (isSuspended || consoleLock.isLocked || reinstallTask.isActive)
                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)]"
                  )}
                  data-testid="button-power-options"
                  disabled={!!powerActionPending || isSuspended || consoleLock.isLocked || reinstallTask.isActive}
                >
                  {(powerActionPending || consoleLock.isLocked || reinstallTask.isActive) ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Power className="h-4 w-4 mr-2" />
                  )}
                  {reinstallTask.isActive ? (isSettingUp ? "Setting up..." : "Building...") :
                   consoleLock.isLocked && consoleLock.action === 'boot' ? "Starting..." :
                   consoleLock.isLocked && consoleLock.action === 'reinstall' ? "Rebuilding..." :
                   consoleLock.isLocked ? "Restarting..." : "Power Options"}
                  {!consoleLock.isLocked && !reinstallTask.isActive && <ChevronDown className="h-3 w-3 ml-2 opacity-70" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-background/95 backdrop-blur-xl border-border text-foreground">
                 <DropdownMenuItem 
                    className="focus:bg-muted cursor-pointer text-green-400 focus:text-green-400"
                    disabled={displayStatus === 'running' || isTransitioning || !!powerActionPending || isSuspended || reinstallTask.isActive}
                    onClick={() => handlePowerAction('boot')}
                    data-testid="menu-item-start"
                  >
                   <Power className="h-4 w-4 mr-2" /> Start Server
                 </DropdownMenuItem>
                 <DropdownMenuItem 
                    className="focus:bg-muted cursor-pointer text-yellow-400 focus:text-yellow-400"
                    disabled={displayStatus !== 'running' || isTransitioning || !!powerActionPending || isSuspended || reinstallTask.isActive}
                    onClick={() => handlePowerAction('reboot')}
                    data-testid="menu-item-reboot"
                  >
                   <RotateCw className="h-4 w-4 mr-2" /> Reboot
                 </DropdownMenuItem>
                 <DropdownMenuItem 
                    className="focus:bg-muted cursor-pointer text-orange-400 focus:text-orange-400"
                    disabled={displayStatus === 'stopped' || isTransitioning || !!powerActionPending || isSuspended || reinstallTask.isActive}
                    onClick={() => handlePowerAction('shutdown')}
                    data-testid="menu-item-shutdown"
                  >
                   <Power className="h-4 w-4 mr-2" /> Shutdown
                 </DropdownMenuItem>
                 <DropdownMenuItem 
                    className="focus:bg-muted cursor-pointer text-red-400 focus:text-red-400"
                    disabled={displayStatus === 'stopped' || isTransitioning || !!powerActionPending || isSuspended || reinstallTask.isActive}
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
          <GlassCard className="p-4 flex items-center gap-4 bg-muted/20 border-border">
             <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center text-foreground/70">
                <Cpu className="h-5 w-5" />
             </div>
             <div>
                <div className="text-sm font-bold text-foreground">{server.plan.specs.vcpu} vCore</div>
                <div className="text-xs text-muted-foreground">CPU Allocated</div>
             </div>
          </GlassCard>
          
          <GlassCard className="p-4 flex items-center gap-4 bg-muted/20 border-border">
             <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center text-foreground/70">
                <Activity className="h-5 w-5" />
             </div>
             <div>
                <div className="text-sm font-bold text-foreground">{server.plan.specs.ram >= 1024 ? (server.plan.specs.ram / 1024).toFixed(0) : server.plan.specs.ram} {server.plan.specs.ram >= 1024 ? 'GB' : 'MB'}</div>
                <div className="text-xs text-muted-foreground">RAM Allocated</div>
             </div>
          </GlassCard>

          <GlassCard className="p-4 flex items-center gap-4 bg-muted/20 border-border">
             <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center text-foreground/70">
                <StorageIcon className="h-5 w-5" />
             </div>
             <div>
                <div className="text-sm font-bold text-foreground">{server.plan.specs.disk} GB</div>
                <div className="text-xs text-muted-foreground">Storage Allocated</div>
             </div>
          </GlassCard>

          <GlassCard className="p-4 flex items-center gap-4 bg-muted/20 border-border">
             <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center text-foreground/70">
                <Network className="h-5 w-5" />
             </div>
             <div>
                <div className="text-sm font-bold text-foreground" data-testid="text-traffic">
                  {server.primaryIp !== 'N/A' ? server.primaryIp : 'No IP'}
                </div>
                <div className="text-xs text-muted-foreground">Primary IP</div>
             </div>
          </GlassCard>
        </div>

        {/* Navigation Tabs */}
        <Tabs defaultValue="statistics" className="space-y-6">
          <div className="border-b border-border">
            <TabsList className="bg-transparent h-auto p-0 gap-6 w-full flex flex-wrap justify-start">
              {["Statistics", "IP Management", "Reset Password", "Reinstallation", "Cancellation"].map(tab => (
                 <TabsTrigger 
                    key={tab} 
                    value={tab.toLowerCase().replace(' ', '-')}
                    className="bg-transparent border-b-2 border-transparent rounded-none px-1 py-3 text-muted-foreground data-[state=active]:border-blue-500 data-[state=active]:text-blue-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-all hover:text-foreground"
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
                  {server.status === 'running' && !powerActionPending && !consoleLock.isLocked ? (
                    <span className="text-lg font-bold text-foreground" data-testid="text-cpu-percent">
                      {liveStats ? `${liveStats.cpu_usage.toFixed(1)}%` : '—'}
                    </span>
                  ) : consoleLock.isLocked ? (
                    <span className="text-lg font-bold text-muted-foreground">—</span>
                  ) : (
                    <span className="text-xs text-orange-400 flex items-center gap-1.5">
                      {(powerActionPending || server.status !== 'stopped') && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                      {powerActionPending === 'boot' ? 'Starting...' : 
                       powerActionPending ? 'Please wait...' :
                       server.status === 'stopped' ? 'Offline' : 'Loading...'}
                    </span>
                  )}
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div 
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-500",
                      server.status === 'running' && !powerActionPending && !consoleLock.isLocked ? "bg-blue-500" : "bg-muted/30"
                    )}
                    style={{ width: server.status === 'running' && !powerActionPending && !consoleLock.isLocked ? `${liveStats?.cpu_usage || 0}%` : '0%' }}
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
                  {server.status === 'running' && !powerActionPending && !consoleLock.isLocked ? (
                    <span className="text-lg font-bold text-foreground" data-testid="text-memory-percent">
                      {liveStats ? `${liveStats.ram_usage.toFixed(1)}%` : '—'}
                    </span>
                  ) : consoleLock.isLocked ? (
                    <span className="text-lg font-bold text-muted-foreground">—</span>
                  ) : (
                    <span className="text-xs text-orange-400 flex items-center gap-1.5">
                      {(powerActionPending || server.status !== 'stopped') && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                      {powerActionPending === 'boot' ? 'Starting...' : 
                       powerActionPending ? 'Please wait...' :
                       server.status === 'stopped' ? 'Offline' : 'Loading...'}
                    </span>
                  )}
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div 
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-500",
                      server.status === 'running' && !powerActionPending && !consoleLock.isLocked ? "bg-green-500" : "bg-muted/30"
                    )}
                    style={{ width: server.status === 'running' && !powerActionPending && !consoleLock.isLocked ? `${liveStats?.ram_usage || 0}%` : '0%' }}
                    data-testid="progress-memory"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
                  <span data-testid="text-memory-used">
                    {server.status === 'running' && !powerActionPending && !consoleLock.isLocked && liveStats?.memory_used_mb 
                      ? `${liveStats.memory_used_mb} MB / ${liveStats.memory_total_mb} MB` 
                      : '—'}
                  </span>
                </div>
              </GlassCard>

              {/* Disk Card */}
              <GlassCard className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Disk</h3>
                  {server.status === 'running' && !powerActionPending && !consoleLock.isLocked ? (
                    <span className="text-lg font-bold text-foreground" data-testid="text-disk-percent">
                      {liveStats ? `${liveStats.disk_usage.toFixed(1)}%` : '—'}
                    </span>
                  ) : consoleLock.isLocked ? (
                    <span className="text-lg font-bold text-muted-foreground">—</span>
                  ) : (
                    <span className="text-xs text-orange-400 flex items-center gap-1.5">
                      {(powerActionPending || server.status !== 'stopped') && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                      {powerActionPending === 'boot' ? 'Starting...' : 
                       powerActionPending ? 'Please wait...' :
                       server.status === 'stopped' ? 'Offline' : 'Loading...'}
                    </span>
                  )}
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div 
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-500",
                      server.status === 'running' && !powerActionPending && !consoleLock.isLocked ? "bg-blue-500" : "bg-muted/30"
                    )}
                    style={{ width: server.status === 'running' && !powerActionPending && !consoleLock.isLocked ? `${liveStats?.disk_usage || 0}%` : '0%' }}
                    data-testid="progress-disk"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
                  <span data-testid="text-disk-used">
                    {server.status === 'running' && !powerActionPending && !consoleLock.isLocked && liveStats?.disk_used_gb 
                      ? `${liveStats.disk_used_gb} GB / ${liveStats.disk_total_gb} GB` 
                      : '—'}
                  </span>
                </div>
              </GlassCard>
            </div>

            {/* Bandwidth Stats Card - Compact */}
            <GlassCard className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-foreground uppercase tracking-wider flex items-center gap-2">
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
                  if (gb >= 1000) {
                    const tb = gb / 1024;
                    return `${tb.toFixed(2)} TB`;
                  }
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
                    {/* Bandwidth Exceeded Warning */}
                    {usagePercent >= 100 && (
                      <div className="rounded-md bg-destructive/10 border border-destructive/20 p-2">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-xs text-foreground font-semibold">Bandwidth Limit Exceeded</p>
                            <p className="text-[10px] text-muted-foreground">Bandwidth has been shaped to 1Mbps Download and 1Mbps Upload.</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {usagePercent >= 80 && usagePercent < 100 && (
                      <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-2">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-xs text-foreground font-semibold">Approaching Bandwidth Limit</p>
                            <p className="text-[10px] text-muted-foreground">{usagePercent.toFixed(1)}% of allowance used</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Compact Usage Display */}
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-foreground whitespace-nowrap" data-testid="text-bandwidth-used">
                        {usedDisplay} <span className="text-muted-foreground font-normal">/ {limitGB > 0 ? (limitGB >= 1000 ? `${(limitGB / 1024).toFixed(2)} TB` : `${limitGB} GB`) : '∞'}</span>
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
                    <div className="w-full bg-muted rounded-full h-2">
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
                      <div className="p-1.5 bg-muted/50 rounded border border-border">
                        <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                          <ArrowDownToLine className="h-2.5 w-2.5 text-green-400" />IN
                        </div>
                        <div className="text-xs font-semibold text-foreground" data-testid="text-bandwidth-rx">{rxDisplay}</div>
                      </div>
                      <div className="p-1.5 bg-muted/50 rounded border border-border">
                        <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                          <ArrowUpFromLine className="h-2.5 w-2.5 text-blue-400" />OUT
                        </div>
                        <div className="text-xs font-semibold text-foreground" data-testid="text-bandwidth-tx">{txDisplay}</div>
                      </div>
                      <div className="p-1.5 bg-muted/50 rounded border border-border">
                        <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                          <Gauge className="h-2.5 w-2.5 text-blue-400" />PORT
                        </div>
                        <div className="text-xs font-semibold text-foreground" data-testid="text-port-speed">{network?.portSpeed || 500}M</div>
                      </div>
                      <div className="p-1.5 bg-muted/50 rounded border border-border">
                        <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                          <Network className="h-2.5 w-2.5 text-cyan-400" />%
                        </div>
                        <div className="text-xs font-semibold text-foreground" data-testid="text-bandwidth-percent">{usagePercent.toFixed(1)}%</div>
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
              <div className="mb-6">
                <h3 className="text-lg font-bold text-foreground">Network Interfaces</h3>
              </div>
              
              {networkInfo?.interfaces && networkInfo.interfaces.length > 0 ? (
                <div className="space-y-4">
                  {networkInfo.interfaces.map((iface, index) => (
                    <div key={index} className="p-4 bg-muted/50 rounded-lg border border-border">
                      <div className="flex items-center gap-3 mb-4">
                        <Network className="h-5 w-5 text-blue-400" />
                        <span className="font-mono font-bold text-foreground">{iface.name}</span>
                        <span className="text-xs text-muted-foreground">MAC: {iface.mac}</span>
                      </div>
                      
                      {iface.ipv4.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">IPv4 Addresses</div>
                          {iface.ipv4.map((ip, ipIndex) => (
                            <div key={ipIndex} className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-foreground" data-testid={`text-ip-${index}-${ipIndex}`}>{ip.address}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Gateway: {ip.gateway}</span>
                                <button 
                                  onClick={() => copyToClipboard(ip.address)}
                                  className="text-muted-foreground hover:text-foreground p-1"
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
                            <div key={ipIndex} className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                              <span className="font-mono text-foreground text-sm">{ip.address}</span>
                              <button 
                                onClick={() => copyToClipboard(ip.address)}
                                className="text-muted-foreground hover:text-foreground p-1"
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

          {/* Reset Password Tab */}
          <TabsContent value="reset-password" className="space-y-4 animate-in fade-in duration-300">
            <GlassCard className="p-6">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-foreground mb-2">Reset Server Password</h3>
                  <p className="text-sm text-muted-foreground">
                    Generate a new root/administrator password for your server. The new password will be displayed 
                    once and must be saved immediately.
                  </p>
                </div>
                
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-400 mt-0.5" />
                    <div>
                      <div className="font-medium text-amber-400">Important Information</div>
                      <div className="text-sm text-amber-400/80">
                        The new password will only be shown once. Make sure to copy and save it in a secure location 
                        before closing the dialog.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <Button 
                    className={cn(
                      "text-foreground",
                      (isSuspended || cancellationData?.cancellation)
                        ? "bg-muted text-muted-foreground cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700"
                    )}
                    onClick={() => setPasswordResetDialogOpen(true)}
                    disabled={isSuspended || !!cancellationData?.cancellation}
                    data-testid="button-reset-password"
                  >
                    <Key className="h-4 w-4 mr-2" />
                    Reset Password
                  </Button>
                  {isSuspended && (
                    <p className="text-sm text-yellow-400/80 mt-2">
                      Password reset is disabled while the server is suspended.
                    </p>
                  )}
                  {cancellationData?.cancellation && !isSuspended && (
                    <p className="text-sm text-red-400/80 mt-2">
                      Password reset is disabled because this server is scheduled for deletion.
                    </p>
                  )}
                </div>
              </div>
            </GlassCard>
          </TabsContent>

          {/* Reinstallation Tab */}
          <TabsContent value="reinstallation" className="space-y-4 animate-in fade-in duration-300">
            <GlassCard className="p-6">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-foreground mb-2">Reinstall Operating System</h3>
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
                    <label className="text-sm font-medium text-foreground mb-2 block">Current Operating System</label>
                    <div className="p-3 bg-muted/50 rounded-md border border-border">
                      <span className="text-foreground">{server.image?.name || 'Unknown'}</span>
                    </div>
                  </div>

                  <Button 
                    className={cn(
                      "text-foreground",
                      (isSuspended || cancellationData?.cancellation)
                        ? "bg-muted text-muted-foreground cursor-not-allowed"
                        : "bg-red-600 hover:bg-red-700"
                    )}
                    onClick={() => setReinstallDialogOpen(true)}
                    disabled={isSuspended || !!cancellationData?.cancellation}
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
                  {cancellationData?.cancellation && !isSuspended && (
                    <p className="text-sm text-red-400/80 mt-2">
                      Reinstall is disabled because this server is scheduled for deletion.
                    </p>
                  )}
                </div>
              </div>
            </GlassCard>
          </TabsContent>

          {/* Cancellation Tab */}
          <TabsContent value="cancellation" className="space-y-4 animate-in fade-in duration-300">
            <GlassCard className="p-6">
              <div className="space-y-6">
                {cancellationData?.cancellation ? (
                  // Show existing cancellation request
                  <>
                    <div className="flex items-start gap-4">
                      <div className={cn("p-3 rounded-lg", cancellationData.cancellation.mode === 'immediate' ? "bg-red-500/20" : "bg-orange-500/20")}>
                        {cancellationData.cancellation.mode === 'immediate' ? (
                          <Trash2 className="h-6 w-6 text-red-400" />
                        ) : (
                          <Calendar className="h-6 w-6 text-orange-400" />
                        )}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-foreground mb-1">
                          {cancellationData.cancellation.mode === 'immediate' ? 'Immediate Deletion in Progress' : 'Cancellation Scheduled'}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {cancellationData.cancellation.mode === 'immediate' ? (
                            <>This server will be permanently deleted within 5 minutes.</>
                          ) : (
                            <>
                              This server is scheduled for deletion on{' '}
                              <span className="text-orange-400 font-medium">
                                {new Date(cancellationData.cancellation.scheduledDeletionAt).toLocaleDateString('en-AU', {
                                  weekday: 'long',
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric'
                                })}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    
                    {cancellationData.cancellation.mode === 'immediate' ? (
                      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5" />
                          <div>
                            <div className="font-medium text-red-400">Cannot Be Revoked</div>
                            <div className="text-sm text-red-400/80">
                              Immediate deletion cannot be stopped. Your server and all data will be permanently destroyed.
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="h-5 w-5 text-yellow-400 mt-0.5" />
                          <div>
                            <div className="font-medium text-yellow-400">Days Remaining</div>
                            <div className="text-sm text-yellow-400/80">
                              {Math.max(0, Math.ceil((new Date(cancellationData.cancellation.scheduledDeletionAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} days until deletion
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {cancellationData.cancellation.reason && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground block mb-2">Reason for Cancellation</label>
                        <div className="p-3 bg-muted/50 rounded-md border border-border">
                          <span className="text-foreground text-sm">{cancellationData.cancellation.reason}</span>
                        </div>
                      </div>
                    )}
                    
                    {/* Only show revoke option for grace period cancellations */}
                    {cancellationData.cancellation.mode !== 'immediate' && (
                      <div className="pt-4 border-t border-border">
                        <p className="text-sm text-muted-foreground mb-4">
                          Changed your mind? You can revoke the cancellation request and keep your server.
                        </p>
                        <Button 
                          variant="outline"
                          className="border-green-500/50 text-green-400 hover:bg-green-500/10 hover:text-green-300"
                          onClick={() => serverId && revokeCancellationMutation.mutate(serverId)}
                          disabled={revokeCancellationMutation.isPending}
                          data-testid="button-revoke-cancellation"
                        >
                          {revokeCancellationMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Revoking...
                            </>
                          ) : (
                            <>
                              <XCircle className="h-4 w-4 mr-2" />
                              Revoke Cancellation
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  // Show cancellation options
                  <>
                    <div>
                      <h3 className="text-lg font-bold text-foreground mb-2">Cancel This Server</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Choose how you want to cancel this server. Once cancelled, your data will be permanently deleted.
                      </p>
                    </div>
                    
                    {/* Global Warning */}
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg mb-6">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-bold text-red-400">No Refunds</div>
                          <div className="text-sm text-red-400/80">
                            Cancelling your server does not entitle you to any refunds. All prepaid credit will remain in your wallet for future use.
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Reason Input */}
                    <div className="mb-6">
                      <Label className="text-sm font-medium text-foreground mb-2 block">
                        Reason for Cancellation (Optional)
                      </Label>
                      <Input
                        value={cancellationReason}
                        onChange={(e) => setCancellationReason(e.target.value)}
                        placeholder="e.g., No longer needed, switching providers..."
                        className="bg-muted/50 border-border text-foreground placeholder:text-muted-foreground"
                        data-testid="input-cancellation-reason"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Help us improve by sharing why you're cancelling.
                      </p>
                    </div>
                    
                    {/* Two Options */}
                    <div className="grid gap-4 md:grid-cols-2">
                      {/* Option 1: 30-Day Grace Period */}
                      <div className="p-4 bg-muted/50 border border-border rounded-lg space-y-3">
                        <div className="flex items-center gap-2">
                          <Clock className="h-5 w-5 text-orange-400" />
                          <h4 className="font-semibold text-foreground">30-Day Grace Period</h4>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Your server will remain active for 30 days. You can revoke the cancellation at any time during this period.
                        </p>
                        <div className="p-2 bg-orange-500/10 border border-orange-500/20 rounded text-xs text-orange-400">
                          Server deleted after 30 days. Can be revoked.
                        </div>
                        <Button 
                          className={cn(
                            "w-full text-foreground",
                            isSuspended 
                              ? "bg-muted text-muted-foreground cursor-not-allowed"
                              : "bg-orange-600 hover:bg-orange-700"
                          )}
                          onClick={() => serverId && requestCancellationMutation.mutate({ 
                            id: serverId, 
                            reason: cancellationReason || undefined,
                            mode: 'grace'
                          })}
                          disabled={isSuspended || requestCancellationMutation.isPending}
                          data-testid="button-cancel-grace"
                        >
                          {requestCancellationMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <Clock className="h-4 w-4 mr-2" />
                              Cancel with Grace Period
                            </>
                          )}
                        </Button>
                      </div>

                      {/* Option 2: Delete Immediately */}
                      <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-lg space-y-3">
                        <div className="flex items-center gap-2">
                          <Trash2 className="h-5 w-5 text-red-400" />
                          <h4 className="font-semibold text-foreground">Delete Immediately</h4>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Your server will be permanently deleted within 5 minutes. This action cannot be undone or revoked.
                        </p>
                        <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400 font-medium">
                          WARNING: Cannot be undone. All data will be lost.
                        </div>
                        <Button 
                          variant="outline"
                          className={cn(
                            "w-full",
                            isSuspended 
                              ? "bg-muted text-muted-foreground cursor-not-allowed border-border"
                              : "border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                          )}
                          onClick={() => setImmediateConfirmOpen(true)}
                          disabled={isSuspended || requestCancellationMutation.isPending}
                          data-testid="button-cancel-immediate"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Now
                        </Button>
                      </div>
                    </div>
                    
                    {isSuspended && (
                      <p className="text-sm text-yellow-400/80 mt-4">
                        Contact support to cancel a suspended server.
                      </p>
                    )}
                  </>
                )}
              </div>
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
        }
      }}>
        <DialogContent className="bg-background border-border text-foreground max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="p-6 pb-4 border-b border-border">
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
            <label className="text-sm font-medium text-foreground block mb-2">
              Hostname <span className="text-red-400">*</span>
            </label>
            <Input
              value={hostname}
              onChange={(e) => handleHostnameChange(e.target.value)}
              placeholder="e.g., myserver"
              className={cn(
                "bg-muted/50 border-border text-foreground placeholder:text-muted-foreground",
                hostnameError && "border-red-500/50 focus-visible:ring-red-500"
              )}
              data-testid="input-hostname"
            />
            {hostnameError ? (
              <p className="text-xs text-red-400 mt-1">{hostnameError}</p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Enter a hostname (e.g., server01) or full domain (e.g., server01.example.com)
              </p>
            )}
          </div>
          
          {/* Search and Category Filter */}
          <div className="px-6 pt-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={osSearchQuery}
                onChange={(e) => setOsSearchQuery(e.target.value)}
                placeholder="Search templates..."
                className="pl-10 bg-muted/50 border-border text-foreground placeholder:text-muted-foreground"
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
                      ? "bg-primary text-foreground"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
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
          <div className="border-t border-border p-6">
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

      {/* Immediate Deletion Confirmation Dialog */}
      <Dialog open={immediateConfirmOpen} onOpenChange={(open) => {
        setImmediateConfirmOpen(open);
        if (!open) setImmediateConfirmText("");
      }}>
        <DialogContent className="bg-background border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Confirm Immediate Deletion
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              This action is permanent and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg space-y-2">
              <p className="text-sm text-red-400 font-medium">
                You are about to permanently delete this server:
              </p>
              <p className="text-foreground font-bold">{server?.name || serverId}</p>
              <ul className="text-sm text-red-400/80 space-y-1 mt-3">
                <li>• All data will be permanently destroyed</li>
                <li>• This action cannot be revoked or undone</li>
                <li>• The server will be deleted within 5 minutes</li>
                <li>• No refunds will be provided</li>
              </ul>
            </div>
            
            <div>
              <Label className="text-sm text-foreground mb-2 block">
                Type <span className="font-mono font-bold text-red-400">delete my server</span> to confirm:
              </Label>
              <Input
                value={immediateConfirmText}
                onChange={(e) => setImmediateConfirmText(e.target.value)}
                placeholder="delete my server"
                className="bg-muted/50 border-border text-foreground placeholder:text-muted-foreground font-mono"
                data-testid="input-confirm-delete"
              />
            </div>
          </div>
          
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 border-border"
              onClick={() => {
                setImmediateConfirmOpen(false);
                setImmediateConfirmText("");
              }}
              data-testid="button-cancel-confirm"
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              disabled={immediateConfirmText.toLowerCase() !== 'delete my server' || requestCancellationMutation.isPending}
              onClick={() => serverId && requestCancellationMutation.mutate({
                id: serverId,
                reason: cancellationReason || undefined,
                mode: 'immediate'
              })}
              data-testid="button-confirm-delete"
            >
              {requestCancellationMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Server
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Setup/Reinstall Progress Dialog */}
      <Dialog open={reinstallTask.isActive && !setupMinimized} onOpenChange={() => {}}>
        <DialogContent 
          className={cn(
            "bg-background border-border text-foreground",
            isSetupMode ? "max-w-lg" : "max-w-md"
          )} 
          hideCloseButton
        >
          {isSetupMode ? (
            /* New Setup Progress Checklist */
            <SetupProgressChecklist 
              state={reinstallTask}
              serverName={server?.name && !/^Server\s+\d+$/i.test(server.name.trim()) ? server.name : 'New Server'}
              onDismiss={() => {
                // Save credentials before resetting so user can still view them
                if (reinstallTask.credentials) {
                  updateSavedCredentials(reinstallTask.credentials);
                  setShowSavedCredentials(true);
                }
                reinstallTask.reset();
                updateSetupMode(false);
                updateSetupMinimized(false);
                queryClient.invalidateQueries({ queryKey: ['server', serverId] });
                queryClient.invalidateQueries({ queryKey: ['servers'] });
              }}
              onMinimize={() => {
                updateSetupMinimized(true);
              }}
              onClose={() => {
                // Save credentials and close dialog without continuing
                if (reinstallTask.credentials) {
                  updateSavedCredentials(reinstallTask.credentials);
                  setShowSavedCredentials(true);
                }
                reinstallTask.reset();
                updateSetupMode(false);
                updateSetupMinimized(false);
                queryClient.invalidateQueries({ queryKey: ['server', serverId] });
                queryClient.invalidateQueries({ queryKey: ['servers'] });
              }}
            />
          ) : (
            /* Reinstall Progress Panel (original) */
            <>
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
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog */}
      <Dialog 
        open={passwordResetDialogOpen} 
        onOpenChange={(open) => {
          if (!open) {
            // Clear password when dialog closes
            setNewPassword(null);
            setPasswordCopied(false);
          }
          setPasswordResetDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-md bg-card/95 backdrop-blur-xl border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Key className="h-5 w-5 text-blue-400" />
              {newPassword ? "New Password Generated" : "Reset Server Password"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {newPassword 
                ? "Your new password has been generated. Copy it now - it will not be shown again."
                : "This will generate a new root/administrator password for your server."
              }
            </DialogDescription>
          </DialogHeader>
          
          {newPassword ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <div className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-green-400 mt-0.5" />
                  <div>
                    <div className="font-medium text-green-400">Password Reset Successful</div>
                    <div className="text-sm text-green-400/80 mt-1">
                      Your server password has been changed. Use the password below to log in.
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">New Password</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-3 bg-muted rounded-md border border-border font-mono text-sm text-foreground break-all">
                    {newPassword}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0 border-border"
                    onClick={() => {
                      navigator.clipboard.writeText(newPassword);
                      setPasswordCopied(true);
                      toast({
                        title: "Password Copied",
                        description: "The password has been copied to your clipboard.",
                      });
                    }}
                    data-testid="button-copy-password"
                  >
                    {passwordCopied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-400/80">
                    This password will not be shown again. Make sure to save it in a secure location before closing this dialog.
                  </p>
                </div>
              </div>
              
              <Button 
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => {
                  setPasswordResetDialogOpen(false);
                  setNewPassword(null);
                  setPasswordCopied(false);
                }}
                data-testid="button-done-password"
              >
                Done
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5" />
                  <div>
                    <div className="font-medium text-amber-400">Confirm Password Reset</div>
                    <div className="text-sm text-amber-400/80">
                      This will immediately change the root/administrator password on your server. 
                      Any existing SSH sessions may be affected.
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 border-border"
                  onClick={() => setPasswordResetDialogOpen(false)}
                  data-testid="button-cancel-password-reset"
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => {
                    if (serverId) {
                      passwordResetMutation.mutate(serverId);
                    }
                  }}
                  disabled={passwordResetMutation.isPending}
                  data-testid="button-confirm-password-reset"
                >
                  {passwordResetMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Key className="h-4 w-4 mr-2" />
                  )}
                  Reset Password
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

