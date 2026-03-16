import { useState, useEffect, useRef, useMemo } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Globe,
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
  Shield,
  Server,
  Mail,
  Wallet,
  Ban,
  Gift,
  Info
} from "lucide-react";
import { Link, useRoute, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import flagAU from "@/assets/flag-au.png";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn, formatDate, formatDateShort } from "@/lib/utils";
import { OsTemplateRow } from "@/components/os-template-row";
import { getOsCategory, getOsLogoUrl, FALLBACK_LOGO, type OsTemplate as OsTemplateType } from "@/lib/os-logos";
import { SetupProgressChecklist } from "@/components/setup-progress-checklist";
import { useReinstallTask } from "@/hooks/use-reinstall-task";
import { useConsoleLock } from "@/hooks/use-console-lock";
import { usePowerActions, useSyncPowerActions } from "@/hooks/use-power-actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
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
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";

export default function ServerDetail() {
  const [, params] = useRoute("/servers/:id");
  const [, setLocation] = useLocation();
  const serverId = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Check if account is suspended - redirect to dashboard with notice
  if (user?.accountSuspended) {
    return (
      <AppShell>
        <div className="max-w-3xl mx-auto py-12">
          <div className="bg-destructive/10 border-l-4 border-l-destructive rounded-lg p-6">
            <div className="flex items-start gap-4">
              <Ban className="h-6 w-6 text-destructive flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h2 className="text-xl font-bold text-foreground mb-2">
                  Account Suspended
                </h2>
                <p className="text-muted-foreground mb-4">
                  Your account has been suspended and you cannot access your servers at this time.
                </p>
                {user.accountSuspendedReason && (
                  <div className="bg-destructive/10 rounded p-3 mb-4">
                    <p className="text-xs uppercase text-muted-foreground mb-1">Reason:</p>
                    <p className="text-sm text-foreground">{user.accountSuspendedReason}</p>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  Please contact support if you believe this is an error or to discuss reactivating your account.
                </p>
                <div className="mt-6 flex gap-3">
                  <Button variant="outline" asChild>
                    <Link href="/billing">View Billing</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/support">Contact Support</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }
  const [showReinstallPage, setShowReinstallPage] = useState(false);
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
  const [immediateConfirmText, setImmediateConfirmText] = useState("");
  const [immediatePassword, setImmediatePassword] = useState("");
  const [showPasswordConfirmDialog, setShowPasswordConfirmDialog] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  
  // Password reset state
  const [passwordResetDialogOpen, setPasswordResetDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [resetAccountPassword, setResetAccountPassword] = useState("");
  const [resetPasswordError, setResetPasswordError] = useState("");

  // Track if credentials were emailed (persists after reinstallTask.reset())
  const [credentialsWereEmailed, setCredentialsWereEmailed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return sessionStorage.getItem(`credentialsEmailed:${serverId}`) === 'true';
    } catch {
      return false;
    }
  });

  // Track if banner was dismissed (for immediate UI response)
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return sessionStorage.getItem(`credentialsDismissed:${serverId}`) === 'true';
    } catch {
      return false;
    }
  });

  // Track when server last booted to disable password reset for 2 minutes
  const [serverBootedAt, setServerBootedAt] = useState<number | null>(null);
  const [isPasswordResetDisabled, setIsPasswordResetDisabled] = useState(false);

  // Tab state for controlled navigation
  const [activeTab, setActiveTab] = useState("overview");

  // Dismiss credentials banner
  const dismissCredentials = () => {
    setBannerDismissed(true);
    try {
      sessionStorage.setItem(`credentialsDismissed:${serverId}`, 'true');
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

  // FIXED: Simplified - isSetupMode is already synced with sessionStorage on mount
  // No need to check sessionStorage again, trust the state
  const isInitialSetup = isSetupMode;

  // Check if we're in setup mode before loading server data
  // This prevents the flash of server overview before showing checklist
  const isCheckingSetupMode = isInitialSetup || (reinstallTask.isActive && reinstallTask.status !== 'complete');

  const { data: server, isLoading, isError } = useQuery({
    queryKey: ['server', serverId],
    queryFn: () => api.getServer(serverId || ''),
    enabled: !!serverId,
    staleTime: 0, // Always consider data stale - ensures fresh fetch on navigation
    retry: 2, // Retry failed requests twice before giving up
    retryDelay: 1000, // 1 second between retries
    refetchInterval: (query) => {
      // During provisioning/setup, poll aggressively (1 second)
      // FIXED: Only check data.needsSetup (don't use reinstallTask which can be stale in closure)
      // If server needs setup or is provisioning, poll faster
      const data = query.state.data;
      if (data?.needsSetup || data?.status === 'provisioning') {
        return 1000; // REDUCED from 500ms to 1s to be less aggressive
      }
      // Normal operation: poll every 2 seconds for real-time updates
      return 2000; // REDUCED from 1s to 2s for better performance
    },
  });

  // Auto-dismiss banner after 60 seconds once it's visible
  const bannerVisible = credentialsWereEmailed && server?.status === 'running' && !bannerDismissed;
  useEffect(() => {
    if (!bannerVisible) return;

    const timer = setTimeout(() => {
      dismissCredentials();
    }, 60 * 1000);

    return () => clearTimeout(timer);
  }, [bannerVisible]);

  // Dynamic page title
  useDocumentTitle(server?.name ? `${server.name}` : 'Server Details');

  const { data: networkInfo } = useQuery({
    queryKey: ['network', serverId],
    queryFn: () => api.getNetworkInfo(serverId || ''),
    enabled: !!serverId
  });

  const { data: osTemplates, isLoading: loadingReinstallTemplates } = useQuery({
    queryKey: ['reinstall-templates', serverId],
    queryFn: () => api.getReinstallTemplates(serverId || ''),
    enabled: !!serverId && showReinstallPage
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
  
  
  // Fetch cancellation status - poll rate depends on how active the deletion is
  const { data: cancellationData, refetch: refetchCancellation } = useQuery({
    queryKey: ['cancellation', serverId],
    queryFn: () => api.getCancellationStatus(serverId || ''),
    enabled: !!serverId,
    refetchInterval: (query) => {
      const cancellation = (query.state.data as any)?.cancellation;
      if (!cancellation) return 30000;             // No active deletion — check every 30s
      if (cancellation.status === 'processing') return 5000;  // Actively deleting — check every 5s
      return 15000;                                // pending_approval / pending — check every 15s
    },
  });

  // Power action pending state - declared here so liveStats can use it
  const [powerActionPending, setPowerActionPending] = useState<string | null>(null);

  // Live stats polling - fast updates for real-time monitoring
  // Also poll during power actions to detect status changes faster (liveStats.running is uncached)
  const { data: liveStats } = useQuery({
    queryKey: ['live-stats', serverId],
    queryFn: () => api.getLiveStats(serverId || ''),
    enabled: !!serverId && (server?.status === 'running' || !!powerActionPending),
    refetchInterval: 1000, // Poll every 1 second for real-time stats
  });

  // Console lock hook - must be after server query
  const consoleLock = useConsoleLock(serverId || '', server?.status);

  // Auto-clear stale flags when user navigates back after setup is complete
  // This handles the case where setup completed in another tab/window
  useEffect(() => {
    if (server && !server.needsSetup && serverId) {
      // Only clear if setup mode is OFF (auto-dismiss already handled it)
      // AND there are stale flags in sessionStorage
      if (!isSetupMode) {
        try {
          const hasSetupFlags = sessionStorage.getItem(`setupMode:${serverId}`) ||
                                sessionStorage.getItem(`setupMinimized:${serverId}`);

          if (hasSetupFlags) {
            sessionStorage.removeItem(`setupMode:${serverId}`);
            sessionStorage.removeItem(`setupMinimized:${serverId}`);
          }
        } catch (e) {
          console.error('Error clearing setup flags:', e);
        }
      }
    }
  }, [server?.needsSetup, serverId, isSetupMode]);

  // CRITICAL: Start reinstall task immediately when server needsSetup is detected
  // This ensures the checklist UI activates immediately without any flash of overview
  useEffect(() => {
    // CRITICAL: Don't restart setup if it was already completed once
    // Check sessionStorage for completion flag to prevent race conditions during query refetches
    try {
      const setupCompleted = sessionStorage.getItem(`setupCompleted:${serverId}`) === 'true';
      if (setupCompleted) {
        // Setup was already completed, don't restart
        return;
      }
    } catch {
      // Ignore storage errors
    }

    if (server && server.needsSetup && !reinstallTask.isActive) {
      // Server needs setup but task isn't tracking it yet
      // Start tracking immediately to show checklist
      reinstallTask.startTask(undefined, undefined, server.primaryIp);
      // Ensure setupMode is set
      updateSetupMode(true);
    }
  }, [server?.needsSetup, server?.primaryIp, reinstallTask.isActive, serverId]);

  // Auto-dismiss checklist 20 seconds after server finishes building
  useEffect(() => {
    if (reinstallTask.status !== 'complete' || !reinstallTask.isActive) return;
    const timer = setTimeout(() => {
      reinstallTask.reset();
      updateSetupMode(false);
      try {
        sessionStorage.removeItem(`setupMode:${serverId}`);
        sessionStorage.removeItem(`setupMinimized:${serverId}`);
        sessionStorage.setItem(`setupCompleted:${serverId}`, 'true');
      } catch {}
      queryClient.invalidateQueries({ queryKey: ['server', serverId] });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    }, 20000);
    return () => clearTimeout(timer);
  }, [reinstallTask.status, reinstallTask.isActive, serverId]);

  // Mark when build starts (so banner shows after auto-dismiss)
  useEffect(() => {
    if (reinstallTask.isActive && !credentialsWereEmailed) {
      setCredentialsWereEmailed(true);
      try {
        sessionStorage.setItem(`credentialsEmailed:${serverId}`, 'true');
      } catch {}
    }
  }, [reinstallTask.isActive, serverId, credentialsWereEmailed]);

  // Refetch server data when build completes OR enters rebooting status
  useEffect(() => {
    if ((reinstallTask.status === 'complete' || reinstallTask.status === 'rebooting') && serverId) {
      queryClient.invalidateQueries({ queryKey: ['server', serverId] });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    }
  }, [reinstallTask.status, serverId, queryClient]);

  // Track server boot to disable password reset for 60 seconds (guest agent needs time)
  // Only trigger when transitioning from a known "off" state to "running", not on initial page load
  const prevServerStatus = useRef<string | null>(null);
  useEffect(() => {
    const currentStatus = server?.status || null;
    const prevStatus = prevServerStatus.current;

    // Only trigger timer when:
    // 1. Server is now running AND
    // 2. Previous status was a known "off" state (not null which means page just loaded)
    const wasOff = prevStatus === 'stopped' || prevStatus === 'starting' || prevStatus === 'stopping';
    const isNowRunning = currentStatus === 'running';

    if (isNowRunning && wasOff) {
      setServerBootedAt(Date.now());
      setIsPasswordResetDisabled(true);

      const timer = setTimeout(() => {
        setIsPasswordResetDisabled(false);
      }, 60 * 1000);

      prevServerStatus.current = currentStatus;
      return () => clearTimeout(timer);
    }

    prevServerStatus.current = currentStatus;
  }, [server?.status]);

  const { markPending, clearPending, getDisplayStatus } = usePowerActions();

  // Get display status (reboot, starting, stopping, deleting, or actual)
  // Use liveStats.running for faster shutdown detection only (not startup - can flicker during boot)
  const activeCancellation = cancellationData?.cancellation;
  const effectiveStatus = (() => {
    const serverStatus = server?.status || 'unknown';
    // Only use liveStats to detect shutdown faster (running → stopped)
    // Don't use it to detect startup (stopped → running) as VM can flicker during boot
    if (serverStatus === 'running' && liveStats && liveStats.running === false) {
      return 'stopped'; // Shutdown detected faster via liveStats
    }
    return serverStatus;
  })();

  // Sync power actions using effective status for faster pending action clearance
  useSyncPowerActions(server ? [{ ...server, status: effectiveStatus }] : []);

  const displayStatus = server ? getDisplayStatus(
    server.id,
    effectiveStatus,
    activeCancellation ? { mode: activeCancellation.mode || 'grace', status: activeCancellation.status } : undefined
  ) : 'unknown';
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
      
      // Start console lock for all power actions to prevent button spamming
      consoleLock.startLock(action);
      
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
      setShowReinstallPage(false);
      
      // Mark as reinstall mode (not initial setup)
      updateSetupMode(false);

      // Clear the credentials dismissed flag so banner shows again after reinstall
      try {
        sessionStorage.removeItem(`credentialsDismissed:${serverId}`);
      } catch {}

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

      // Clear setupCompleted and credentialsDismissed flags
      try {
        sessionStorage.removeItem(`setupCompleted:${serverId}`);
        sessionStorage.removeItem(`credentialsDismissed:${serverId}`);
      } catch {
        // Ignore storage errors
      }

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
    mutationFn: ({ id, password }: { id: string; password: string }) => api.resetServerPassword(id, password),
    onSuccess: (response) => {
      if (response.password) {
        setNewPassword(response.password);
        setPasswordCopied(false);
        setResetAccountPassword("");
        setResetPasswordError("");
        toast({
          title: "Password Reset Successful",
          description: "Your new server password has been generated. Please save it now.",
        });
      }
    },
    onError: (error: any) => {
      // Show password error in the dialog instead of closing it
      if (error.message?.toLowerCase().includes('password')) {
        setResetPasswordError(error.message);
      } else {
        setPasswordResetDialogOpen(false);
        setResetAccountPassword("");
        setResetPasswordError("");
        toast({
          title: "Password Reset Failed",
          description: error.message || "Failed to reset server password. Please try again.",
          variant: "destructive",
        });
      }
    }
  });

  // Cancellation mutations
  const requestCancellationMutation = useMutation({
    mutationFn: ({ id, reason, mode, password }: { id: string, reason?: string, mode: 'grace' | 'immediate', password?: string }) =>
      api.requestCancellation(id, reason, mode, password),
    onSuccess: (_, variables) => {
      setCancellationReason("");
      setImmediateConfirmText("");
      setImmediatePassword("");
      setShowPasswordConfirmDialog(false);
      setPasswordError("");
      refetchCancellation();
      toast({
        title: variables.mode === 'immediate' ? "Server Destruction Started" : "Scheduled for Deletion",
        description: variables.mode === 'immediate'
          ? "Your server is being destroyed. This cannot be undone."
          : "Your server will be deleted in 30 days. You can cancel this anytime.",
      });
    },
    onError: (error: any) => {
      // Show password error in the dialog instead of toast
      if (error.message?.toLowerCase().includes('password')) {
        setPasswordError(error.message);
      } else {
        toast({
          title: "Failed",
          description: error.message || "Something went wrong. Please try again.",
          variant: "destructive",
        });
      }
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

  // Overdue warning: billing payment due but nextBillAt is in the past (computed early — needed for wallet query)
  const billingOverdueDaysEarly = (() => {
    const b = server?.billing;
    if (!b || (b.status !== 'active' && b.status !== 'paid') || b.isTrial || b.freeServer || !b.nextBillAt) return 0;
    const days = Math.floor((Date.now() - new Date(b.nextBillAt).getTime()) / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  })();

  // Wallet query for reactivation - fetch when server has any outstanding payment
  const { data: walletData, refetch: refetchWallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.getWallet(),
    enabled: server?.billing?.status === 'suspended' || server?.billing?.status === 'unpaid' || (billingOverdueDaysEarly >= 0 && !server?.billing?.isTrial && !server?.billing?.freeServer && !!server?.billing?.nextBillAt),
  });

  // Reactivate server mutation
  const reactivateMutation = useMutation({
    mutationFn: (serverId: string) => api.reactivateServer(serverId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server', serverId] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
      toast({
        title: "Payment Successful",
        description: "Your server has been reactivated and is starting up.",
        variant: "success",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Reactivation Failed",
        description: error.message || "Failed to reactivate server. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleReactivate = () => {
    if (serverId) {
      reactivateMutation.mutate(serverId);
    }
  };

  // Calculate if user can afford to reactivate
  const canAffordReactivation = walletData?.wallet && server?.billing?.monthlyPriceCents
    ? walletData.wallet.balanceCents >= server.billing.monthlyPriceCents
    : false;

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
      osId: parseInt(selectedOs, 10),
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
      osId: parseInt(setupSelectedOs, 10),
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
  // Consider unlimited if: 0, undefined, or >= 50TB (50000 GB)
  const isUnlimitedBandwidth = !bandwidthAllowance || bandwidthAllowance === 0 || bandwidthAllowance >= 50000;
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

  // If reinstall task is active, show checklist immediately (prevents flash of overview)
  if (isCheckingSetupMode && !isError) {
    // Still loading server data but we know we're in setup mode
    if (isLoading || !server) {
      return (
        <AppShell>
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground h-[50vh]">
            <Loader2 className="h-10 w-10 animate-spin mb-4 text-primary" />
            <p>Loading server setup...</p>
          </div>
        </AppShell>
      );
    }

    // Server loaded, show checklist (this will be handled by the isSettingUp check below)
    // Continue to normal render flow
  } else if (isLoading) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground h-[50vh]">
          <Loader2 className="h-10 w-10 animate-spin mb-4 text-primary" />
          <p>Loading server details...</p>
        </div>
      </AppShell>
    );
  }

  // Only show error if there's genuinely no server data
  // Don't trigger error just because a background refetch failed (isError) - keep showing cached data
  if (!server) {
    // Don't show error if we're in active setup/reinstall mode - server might not be fully ready
    const serverNeedsSetup = false; // server is undefined here
    // Show loading state if reinstall task is active (any status except failed)
    // This prevents "Server not found" flashing during reinstall
    const taskIsActive = reinstallTask.isActive && reinstallTask.status !== 'failed';

    if (taskIsActive || serverNeedsSetup || isLoading) {
      // Customize message based on task status
      let loadingMessage = 'Server is being provisioned...';
      if (reinstallTask.status === 'rebooting') {
        loadingMessage = 'Server is rebooting...';
      } else if (reinstallTask.status === 'complete') {
        loadingMessage = 'Loading server details...';
      }

      return (
        <AppShell>
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground h-[50vh]">
            <Loader2 className="h-10 w-10 animate-spin mb-4 text-primary" />
            <p>{loadingMessage}</p>
          </div>
        </AppShell>
      );
    }

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

  // Server is suspended if VirtFusion says so OR if billing status is suspended OR if admin-suspended
  const isSuspended = server?.suspended === true || server?.billing?.status === 'suspended' || server?.billing?.adminSuspended === true;
  const isAdminSuspended = server?.billing?.adminSuspended === true;
  const isBillingSuspended = server?.billing?.status === 'suspended' && !isAdminSuspended;
  const needsSetup = server?.needsSetup === true;
  const isTrialEnded = server?.billing?.isTrial === true && server?.billing?.trialEndedAt != null;
  const isActiveTrial = server?.billing?.isTrial === true && !server?.billing?.trialEndedAt;

  // Reuse early calculation (declared above wallet query to avoid "used before assigned" error)
  const billingOverdueDays = billingOverdueDaysEarly;

  // Determine if server is still being provisioned/built
  // Show checklist if ANY of these conditions are true:
  // 1. Server explicitly needs setup (commissioned=0)
  // 2. Server status is 'provisioning' (actively building)
  // 3. Server is 'setting up' per our display status
  // 4. Reinstall task is active and not complete
  const serverDisplayStatus = displayStatus;
  const isProvisioningOrBuilding =
    needsSetup ||
    server?.status === 'provisioning' ||
    serverDisplayStatus === 'setting up' ||
    (reinstallTask.isActive && reinstallTask.status !== 'complete');

  // SIMPLE LOGIC: Show checklist if setup mode is on AND server isn't ready yet
  // As soon as setup mode is cleared (by auto-dismiss), show overview
  const isSettingUp = isSetupMode && (needsSetup || server?.status === 'provisioning' || reinstallTask.isActive);

  // Also block server usage during ANY active build task (setup or reinstall)
  // This ensures cross-session protection even without sessionStorage

  // REMOVED: This "waiting" screen causes an extra flash
  // Instead, we go straight to the checklist which handles all states

  // If server is being provisioned, show full-page provisioning view (DO style)
  if (isSettingUp) {
    const setupServerName = server?.name && !/^Server\s+\d+$/i.test(server.name.trim()) ? server.name : 'New Server';
    return (
      <AppShell>
        <div className="max-w-lg mx-auto py-12 space-y-6">
          <div className="flex items-center gap-3">
            <Link href="/servers">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted/50">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-foreground">{setupServerName}</h1>
              <p className="text-sm text-muted-foreground">{server?.primaryIp || 'Provisioning…'}</p>
            </div>
          </div>
          <SetupProgressChecklist
            state={reinstallTask}
            serverName={setupServerName}
            onDismiss={() => {
              reinstallTask.reset();
              updateSetupMode(false);
              updateSetupMinimized(false);
              try {
                sessionStorage.removeItem(`setupMode:${serverId}`);
                sessionStorage.removeItem(`setupMinimized:${serverId}`);
                sessionStorage.setItem(`setupCompleted:${serverId}`, 'true');
              } catch {}
              queryClient.invalidateQueries({ queryKey: ['server', serverId] });
              queryClient.invalidateQueries({ queryKey: ['servers'] });
              setActiveTab('overview');
            }}
            onClose={() => {
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

  // Reinstall in progress — full-page experience (same as initial setup)
  if (reinstallTask.isActive && !isSetupMode) {
    return (
      <AppShell>
        <div className="max-w-lg mx-auto py-12 space-y-6">
          <div className="flex items-center gap-3">
            <Link href="/servers">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted/50">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-foreground">{server.name}</h1>
              <p className="text-sm text-muted-foreground">{server.primaryIp}</p>
            </div>
          </div>
          <SetupProgressChecklist
            state={reinstallTask}
            serverName={server.name}
            isReinstall
            onDismiss={() => {
              reinstallTask.reset();
              queryClient.invalidateQueries({ queryKey: ['server', serverId] });
              queryClient.invalidateQueries({ queryKey: ['servers'] });
              setActiveTab('overview');
            }}
            onClose={() => {
              reinstallTask.reset();
              queryClient.invalidateQueries({ queryKey: ['server', serverId] });
              queryClient.invalidateQueries({ queryKey: ['servers'] });
            }}
          />
        </div>
      </AppShell>
    );
  }

  // If server has a pending_approval cancellation for IMMEDIATE mode, show locked state
  // Scheduled mode pending_approval: fall through to normal page so user can cancel
  if (activeCancellation?.status === 'pending_approval' && activeCancellation?.mode === 'immediate') {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto py-12">
          <Link href="/servers">
            <Button variant="ghost" className="mb-6">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Servers
            </Button>
          </Link>

          <Card className="p-6 mb-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-muted rounded-lg">
                <Server className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-foreground">{server.name}</h1>
                <p className="text-sm text-muted-foreground">{server.primaryIp}</p>
              </div>
              <Badge className="h-7 bg-orange-500/20 text-orange-400 border-orange-500/30">
                Pending Review
              </Badge>
            </div>
          </Card>

          <Card className="p-6 border-orange-500/30 bg-orange-500/5">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-orange-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground mb-1">
                    Immediate Deletion Pending Admin Review
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Your request to immediately delete <span className="font-medium text-foreground">{server.name}</span> has been received and is awaiting admin approval before proceeding.
                  </p>
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium text-orange-300">Made a mistake?</p>
                    <p className="text-sm text-muted-foreground">
                      If you did not intend to delete this server, please <Link href="/support"><span className="text-primary underline cursor-pointer">raise a support ticket immediately</span></Link>.{' '}
                      There is no guarantee the server can be recovered once deletion is approved.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </AppShell>
    );
  }

  // If server has immediate mode cancellation OR is in processing status (VirtFusion deleting), show locked deletion state
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
        <div className="max-w-2xl mx-auto py-12">
          {/* Back button */}
          <Link href="/servers">
            <Button variant="ghost" className="mb-6">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Servers
            </Button>
          </Link>

          {/* Server info card */}
          <Card className="p-6 mb-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-muted rounded-lg">
                <Server className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-foreground">{server.name}</h1>
                <p className="text-sm text-muted-foreground">{server.primaryIp}</p>
              </div>
              <Badge variant="destructive" className="h-7">
                {isProcessing ? 'Removing' : 'Queued'}
              </Badge>
            </div>
          </Card>

          {/* Status card */}
          <Card className="p-6 border-red-500/30 bg-red-500/5">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                {isProcessing ? (
                  <Loader2 className="h-5 w-5 text-red-400 animate-spin mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-orange-400 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground mb-1">
                    {isProcessing ? 'Server Removal in Progress' : 'Server Queued for Removal'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {isProcessing ? (
                      'This server is currently being removed from our infrastructure. This process typically completes within 5 minutes.'
                    ) : timeRemaining > 0 ? (
                      `Removal will begin in approximately ${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''}. Once started, the process cannot be stopped.`
                    ) : (
                      'Removal is about to begin. This process cannot be stopped once started.'
                    )}
                  </p>
                </div>
              </div>

              {isProcessing && (
                <div className="pt-4 border-t border-red-500/20">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Status</span>
                    <span className="text-red-400 font-medium">Removing server resources...</span>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Info box */}
          <Card className="p-6 mt-6 bg-muted/30">
            <h3 className="font-semibold text-foreground mb-3">What happens next?</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground mt-0.5">•</span>
                <span>All data on this server will be permanently deleted</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground mt-0.5">•</span>
                <span>The IP address will be released back to the pool</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground mt-0.5">•</span>
                <span>You will no longer be charged for this server</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground mt-0.5">•</span>
                <span>This action cannot be reversed</span>
              </li>
            </ul>
          </Card>
        </div>
      </AppShell>
    );
  }

  // Reinstall OS picker — full-page experience
  if (showReinstallPage) {
    const selectedTemplate = allTemplates.find(t => t.id.toString() === selectedOs);
    const closeReinstallPage = () => {
      setShowReinstallPage(false);
      setSelectedOs("");
      setHostname("");
      setHostnameError("");
      setOsSearchQuery("");
      setSelectedCategory("All");
    };

    return (
      <AppShell>
        <div className="max-w-7xl mx-auto py-6 px-2 sm:px-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                onClick={closeReinstallPage}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-foreground">Reinstall Server</h1>
                <p className="text-sm text-muted-foreground font-mono">
                  {server.name} · {server.primaryIp}
                </p>
              </div>
            </div>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8 items-start">
            {/* LEFT: OS selection */}
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-foreground">
                Choose an Operating System
              </h2>

              {/* Search + category filter */}
              <div className="space-y-3">
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

              {/* OS grid */}
              {loadingReinstallTemplates ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-24 rounded-xl bg-muted/30 border border-border animate-pulse"
                    />
                  ))}
                </div>
              ) : filteredTemplates.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filteredTemplates.map((template) => (
                    <ReinstallOsCard
                      key={template.uuid || template.id}
                      template={template}
                      isSelected={selectedOs === template.id.toString()}
                      onSelect={() => setSelectedOs(template.id.toString())}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="font-medium">No templates found</p>
                  {osSearchQuery && (
                    <p className="text-sm mt-1">Try a different search term</p>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT: Configuration sidebar */}
            <div className="lg:sticky lg:top-6 space-y-4">
              {/* Server info */}
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
                  Server
                </p>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-muted rounded-lg">
                    <Server className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">{server.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {server.primaryIp}
                    </div>
                  </div>
                </div>
              </div>

              {/* Hostname */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">
                    Hostname <span className="text-destructive">*</span>
                  </label>
                  {server?.name && hostname !== server.name && (
                    <button
                      type="button"
                      onClick={() => {
                        setHostname(server.name);
                        setHostnameError('');
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="button-use-current-hostname"
                    >
                      Use current
                    </button>
                  )}
                </div>
                <Input
                  value={hostname}
                  onChange={(e) => handleHostnameChange(e.target.value)}
                  placeholder="e.g., myserver"
                  className={cn(
                    "bg-muted/50 border-border text-foreground placeholder:text-muted-foreground",
                    hostnameError && "border-destructive/50 focus-visible:ring-destructive"
                  )}
                  data-testid="input-hostname"
                />
                {hostnameError ? (
                  <p className="text-xs text-destructive">{hostnameError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Letters, numbers, hyphens only
                  </p>
                )}
              </div>

              {/* Selected OS */}
              <div className={cn(
                "bg-card border rounded-xl p-4 transition-all",
                selectedTemplate ? "border-primary/40" : "border-border opacity-50"
              )}>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
                  Selected OS
                </p>
                {selectedTemplate ? (
                  <div className="flex items-center gap-3">
                    <ReinstallOsLogo template={selectedTemplate} size="sm" />
                    <div className="min-w-0">
                      <div className="font-medium text-foreground text-sm truncate">
                        {selectedTemplate.name}
                      </div>
                      {(selectedTemplate.version || selectedTemplate.variant) && (
                        <div className="text-xs text-muted-foreground">
                          {[selectedTemplate.version, selectedTemplate.variant ? `(${selectedTemplate.variant})` : null].filter(Boolean).join(' ')}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">None selected</p>
                )}
              </div>

              {/* Warning */}
              <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-destructive">All data will be erased</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    Make sure to back up any important files before continuing.
                  </p>
                </div>
              </div>

              {/* Install button */}
              <Button
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base disabled:opacity-50"
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
                  <>
                    <RefreshCw className="h-5 w-5 mr-2" />
                    Reinstall Server
                  </>
                )}
              </Button>
              {!selectedOs && (
                <p className="text-xs text-muted-foreground text-center -mt-2">
                  Select an OS to continue
                </p>
              )}
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6 pt-6 pb-20">

        {/* Credentials Emailed Banner - Shows after server provisioning completes, auto-dismisses after 60s */}
        {bannerVisible && (
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-5 mb-8" data-testid="banner-credentials">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-primary flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-primary">Your Server is Ready!</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    SSH login credentials have been emailed to your account email address.
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Check your inbox for login details. Don't forget to check your spam folder if you don't see it.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={dismissCredentials}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Dismiss
                </Button>
              </div>
            </div>
        )}


        {/* Billing Notice Banner — active billing due today or overdue */}
        {!isSuspended && server.billing?.nextBillAt && !server.billing?.isTrial && !server.billing?.freeServer && server.billing?.status !== 'unpaid' && (() => {
          const amountDue = server.billing?.monthlyPriceCents ?? 0;
          const walletBalance = walletData?.wallet?.balanceCents ?? 0;
          const canPay = walletBalance >= amountDue;
          const billDate = new Date(server.billing.nextBillAt);
          const now = new Date();
          const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
          const billDateUTC = Date.UTC(billDate.getFullYear(), billDate.getMonth(), billDate.getDate());
          const daysUntil = Math.round((billDateUTC - todayUTC) / (1000 * 60 * 60 * 24));

          if (daysUntil === 0 && canPay) {
            return (
              <div className="border border-primary/30 bg-primary/8 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">Upcoming Payment</h3>
                    <p className="text-sm text-muted-foreground">
                      This server will be charged automatically today — <span className="font-semibold text-foreground">${(amountDue / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span> will be deducted from your wallet. No action needed.
                    </p>
                  </div>
                </div>
              </div>
            );
          }

          if (daysUntil < 0 && canPay) {
            return (
              <div className="border border-primary/30 bg-primary/8 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">Payment Processing</h3>
                    <p className="text-sm text-muted-foreground">
                      Your wallet has sufficient funds. Payment will be processed automatically.
                    </p>
                  </div>
                </div>
              </div>
            );
          }

          if (daysUntil <= 0 && !canPay) {
            return (
              <div className="border border-warning/30 bg-warning/8 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">Insufficient Funds</h3>
                      <p className="text-sm text-muted-foreground">
                        Please add funds to avoid suspension.{" "}
                        Amount due: <span className="font-semibold text-foreground">${(amountDue / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
                        {walletData && (
                          <> · Wallet: <span className="font-semibold text-destructive">${(walletBalance / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span></>
                        )}
                      </p>
                    </div>
                  </div>
                  <Link href="/billing">
                    <Button size="sm" className="shrink-0 bg-warning/15 border border-warning/40 text-warning hover:bg-warning/25">
                      <Wallet className="h-3.5 w-3.5 mr-1.5" />
                      Add Funds
                    </Button>
                  </Link>
                </div>
              </div>
            );
          }

          return null;
        })()}

        {/* Overdue/Unpaid Banner */}
        {server.billing?.status === 'unpaid' && !isSuspended && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 flex items-center justify-between gap-3" data-testid="banner-overdue">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-red-300">Payment Overdue</h3>
                <p className="text-sm text-red-300/80">
                  Your server payment is overdue. Please add funds to avoid suspension
                  {server.billing?.suspendAt && (
                    <> by {formatDateShort(server.billing.suspendAt)}</>
                  )}.
                </p>
              </div>
            </div>
            <Link href="/billing">
              <Button variant="outline" size="sm" className="border-red-500/50 text-red-300 hover:bg-red-500/20">
                Add Funds
              </Button>
            </Link>
          </div>
        )}

        {/* Suspension Banner */}
        {isSuspended && (
          <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-4" data-testid="banner-suspended">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <Ban className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-destructive">Server Suspended</h3>
                  {isAdminSuspended ? (
                    <>
                      <p className="text-sm text-destructive/80 mt-1">
                        This server has been suspended by an administrator.
                      </p>
                      {server.billing?.adminSuspendedReason && (
                        <div className="mt-2 p-2 bg-destructive/5 rounded border border-destructive/20">
                          <p className="text-xs uppercase text-muted-foreground mb-1">Reason:</p>
                          <p className="text-sm text-foreground">{server.billing.adminSuspendedReason}</p>
                        </div>
                      )}
                    </>
                  ) : isBillingSuspended ? (
                    <>
                      <p className="text-sm text-destructive/80 mt-1">
                        This server has been suspended due to non-payment.
                      </p>
                      {server.billing?.monthlyPriceCents && (
                        <p className="text-sm text-muted-foreground mt-2">
                          Amount due: <span className="font-medium text-foreground">${(server.billing.monthlyPriceCents / 100).toFixed(2)}</span>
                          {walletData?.wallet && (
                            <span className="ml-2">
                              • Wallet: <span className={cn("font-medium", canAffordReactivation ? "text-success" : "text-destructive")}>
                                ${(walletData.wallet.balanceCents / 100).toFixed(2)}
                              </span>
                            </span>
                          )}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-destructive/80 mt-1">
                      This server has been suspended. Please contact support for assistance.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {isBillingSuspended && !server.billing?.freeServer ? (
                  <>
                    {canAffordReactivation ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleReactivate}
                        disabled={reactivateMutation.isPending}
                      >
                        {reactivateMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Wallet className="h-4 w-4 mr-2" />
                        )}
                        Pay & Reactivate
                      </Button>
                    ) : (
                      <Link href="/billing">
                        <Button size="sm" variant="destructive">
                          <Wallet className="h-4 w-4 mr-2" />
                          Add Funds
                        </Button>
                      </Link>
                    )}
                  </>
                ) : (
                  <Link href="/support">
                    <Button variant="outline" size="sm" className="border-destructive/50 text-destructive hover:bg-destructive/10">
                      Contact Support
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Trial Ended Banner */}
        {isTrialEnded && (
          <div className="bg-amber-500/20 border border-amber-500/50 rounded-lg p-4" data-testid="banner-trial-ended">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-amber-300">Trial Period Ended</h3>
                  <p className="text-sm text-amber-300/80 mt-1">
                    Your trial period for this server has ended. The server has been powered off.
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Contact support to discuss upgrading to a paid plan.
                  </p>
                </div>
              </div>
              <Link href="/support">
                <Button variant="outline" size="sm" className="border-amber-500/50 text-amber-300 hover:bg-amber-500/20">
                  Contact Support
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* DigitalOcean-style Layout: Sidebar + Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">

          {/* LEFT SIDEBAR - Server Info */}
          <div className="space-y-4">
            <Card className="p-4 bg-card border-border">
              <div className="space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Plan</p>
                  <p className="text-sm font-semibold text-foreground">{server.billing?.planName || server.plan?.name || 'Unknown Plan'}</p>
                  {server.billing?.freeServer || server.billing?.isTrial ? (
                    <p className="text-sm font-semibold text-emerald-400 mt-1">
                      {server.billing?.isTrial ? 'Trial' : 'Free'}
                    </p>
                  ) : server.billing?.monthlyPriceCents ? (
                    <div className="flex items-baseline gap-1 mt-2">
                      <span className="text-2xl font-bold text-foreground">
                        ${Math.floor(server.billing.monthlyPriceCents / 100)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        .{String(server.billing.monthlyPriceCents % 100).padStart(2, '0')}<span className="text-xs">/mo</span>
                      </span>
                    </div>
                  ) : null}
                </div>

                <div className="border-t border-border pt-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Specs</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Cpu className="h-4 w-4" />
                      <span>{server.plan.specs.vcpu} vCPU</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Activity className="h-4 w-4" />
                      <span>{server.plan.specs.ram >= 1024 ? (server.plan.specs.ram / 1024).toFixed(0) : server.plan.specs.ram} {server.plan.specs.ram >= 1024 ? 'GB' : 'MB'} RAM</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <StorageIcon className="h-4 w-4" />
                      <span>{server.plan.specs.disk} GB Storage</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Globe className="h-4 w-4" />
                      <span>
                        {!server.plan.specs.traffic || server.plan.specs.traffic === 0 || server.plan.specs.traffic >= 50000
                          ? 'Unlimited Bandwidth'
                          : server.plan.specs.traffic >= 1000
                            ? `${(server.plan.specs.traffic / 1000).toFixed(0)} TB Bandwidth`
                            : `${server.plan.specs.traffic} GB Bandwidth`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Gauge className="h-4 w-4" />
                      <span>{trafficData?.network?.portSpeed || 1000} Mbps Port</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Location</p>
                  <div className="flex items-center gap-2">
                    <img src={flagAU} alt="AU" className="h-4 w-6 object-cover rounded" />
                    <span className="text-sm text-foreground">
                      {server.location?.name || server.location?.city || 'Brisbane'}
                    </span>
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Primary IP</p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-foreground">{server.primaryIp}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => {
                        navigator.clipboard.writeText(server.primaryIp);
                        toast({ title: "Copied to clipboard" });
                      }}
                      title="Copy IP address"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {server.uuid && (
                  <div className="border-t border-border pt-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">UUID</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-foreground truncate" title={server.uuid}>{server.uuid}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0"
                        onClick={() => {
                          navigator.clipboard.writeText(server.uuid);
                          toast({ title: "Copied to clipboard" });
                        }}
                        title="Copy UUID"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Trial Info Section */}
                {isActiveTrial && server.billing?.trialExpiresAt && (
                  <div className="border-t border-border pt-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                      Trial
                    </p>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-amber-500" />
                      <p className="text-sm font-medium text-amber-500">
                        Trial Server
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Expires: {new Date(server.billing.trialExpiresAt).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZone: 'Australia/Brisbane',
                      })}
                    </p>
                  </div>
                )}

                {/* Trial Ended Section */}
                {isTrialEnded && (
                  <div className="border-t border-border pt-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                      Status
                    </p>
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-amber-500" />
                      <p className="text-sm font-medium text-amber-500">
                        Trial Ended
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Contact support to upgrade
                    </p>
                  </div>
                )}

                {/* Billing Status Section */}
                {server.billing?.freeServer && !server.billing?.isTrial ? (
                  <div className="border-t border-border pt-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                      Billing
                    </p>
                    <div className="flex items-center gap-2">
                      <Gift className="h-4 w-4 text-blue-500" />
                      <p className="text-sm font-medium text-blue-500">
                        Complimentary
                      </p>
                    </div>
                    <p className="text-xs text-blue-400 mt-1">
                      This server is free - you are not being charged
                    </p>
                  </div>
                ) : server.billing?.adminSuspended ? (
                  <div className="border-t border-border pt-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                      Status
                    </p>
                    <div className="flex items-center gap-2">
                      <Ban className="h-4 w-4 text-destructive" />
                      <p className="text-sm font-medium text-destructive">
                        Admin Suspended
                      </p>
                    </div>
                    <p className="text-xs text-destructive/80 mt-1">
                      Contact support for assistance
                    </p>
                  </div>
                ) : server.billing?.status === 'suspended' ? (
                  <div className="border-t border-border pt-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                      Billing
                    </p>
                    <div className="flex items-center gap-2">
                      <Ban className="h-4 w-4 text-destructive" />
                      <p className="text-sm font-medium text-destructive">
                        Server Suspended
                      </p>
                    </div>
                    <p className="text-xs text-destructive/80 mt-1">
                      Add funds to reactivate this server
                    </p>
                  </div>
                ) : server.billing?.nextBillAt && !server.billing?.isTrial && (() => {
                  const nextBillDate = new Date(server.billing.nextBillAt);
                  const now = new Date();
                  // Normalize to start of day in local timezone for accurate day count
                  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                  const billDateStart = new Date(nextBillDate.getFullYear(), nextBillDate.getMonth(), nextBillDate.getDate());
                  const daysUntilBill = Math.round((billDateStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
                  const isOverdue = daysUntilBill < 0;
                  const isDueToday = daysUntilBill === 0;
                  const isDueTomorrow = daysUntilBill === 1;

                  return (
                    <div className="border-t border-border pt-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                        {server.billing.status === 'unpaid' ? 'Payment Due' : isOverdue ? 'Overdue' : isDueToday ? 'Upcoming Payment' : 'Next Due'}
                      </p>
                      <div className="flex items-center gap-2">
                        {(server.billing.status === 'unpaid' || isOverdue || isDueToday) && (
                          <AlertCircle className={`h-4 w-4 ${server.billing.status === 'unpaid' || isOverdue ? 'text-red-400' : 'text-amber-500'}`} />
                        )}
                        <p className={`text-sm font-medium ${
                          server.billing.status === 'unpaid' || isOverdue ? 'text-red-400' :
                          isDueToday ? 'text-amber-500' : 'text-foreground'
                        }`}>
                          {isOverdue ? `Overdue (${Math.abs(daysUntilBill)} day${Math.abs(daysUntilBill) !== 1 ? 's' : ''})` : isDueToday ? 'Today' : isDueTomorrow ? 'Due Tomorrow' : (
                            <>
                              {formatDate(nextBillDate.toISOString())}
                              <span className="text-muted-foreground font-normal ml-1">
                                ({daysUntilBill} day{daysUntilBill !== 1 ? 's' : ''})
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                      {isOverdue && server.billing.status !== 'unpaid' && (
                        <p className="text-xs text-red-400/80 mt-1">
                          Payment required immediately
                        </p>
                      )}
                      {isDueToday && !isOverdue && server.billing.status !== 'unpaid' && (
                        <p className="text-xs text-amber-500/80 mt-1">
                          Will be charged automatically today
                        </p>
                      )}
                      {isDueTomorrow && server.billing.status !== 'unpaid' && (
                        <p className="text-xs text-amber-500/80 mt-1">
                          Ensure your wallet has sufficient funds
                        </p>
                      )}
                      {server.billing.status === 'unpaid' && server.billing.suspendAt && (
                        <p className="text-xs text-red-400/80 mt-1">
                          Suspends {formatDateShort(server.billing.suspendAt)}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
            </Card>
          </div>

          {/* RIGHT MAIN CONTENT */}
          <div className="space-y-6">

        {/* Header Section */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {/* Row 1: back button + name + status */}
            <div className="flex items-center gap-3">
               <Link href="/servers">
                <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/50" data-testid="button-back">
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
                    className="h-7 w-7 shrink-0 text-green-400 hover:bg-green-500/20"
                    onClick={handleSaveName}
                    disabled={isRenamingServer || !editedName.trim()}
                    data-testid="button-save-name"
                  >
                    {isRenamingServer ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:bg-muted"
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
                  >
                    {server.name}
                  </h1>
                  {cancellationData?.cancellation && (
                    <span className="text-[10px] uppercase font-bold px-2 py-1 rounded border bg-orange-500/20 border-orange-500/30 text-orange-400 flex items-center gap-1 shrink-0" data-testid="badge-pending-cancellation">
                      <Calendar className="h-3 w-3" />
                      PENDING CANCELLATION
                    </span>
                  )}
                </div>
              )}
              {(powerActionPending || isTransitioning || consoleLock.isLocked) ? (
                <div className="flex items-center gap-2 shrink-0">
                  <Loader2 className="h-4 w-4 animate-spin text-orange-400" />
                  <span className="text-xs text-orange-400 font-medium">
                    {consoleLock.isLocked && consoleLock.action === 'boot' ? 'Starting...' :
                     consoleLock.isLocked && consoleLock.action === 'reboot' ? 'Rebooting...' :
                     consoleLock.isLocked && consoleLock.action === 'reinstall' ? 'Reinstalling...' :
                     consoleLock.isLocked ? 'Processing...' :
                     displayStatus === 'starting' ? 'Starting...' :
                     displayStatus === 'rebooting' ? 'Rebooting...' :
                     displayStatus === 'stopping' ? 'Stopping...' :
                     powerActionPending === 'boot' ? 'Starting...' :
                     powerActionPending === 'reboot' ? 'Rebooting...' :
                     powerActionPending === 'shutdown' ? 'Shutting down...' :
                     powerActionPending === 'poweroff' ? 'Force stopping...' :
                     'Processing...'}
                  </span>
                </div>
              ) : (
                <div className={cn(
                  "h-2.5 w-2.5 rounded-full shadow-[0_0_8px] shrink-0",
                  displayStatus === 'running' ? "bg-green-500 shadow-green-500/50" :
                  displayStatus === 'stopped' ? "bg-red-500 shadow-red-500/50" :
                  "bg-yellow-500 shadow-yellow-500/50"
                )} data-testid="status-indicator" />
              )}
            </div>

            {/* Row 2: IP, location, OS */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground pl-8 mt-0.5">
              <div className="flex items-center gap-1.5">
                <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono text-foreground border border-border leading-none">IP</span>
                <span className="text-foreground font-mono text-sm" data-testid="text-primary-ip">{server.primaryIp}</span>
                <button
                  onClick={() => copyToClipboard(server.primaryIp)}
                  className="text-muted-foreground hover:text-foreground"
                  data-testid="button-copy-ip"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <img src={flagAU} alt="" className="h-3.5 w-5 object-cover rounded-sm" />
                <span className="text-foreground">{server.location.name}</span>
              </div>
              {server.image && (
                <div className="flex items-center gap-1.5">
                  <img
                    src={getOsLogoUrl({ id: server.image.id, name: server.image.name, distro: server.image.distro })}
                    alt=""
                    className="h-3.5 w-3.5 object-contain shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_LOGO; }}
                  />
                  <span className="text-foreground truncate max-w-[220px]" title={server.image.name}>{server.image.name}</span>
                </div>
              )}
            </div>
          </div>

          {/* DigitalOcean-style Power Controls - Prominent Buttons */}
          <div className="flex flex-wrap items-center gap-3 mt-6">
            {/* Primary Console Button */}
            <Button
              className="h-10"
              onClick={handleOpenVnc}
              disabled={!!powerActionPending || displayStatus !== 'running' || isTransitioning || isSuspended || isTrialEnded || consoleLock.isLocked}
              data-testid="button-console"
            >
              <TerminalSquare className="h-4 w-4 mr-2" />
              Console
            </Button>

            {/* Power Control Buttons - Separate, Not Dropdown */}
            {displayStatus === 'stopped' ? (
              <Button
                variant="outline"
                className="h-10 border-success/50 text-success hover:bg-success/10"
                onClick={() => handlePowerAction('boot')}
                disabled={isTransitioning || !!powerActionPending || consoleLock.isLocked || isSuspended || isTrialEnded || reinstallTask.isActive}
                data-testid="button-start"
              >
                <Power className="h-4 w-4 mr-2" />
                Start
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="h-10 border-orange-500/50 text-orange-500 hover:bg-orange-500/10"
                  onClick={() => handlePowerAction('reboot')}
                  disabled={displayStatus !== 'running' || isTransitioning || !!powerActionPending || consoleLock.isLocked || isSuspended || isTrialEnded || reinstallTask.isActive}
                  data-testid="button-reboot"
                >
                  <RotateCw className="h-4 w-4 mr-2" />
                  Reboot
                </Button>
                <Button
                  variant="outline"
                  className="h-10 border-destructive/50 text-destructive hover:bg-destructive/10"
                  onClick={() => handlePowerAction('shutdown')}
                  disabled={displayStatus === 'stopped' || isTransitioning || !!powerActionPending || consoleLock.isLocked || isSuspended || isTrialEnded || reinstallTask.isActive}
                  data-testid="button-shutdown"
                >
                  <Power className="h-4 w-4 mr-2" />
                  Shutdown
                </Button>
                <Button
                  variant="outline"
                  className="h-10 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => handlePowerAction('poweroff')}
                  disabled={displayStatus === 'stopped' || isTransitioning || !!powerActionPending || consoleLock.isLocked || isSuspended || isTrialEnded || reinstallTask.isActive}
                  data-testid="button-force-stop"
                >
                  <Power className="h-4 w-4 mr-2" />
                  Force Stop
                </Button>
              </>
            )}

            {/* More Menu - Secondary Actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-10 w-10">
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => setPasswordResetDialogOpen(true)}
                  disabled={isSuspended || isTrialEnded || isPasswordResetDisabled}
                >
                  <Key className="h-4 w-4 mr-2" /> Reset Password
                  {isPasswordResetDisabled && <span className="text-[10px] text-muted-foreground ml-auto">(wait 1min)</span>}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Navigation Tabs - Restructured to 3 Tabs (DO Style) */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6 mt-8">
          <div className="border-b border-border">
            <TabsList className="bg-transparent h-auto p-0 gap-6 w-full flex flex-wrap justify-start">
              <TabsTrigger
                value="overview"
                className="bg-transparent border-b-2 border-transparent rounded-none px-1 py-3 text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-all hover:text-foreground"
                data-testid="tab-overview"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="access"
                className="bg-transparent border-b-2 border-transparent rounded-none px-1 py-3 text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-all hover:text-foreground"
                data-testid="tab-access"
              >
                Access
              </TabsTrigger>
              <TabsTrigger
                value="destroy"
                className="bg-transparent border-b-2 border-transparent rounded-none px-1 py-3 text-muted-foreground data-[state=active]:border-destructive data-[state=active]:text-destructive data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-all hover:text-foreground"
                data-testid="tab-destroy"
              >
                Destroy
              </TabsTrigger>
            </TabsList>
          </div>

          {/* OVERVIEW TAB - Combines Statistics + IP Management */}
          <TabsContent value="overview" className="space-y-6 animate-in fade-in duration-300">
            
            {/* Live Stats - CPU, Memory, Disk */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* CPU Card */}
              <Card className="p-4">
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
                      {powerActionPending ? '' :
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
              </Card>

              {/* Memory Card */}
              <Card className="p-4">
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
                      {powerActionPending ? '' :
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
              </Card>

              {/* Disk Card */}
              <Card className="p-4">
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
                      {powerActionPending ? '' :
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
              </Card>
            </div>

            {/* Bandwidth Stats Card - Compact */}
            <Card className="p-4">
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
                  // Bandwidth uses decimal units (1TB = 1000GB), not binary (1TiB = 1024GiB)
                  if (gb >= 1000) {
                    const tb = gb / 1000;
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
                
                const periodStart = current?.periodStart ? formatDateShort(current.periodStart) : null;
                const periodEnd = current?.periodEnd ? formatDateShort(current.periodEnd) : null;
                
                return (
                  <div className="space-y-2">
                    {/* Bandwidth Exceeded Warning - only show if not unlimited */}
                    {!isUnlimitedBandwidth && usagePercent >= 100 && (
                      <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-4">
                        <div className="flex items-start gap-4">
                          <AlertTriangle className="h-7 w-7 text-destructive flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-lg text-foreground font-bold">Bandwidth Limit Exceeded</p>
                            <p className="text-base text-muted-foreground mt-1">Bandwidth has been shaped to 1Mbps Download and 1Mbps Upload.</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {!isUnlimitedBandwidth && usagePercent >= 80 && usagePercent < 100 && (
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
                        {usedDisplay} {!isUnlimitedBandwidth && <span className="text-muted-foreground font-normal">/ {limitGB >= 1000 ? `${(limitGB / 1000).toFixed(2)} TB` : `${limitGB} GB`}</span>}
                      </span>
                      {isUnlimitedBandwidth ? (
                        <span className="text-sm font-semibold text-green-400 whitespace-nowrap">Unlimited</span>
                      ) : remainingDisplay !== null ? (
                        <span className="text-sm font-semibold text-green-400 whitespace-nowrap" data-testid="text-bandwidth-remaining">
                          {remainingDisplay} <span className="text-[10px] text-muted-foreground font-normal">left</span>
                        </span>
                      ) : null}
                    </div>

                    {/* Progress Bar - hide for unlimited */}
                    {!isUnlimitedBandwidth && (
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
                    )}

                    {/* Compact Stats Row */}
                    <div className={cn("grid gap-1.5 text-center", isUnlimitedBandwidth ? "grid-cols-3" : "grid-cols-4")}>
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
                      {!isUnlimitedBandwidth && (
                        <div className="p-1.5 bg-muted/50 rounded border border-border">
                          <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                            <Network className="h-2.5 w-2.5 text-cyan-400" />%
                          </div>
                          <div className="text-xs font-semibold text-foreground" data-testid="text-bandwidth-percent">{usagePercent.toFixed(1)}%</div>
                        </div>
                      )}
                    </div>
                    
                    {/* Period - inline */}
                    {periodStart && periodEnd && (
                      <div className="text-[10px] text-muted-foreground text-center">{periodStart} - {periodEnd}</div>
                    )}
                  </div>
                );
              })()}
            </Card>

            {/* IP Management - Inline in Overview */}
            <Card className="p-6">
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
                      </div>

                      {iface.ipv4.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">IPv4 Addresses</div>
                          {iface.ipv4.map((ip, ipIndex) => (
                            <div key={ipIndex} className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                              <span className="font-mono text-foreground" data-testid={`text-ip-${index}-${ipIndex}`}>{ip.address}</span>
                              <button
                                onClick={() => copyToClipboard(ip.address)}
                                className="text-muted-foreground hover:text-foreground p-1"
                                data-testid={`button-copy-ip-${index}-${ipIndex}`}
                              >
                                <Copy className="h-3 w-3" />
                              </button>
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
            </Card>
          </TabsContent>

          {/* ACCESS TAB - Password Reset */}
          <TabsContent value="access" className="space-y-4 animate-in fade-in duration-300">
            <Card className="p-6">
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
                      (isSuspended || cancellationData?.cancellation || isPasswordResetDisabled)
                        ? "bg-muted text-muted-foreground cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700"
                    )}
                    onClick={() => setPasswordResetDialogOpen(true)}
                    disabled={isSuspended || isTrialEnded || !!cancellationData?.cancellation || isPasswordResetDisabled}
                    data-testid="button-reset-password"
                  >
                    <Key className="h-4 w-4 mr-2" />
                    Reset Password
                  </Button>
                  {isPasswordResetDisabled && (
                    <p className="text-sm text-amber-400/80 mt-2">
                      Password reset is temporarily disabled.
                    </p>
                  )}
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
            </Card>
          </TabsContent>

          {/* DESTROY TAB - Combines Reinstallation + Cancellation (Danger Zone) */}
          <TabsContent value="destroy" className="space-y-6 animate-in fade-in duration-300">

            {/* Reinstall Section */}
            <Card className="p-6 border-destructive/30">
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-500/20 rounded-xl">
                      <RefreshCw className="h-6 w-6 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-foreground">Reinstall Operating System</h3>
                      <p className="text-sm text-muted-foreground">
                        Fresh install with new credentials
                      </p>
                    </div>
                  </div>

                  {/* Current Server Info */}
                  <div className="p-4 bg-muted/30 border border-border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-background rounded-lg border border-border">
                        <Server className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <div className="font-mono font-semibold text-foreground">{server?.name}</div>
                        <div className="text-sm text-muted-foreground space-x-3">
                          <span>{server?.primaryIp || 'No IP'}</span>
                          <span>•</span>
                          <span>{server?.os?.name || server?.image?.name || 'Unknown OS'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Warning Box */}
                  <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
                      <div className="space-y-1">
                        <div className="font-semibold text-amber-400">Warning: Data Loss</div>
                        <ul className="text-sm text-amber-400/80 space-y-0.5">
                          <li>• All existing data will be permanently erased</li>
                          <li>• You'll receive new login credentials</li>
                          <li>• The server will reboot during installation</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <Button
                    className={cn(
                      "w-full h-12 text-base font-semibold",
                      (isSuspended || cancellationData?.cancellation)
                        ? "bg-muted text-muted-foreground cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    )}
                    onClick={() => {
                      setHostname(server?.name || '');
                      setShowReinstallPage(true);
                    }}
                    disabled={isSuspended || isTrialEnded || !!cancellationData?.cancellation}
                    data-testid="button-reinstall"
                  >
                    <RefreshCw className="h-5 w-5 mr-2" />
                    Reinstall Server
                  </Button>
                  {isSuspended && (
                    <p className="text-sm text-yellow-400/80 text-center">
                      Reinstall is disabled while the server is suspended.
                    </p>
                  )}
                  {cancellationData?.cancellation && !isSuspended && (
                    <p className="text-sm text-red-400/80 text-center">
                      Reinstall is disabled because this server is scheduled for deletion.
                    </p>
                  )}
                </div>
            </Card>

            {/* Destroy Server Section - DigitalOcean Style */}
            <Card className="p-6 border-destructive/50">
              <div className="space-y-6">
                {cancellationData?.cancellation ? (
                  // Show existing deletion status
                  <>
                    {cancellationData.cancellation.mode === 'immediate' ? (
                      // Immediate deletion in progress
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-red-500/20 rounded-lg">
                            <Trash2 className="h-6 w-6 text-red-400" />
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-red-400">Server Being Destroyed</h3>
                            <p className="text-sm text-muted-foreground">This process cannot be stopped</p>
                          </div>
                        </div>

                        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                          <div className="flex items-center gap-3 mb-3">
                            <Loader2 className="h-5 w-5 text-red-400 animate-spin" />
                            <span className="font-semibold text-red-400">Destruction in progress...</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            <span className="font-mono font-bold text-foreground">{server?.name}</span> and all associated data will be permanently destroyed within 5 minutes.
                          </p>
                        </div>
                      </div>
                    ) : (
                      // Scheduled deletion (grace period)
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-amber-500/20 rounded-lg">
                            <Calendar className="h-6 w-6 text-amber-400" />
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-amber-400">Scheduled for Destruction</h3>
                            <p className="text-sm text-muted-foreground">
                              {cancellationData.cancellation.status === 'pending_approval'
                                ? 'Pending admin review — you can still cancel this request'
                                : 'You can cancel this before the scheduled date'}
                            </p>
                          </div>
                        </div>

                        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-muted-foreground">Server</span>
                              <span className="font-mono font-bold text-foreground">{server?.name}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-muted-foreground">Destruction Date</span>
                              <span className="font-semibold text-amber-400">
                                {new Date(cancellationData.cancellation.scheduledDeletionAt).toLocaleDateString('en-AU', {
                                  weekday: 'short',
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                  timeZone: 'Australia/Brisbane',
                                })}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-muted-foreground">Time Remaining</span>
                              <span className="font-semibold text-amber-400">
                                {Math.max(0, Math.ceil((new Date(cancellationData.cancellation.scheduledDeletionAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} days
                              </span>
                            </div>
                          </div>
                        </div>

                        {cancellationData.cancellation.reason && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">Reason: </span>
                            <span className="text-foreground">{cancellationData.cancellation.reason}</span>
                          </div>
                        )}

                        <Button
                          variant="outline"
                          className="w-full border-green-500/50 text-green-400 hover:bg-green-500/10 hover:text-green-300"
                          onClick={() => serverId && revokeCancellationMutation.mutate(serverId)}
                          disabled={revokeCancellationMutation.isPending}
                          data-testid="button-revoke-cancellation"
                        >
                          {revokeCancellationMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Cancelling...
                            </>
                          ) : (
                            <>
                              <XCircle className="h-4 w-4 mr-2" />
                              Cancel Scheduled Destruction
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  // Show destroy options - DigitalOcean style
                  <>
                    <div>
                      <h3 className="text-xl font-bold text-red-400 mb-2">Destroy Server</h3>
                      <p className="text-sm text-muted-foreground">
                        Once you destroy a server, there is no going back. Please be certain.
                      </p>
                    </div>

                    {/* Server Info Card */}
                    <div className="p-4 bg-muted/30 border border-border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-background rounded-lg border border-border">
                          <Server className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <div className="flex-1">
                          <div className="font-mono font-bold text-lg text-foreground">{server?.name}</div>
                          <div className="text-sm text-muted-foreground space-x-3">
                            <span>{server?.primaryIp || 'No IP'}</span>
                            <span>•</span>
                            <span>{server?.os?.name || server?.image?.name || 'Unknown OS'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Warning Box */}
                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
                        <div className="space-y-2">
                          <div className="font-semibold text-red-400">This action is irreversible</div>
                          <ul className="text-sm text-red-400/80 space-y-1">
                            <li>• All data on this server will be permanently destroyed</li>
                            <li>• The server's IP address will be released</li>
                            <li>• Any associated configurations will be lost</li>
                            <li>• No refunds will be provided for remaining credit</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Confirmation Input */}
                    <div className="space-y-3">
                      <Label className="text-sm text-foreground block">
                        Enter the server name <span className="font-mono font-bold text-red-400">{server?.name}</span> to confirm:
                      </Label>
                      <Input
                        value={immediateConfirmText}
                        onChange={(e) => setImmediateConfirmText(e.target.value)}
                        placeholder={server?.name || "server name"}
                        className="bg-muted/50 border-border text-foreground placeholder:text-muted-foreground font-mono"
                        data-testid="input-confirm-delete"
                        autoComplete="off"
                      />
                    </div>

                    {/* Destroy Button - Opens password confirmation popup */}
                    <Button
                      className={cn(
                        "w-full h-12 text-base font-semibold",
                        immediateConfirmText === server?.name && !isSuspended
                          ? "bg-red-600 hover:bg-red-700 text-white"
                          : "bg-red-600/30 text-red-400/50 cursor-not-allowed"
                      )}
                      disabled={immediateConfirmText !== server?.name || isSuspended || isTrialEnded}
                      onClick={() => {
                        setPasswordError("");
                        setImmediatePassword("");
                        setShowPasswordConfirmDialog(true);
                      }}
                      data-testid="button-destroy-server"
                    >
                      <Trash2 className="h-5 w-5 mr-2" />
                      Destroy this Server
                    </Button>

                    {isSuspended && (
                      <p className="text-sm text-yellow-400/80 text-center">
                        Contact support to destroy a suspended server.
                      </p>
                    )}

                    {/* Alternative: Schedule Deletion */}
                    <div className="pt-6 border-t border-border">
                      <div className="flex items-center gap-2 mb-3">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-muted-foreground">Prefer to schedule deletion?</span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">
                        Schedule your server for deletion in 30 days. You can cancel anytime during this period.
                      </p>
                      <div className="flex gap-3 items-center">
                        <Input
                          value={cancellationReason}
                          onChange={(e) => setCancellationReason(e.target.value)}
                          placeholder="Reason (optional)"
                          className="flex-1 bg-muted/50 border-border text-foreground placeholder:text-muted-foreground text-sm"
                          data-testid="input-cancellation-reason"
                        />
                        <Button
                          variant="outline"
                          className={cn(
                            "shrink-0",
                            isSuspended
                              ? "border-border text-muted-foreground cursor-not-allowed"
                              : "border-amber-500/50 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                          )}
                          onClick={() => serverId && requestCancellationMutation.mutate({
                            id: serverId,
                            reason: cancellationReason || undefined,
                            mode: 'grace'
                          })}
                          disabled={isSuspended || isTrialEnded || requestCancellationMutation.isPending}
                          data-testid="button-cancel-grace"
                        >
                          {requestCancellationMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Calendar className="h-4 w-4 mr-2" />
                              Schedule Deletion
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </Card>
          </TabsContent>

        </Tabs>
        </div>
        {/* End of main content area */}

      </div>
      {/* End of grid layout (sidebar + main content) */}

      </div>
      {/* End of main wrapper (space-y-6 pb-20) */}

      {/* Password Reset Dialog */}
      <Dialog
        open={passwordResetDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            // Clear state when dialog closes
            setNewPassword(null);
            setPasswordCopied(false);
            setResetAccountPassword("");
            setResetPasswordError("");
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
                      Enter your account password to confirm.
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reset-account-password" className="text-foreground">Account Password</Label>
                <Input
                  id="reset-account-password"
                  type="password"
                  placeholder="Enter your account password"
                  value={resetAccountPassword}
                  onChange={(e) => {
                    setResetAccountPassword(e.target.value);
                    setResetPasswordError("");
                  }}
                  className={cn(
                    "bg-background border-border text-foreground",
                    resetPasswordError && "border-red-500"
                  )}
                />
                {resetPasswordError && (
                  <p className="text-sm text-red-500">{resetPasswordError}</p>
                )}
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 border-border"
                  onClick={() => {
                    setPasswordResetDialogOpen(false);
                    setResetAccountPassword("");
                    setResetPasswordError("");
                  }}
                  data-testid="button-cancel-password-reset"
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => {
                    if (serverId && resetAccountPassword) {
                      passwordResetMutation.mutate({ id: serverId, password: resetAccountPassword });
                    }
                  }}
                  disabled={passwordResetMutation.isPending || !resetAccountPassword}
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

      {/* Password Confirmation Dialog for Immediate Deletion */}
      <Dialog open={showPasswordConfirmDialog} onOpenChange={(open) => {
        if (!open) {
          setShowPasswordConfirmDialog(false);
          setImmediatePassword("");
          setPasswordError("");
        }
      }}>
        <DialogContent className="sm:max-w-md bg-background border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Confirm Destruction
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Enter your account password to permanently destroy <span className="font-semibold text-foreground">{server?.name}</span>. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="destroy-password" className="text-foreground">Account Password</Label>
              <Input
                id="destroy-password"
                type="password"
                value={immediatePassword}
                onChange={(e) => {
                  setImmediatePassword(e.target.value);
                  setPasswordError("");
                }}
                placeholder="Enter your password"
                className="bg-muted/50 border-border text-foreground"
                autoComplete="current-password"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && immediatePassword && !requestCancellationMutation.isPending) {
                    serverId && requestCancellationMutation.mutate({
                      id: serverId,
                      reason: cancellationReason || undefined,
                      mode: 'immediate',
                      password: immediatePassword
                    });
                  }
                }}
              />
              {passwordError && (
                <p className="text-sm text-red-500">{passwordError}</p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowPasswordConfirmDialog(false);
                setImmediatePassword("");
                setPasswordError("");
              }}
              className="border-border text-foreground"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!immediatePassword || requestCancellationMutation.isPending}
              onClick={() => {
                serverId && requestCancellationMutation.mutate({
                  id: serverId,
                  reason: cancellationReason || undefined,
                  mode: 'immediate',
                  password: immediatePassword
                });
              }}
            >
              {requestCancellationMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Destroying...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Destroy Server
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

// ── Reinstall page OS tile ──────────────────────────────────────────────────

function ReinstallOsCard({
  template,
  isSelected,
  onSelect,
}: {
  template: OsTemplateType;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const logoUrl = imgError ? FALLBACK_LOGO : getOsLogoUrl(template);
  const displayVersion = [
    template.version,
    template.variant ? `(${template.variant})` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      onClick={onSelect}
      className={cn(
        "relative flex flex-col items-center gap-2.5 p-4 rounded-xl border-2 transition-all text-center w-full",
        isSelected
          ? "border-primary bg-primary/10 shadow-sm shadow-primary/10"
          : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"
      )}
      data-testid={`button-os-${template.id}`}
    >
      {isSelected && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}
      <img
        src={logoUrl}
        alt={template.name}
        loading="lazy"
        onError={() => setImgError(true)}
        className="w-10 h-10 object-contain"
      />
      <div className="w-full">
        <div className="text-sm font-medium text-foreground leading-tight">
          {template.name}
        </div>
        {displayVersion && (
          <div className="text-xs text-muted-foreground mt-0.5">{displayVersion}</div>
        )}
      </div>
    </button>
  );
}

function ReinstallOsLogo({
  template,
  size = 'md',
}: {
  template: OsTemplateType;
  size?: 'sm' | 'md';
}) {
  const [imgError, setImgError] = useState(false);
  const logoUrl = imgError ? FALLBACK_LOGO : getOsLogoUrl(template);
  const sizeClass = size === 'sm' ? 'w-7 h-7' : 'w-10 h-10';
  return (
    <img
      src={logoUrl}
      alt={template.name}
      loading="lazy"
      onError={() => setImgError(true)}
      className={cn(sizeClass, 'object-contain flex-shrink-0')}
    />
  );
}

