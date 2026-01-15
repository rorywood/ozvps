import { useState, useEffect, useRef, useMemo } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
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
    refetchInterval: 3000, // Poll every 3 seconds for real-time updates
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
  
  
  // Fetch cancellation status - poll every 3s for real-time deletion status
  const { data: cancellationData, refetch: refetchCancellation } = useQuery({
    queryKey: ['cancellation', serverId],
    queryFn: () => api.getCancellationStatus(serverId || ''),
    enabled: !!serverId,
    refetchInterval: 3000, // Poll every 3 seconds for deletion progress
  });

  // Live stats polling every 3 seconds
  const { data: liveStats } = useQuery({
    queryKey: ['live-stats', serverId],
    queryFn: () => api.getLiveStats(serverId || ''),
    enabled: !!serverId && server?.status === 'running',
    refetchInterval: 3000, // Poll every 3 seconds for real-time stats
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
    const trimmed = value.trim();
    if (!trimmed) return 'Hostname is required';
    if (trimmed.length > 253) return 'Hostname must be 253 characters or less';
    const labels = trimmed.split('.');
    for (const label of labels) {
      if (label.length === 0) return 'Hostname cannot have empty labels (consecutive dots)';
      if (label.length > 63) return 'Each part of the hostname must be 63 characters or less';
      if (label.length === 1 && !/^[a-zA-Z0-9]$/.test(label)) {
        return 'Single character parts must be a letter or number';
      }
      if (label.length > 1 && !/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label)) {
        if (label.startsWith('-') || label.endsWith('-')) {
          return 'Hostname parts cannot start or end with a hyphen';
        }
        return 'Hostname can only contain letters, numbers, hyphens, and dots';
      }
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
      hostname: normalizedHostname
    });
  };

  // Setup wizard handlers
  const handleSetupHostnameChange = (value: string) => {
    setSetupHostname(value);
    if (value.trim()) {
      setSetupHostnameError(validateHostname(value));
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
  // Don't show as "setting up" if status is complete - server is ready
  const isSettingUp = reinstallTask.isActive && reinstallTask.status !== 'complete' && (needsSetup || isSetupMode);
  
  // Also block server usage during ANY active build task (setup or reinstall)
  // This ensures cross-session protection even without sessionStorage

  // If server needs setup but provisioning hasn't started, show waiting message
  // Note: Ideally the backend should start provisioning immediately after deploy
  // This manual setup step is a UX issue that should be fixed in the backend
  if (needsSetup && !reinstallTask.isActive) {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto py-12 space-y-6">
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground mb-2">
                {server.name && !/^Server\s+\d+$/i.test(server.name.trim()) ? server.name : 'New Server'}
              </h1>
              <p className="text-muted-foreground">
                Server is being prepared. Provisioning will begin automatically.
              </p>
            </div>
          </div>

          <div className="border border-border rounded-lg p-6 bg-card space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Plan</div>
                <div className="font-medium text-foreground">{server.plan.name}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Location</div>
                <div className="font-medium text-foreground">{server.location.name}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">IP Address</div>
                <div className="font-mono text-sm text-foreground">{server.primaryIp}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Status</div>
                <div className="font-medium text-warning">Awaiting Provisioning</div>
              </div>
            </div>
          </div>

          <div className="text-center">
            <Link href="/servers">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Servers
              </Button>
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  // If server is being provisioned, show full-page provisioning view (DO style)
  if (isSettingUp) {
    return (
      <AppShell>
        <div className="max-w-3xl mx-auto py-12 space-y-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <Link href="/servers">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted/50">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {server?.name && !/^Server\s+\d+$/i.test(server.name.trim()) ? server.name : 'New Server'}
              </h1>
              <p className="text-sm text-muted-foreground">{server?.primaryIp}</p>
            </div>
          </div>

          {/* Full-page provisioning view */}
          <SetupProgressChecklist
            state={reinstallTask}
            serverName={server?.name && !/^Server\s+\d+$/i.test(server.name.trim()) ? server.name : 'New Server'}
            onDismiss={() => {
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
            onClose={() => {
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
      <div>Server Detail - Testing (hooks preserved)</div>
    </AppShell>
  );
}
