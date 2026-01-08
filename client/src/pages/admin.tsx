import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { AppShell } from "@/components/layout/app-shell";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { 
  ShieldCheck, Search, Plus, Minus, AlertTriangle, Loader2, DollarSign, History, 
  User, Link, Shield, Eye, EyeOff, Save, Wallet, Server, Cpu, Network, 
  Users, FileText, Power, RefreshCw, Trash2, CheckCircle, Activity, HardDrive, 
  Play, Square, RotateCcw, ArrowRightLeft, ChevronDown, ChevronUp, Ban, Unlink,
  Globe, MapPin
} from "lucide-react";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { format } from "date-fns";

interface UserMeResponse {
  user: {
    id: number | string;
    email: string;
    name?: string;
    isAdmin?: boolean;
  };
}

interface StatsResponse {
  servers: { total: number; running: number; stopped: number };
  hypervisors: { total: number; enabled: number; maintenance: number };
  networking: { totalIps: number; usedIps: number; availableIps: number; utilization: number };
  billing: { totalWallets: number; totalBalance: number };
}

interface VFServer {
  id: number;
  name: string;
  hostname: string;
  status: string;
  primaryIp?: string;
  suspended?: boolean;
  owner?: { id: number; email: string; name?: string };
  package?: { name: string };
  hypervisor?: { name: string };
  createdAt?: string;
}

interface Hypervisor {
  id: number;
  name: string;
  hostname: string;
  ip: string;
  enabled: boolean;
  maintenance: boolean;
  vmCount: number;
  maxVms: number;
  cpuUsage: number | null;
  memoryUsage: number | null;
  diskUsage: number | null;
  ramTotalMb: number | null;
  ramUsedMb: number | null;
  diskTotalGb: number | null;
  diskUsedGb: number | null;
  lastSeenAt: string | null;
  maxCpu: number;
  maxMemory: number;
  group?: { id: number; name: string };
}

interface IpAllocation {
  id: number;
  address: string;
  type: 'ipv4' | 'ipv6';
  serverId?: number;
  serverName?: string;
  userId?: number;
  blockId: number;
}

interface VFUser {
  virtfusionId: number | null;
  auth0UserId: string;
  email: string;
  name: string;
  virtfusionLinked: boolean;
  status: 'active' | 'deleted';
  serverCount: number;
  balanceCents: number;
  stripeCustomerId?: string;
  created: string;
}

interface AuditLog {
  id: number;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId?: string;
  status: string;
  reason?: string;
  createdAt: string;
  errorMessage?: string;
}

interface AdminUser {
  auth0UserId: string;
  email: string;
  name?: string;
  emailVerified?: boolean;
  virtFusionUserId?: number;
  wallet?: {
    balanceCents: number;
    stripeCustomerId?: string;
  };
}

interface Transaction {
  id: number;
  type: string;
  amountCents: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

function StatCard({ icon, label, value, detail, color }: { 
  icon: React.ReactNode; 
  label: string; 
  value: string | number; 
  detail?: string;
  color: 'cyan' | 'purple' | 'amber' | 'green' | 'red';
}) {
  const colorClasses = {
    cyan: 'bg-cyan-500/10 text-cyan-400',
    purple: 'bg-purple-500/10 text-purple-400',
    amber: 'bg-amber-500/10 text-amber-400',
    green: 'bg-green-500/10 text-green-400',
    red: 'bg-red-500/10 text-red-400',
  };
  
  return (
    <div className="rounded-xl bg-muted/20 ring-1 ring-border p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
          {icon}
        </div>
        <span className="text-muted-foreground text-sm">{label}</span>
      </div>
      <p className="text-3xl font-bold text-foreground">{value}</p>
      {detail && <p className="text-xs text-muted-foreground mt-1">{detail}</p>}
    </div>
  );
}

export default function AdminPage() {
  useDocumentTitle('Admin Center');
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  
  // User lookup state
  const [searchEmail, setSearchEmail] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [adjustType, setAdjustType] = useState<"add" | "remove">("add");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [transactionsDialogOpen, setTransactionsDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [oldExtRelationId, setOldExtRelationId] = useState("");
  
  // Security settings state
  const [recaptchaSiteKey, setRecaptchaSiteKey] = useState("");
  const [recaptchaSecretKey, setRecaptchaSecretKey] = useState("");
  const [recaptchaEnabled, setRecaptchaEnabled] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  
  // Server action state
  const [selectedServer, setSelectedServer] = useState<VFServer | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<string>("");
  const [actionReason, setActionReason] = useState("");
  const [transferUserId, setTransferUserId] = useState("");
  
  // Hypervisor state
  const [expandedHypervisor, setExpandedHypervisor] = useState<number | null>(null);

  const { data: userData, isLoading: userLoading } = useQuery<UserMeResponse>({
    queryKey: ['auth', 'me'],
    queryFn: () => api.getCurrentUser(),
    staleTime: 1000 * 60 * 5,
  });

  const isAdmin = userData?.user?.isAdmin ?? false;

  // Stats query
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<StatsResponse>({
    queryKey: ['admin', 'vf', 'stats'],
    queryFn: async () => {
      const res = await fetch('/api/admin/vf/stats');
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
    enabled: isAdmin,
    refetchInterval: 30000,
  });

  // Servers query (lazy loaded)
  const { data: serversData, isLoading: serversLoading, refetch: refetchServers } = useQuery({
    queryKey: ['admin', 'vf', 'servers'],
    queryFn: async () => {
      const res = await fetch('/api/admin/vf/servers');
      if (!res.ok) throw new Error('Failed to fetch servers');
      return res.json();
    },
    enabled: isAdmin && activeTab === 'servers',
  });

  // Hypervisors query
  const { data: hypervisorsData, isLoading: hypervisorsLoading, refetch: refetchHypervisors } = useQuery({
    queryKey: ['admin', 'vf', 'hypervisors'],
    queryFn: async () => {
      const res = await fetch('/api/admin/vf/hypervisors');
      if (!res.ok) throw new Error('Failed to fetch hypervisors');
      return res.json();
    },
    enabled: isAdmin && (activeTab === 'hypervisors' || activeTab === 'overview'),
  });

  // IP Allocations query (shows IPs with their servers)
  const { data: ipAllocationsData, isLoading: ipAllocationsLoading, refetch: refetchIpAllocations } = useQuery({
    queryKey: ['admin', 'vf', 'ip-allocations'],
    queryFn: async () => {
      const res = await fetch('/api/admin/vf/ip-allocations');
      if (!res.ok) throw new Error('Failed to fetch IP allocations');
      return res.json();
    },
    enabled: isAdmin && activeTab === 'networking',
  });

  // Users query
  const { data: vfUsersData, isLoading: vfUsersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ['admin', 'vf', 'users'],
    queryFn: async () => {
      const res = await fetch('/api/admin/vf/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      return res.json();
    },
    enabled: isAdmin && activeTab === 'users',
  });

  // Audit logs query
  const { data: auditLogsData, isLoading: auditLogsLoading, refetch: refetchAuditLogs } = useQuery({
    queryKey: ['admin', 'audit-logs'],
    queryFn: async () => {
      const res = await fetch('/api/admin/audit-logs?limit=50');
      if (!res.ok) throw new Error('Failed to fetch audit logs');
      return res.json();
    },
    enabled: isAdmin && activeTab === 'audit',
  });

  // reCAPTCHA settings
  const { data: recaptchaData, isLoading: recaptchaLoading } = useQuery({
    queryKey: ['admin', 'recaptcha'],
    queryFn: async () => {
      const response = await fetch('/api/admin/security/recaptcha', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch reCAPTCHA settings');
      return response.json();
    },
    enabled: isAdmin && activeTab === 'security',
  });

  useEffect(() => {
    if (recaptchaData) {
      setRecaptchaSiteKey(recaptchaData.siteKey || '');
      setRecaptchaEnabled(recaptchaData.enabled || false);
    }
  }, [recaptchaData]);

  // Mutations
  const recaptchaMutation = useMutation({
    mutationFn: async (data: { siteKey: string; secretKey: string; enabled: boolean }) => {
      const response = await fetch('/api/admin/security/recaptcha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save reCAPTCHA settings');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('reCAPTCHA settings saved');
      queryClient.invalidateQueries({ queryKey: ['admin', 'recaptcha'] });
      setRecaptchaSecretKey('');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const searchMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await fetch(`/api/admin/users/search?email=${encodeURIComponent(email)}`);
      if (!response.ok) throw new Error('Search failed');
      return response.json();
    },
    onSuccess: (data) => {
      if (data.users?.length > 0) {
        setSelectedUser(data.users[0]);
      } else {
        setSelectedUser(null);
      }
    },
  });

  const adjustMutation = useMutation({
    mutationFn: async (data: { auth0UserId: string; amountCents: number; reason: string }) => {
      const response = await fetch('/api/admin/wallet/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Adjustment failed');
      }
      return response.json();
    },
    onSuccess: () => {
      setAdjustDialogOpen(false);
      setAdjustAmount("");
      setAdjustReason("");
      toast.success('Credit adjustment applied');
      if (searchEmail) {
        searchMutation.mutate(searchEmail);
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'wallets'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'vf', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const linkMutation = useMutation({
    mutationFn: async (data: { auth0UserId: string; oldExtRelationId: string }) => {
      const response = await fetch('/api/admin/link-virtfusion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Link failed');
      }
      return response.json();
    },
    onSuccess: (data) => {
      setLinkDialogOpen(false);
      setOldExtRelationId("");
      toast.success(data.message || 'VirtFusion account linked successfully');
      if (searchEmail) {
        searchMutation.mutate(searchEmail);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const serverActionMutation = useMutation({
    mutationFn: async (params: { serverId: number; action: string; reason?: string; newOwnerId?: number }) => {
      const { serverId, action, reason, newOwnerId } = params;
      let url = `/api/admin/vf/servers/${serverId}`;
      let method = 'POST';
      let body: any = { reason };

      if (action === 'delete') {
        method = 'DELETE';
        url = `/api/admin/vf/servers/${serverId}`;
      } else if (action === 'transfer') {
        url = `/api/admin/vf/servers/${serverId}/transfer`;
        body.newOwnerId = newOwnerId;
      } else if (action === 'suspend') {
        url = `/api/admin/vf/servers/${serverId}/suspend`;
      } else if (action === 'unsuspend') {
        url = `/api/admin/vf/servers/${serverId}/unsuspend`;
      } else {
        url = `/api/admin/vf/servers/${serverId}/power/${action}`;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Action failed');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Server action completed successfully');
      setActionDialogOpen(false);
      setActionReason("");
      setTransferUserId("");
      setSelectedServer(null);
      refetchServers();
      refetchStats();
      queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const { data: transactionsData, isLoading: transactionsLoading } = useQuery({
    queryKey: ['admin', 'transactions', selectedUser?.auth0UserId],
    queryFn: async () => {
      if (!selectedUser?.auth0UserId) return { transactions: [] };
      const response = await fetch(`/api/admin/users/${encodeURIComponent(selectedUser.auth0UserId)}/transactions`);
      if (!response.ok) throw new Error('Failed to fetch transactions');
      return response.json();
    },
    enabled: !!selectedUser?.auth0UserId && transactionsDialogOpen,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchEmail.length >= 3) {
      searchMutation.mutate(searchEmail);
    }
  };

  const handleOpenAdjust = (type: "add" | "remove") => {
    setAdjustType(type);
    setAdjustDialogOpen(true);
  };

  const handleAdjustSubmit = () => {
    if (!selectedUser || !adjustAmount || !adjustReason) return;
    const amountDollars = parseFloat(adjustAmount);
    if (isNaN(amountDollars) || amountDollars <= 0) return;
    const amountCents = Math.round(amountDollars * 100) * (adjustType === "remove" ? -1 : 1);
    adjustMutation.mutate({
      auth0UserId: selectedUser.auth0UserId,
      amountCents,
      reason: adjustReason,
    });
  };

  const handleLinkSubmit = () => {
    if (!selectedUser || !oldExtRelationId.trim()) return;
    linkMutation.mutate({
      auth0UserId: selectedUser.auth0UserId,
      oldExtRelationId: oldExtRelationId.trim(),
    });
  };

  const handleSaveRecaptcha = () => {
    recaptchaMutation.mutate({
      siteKey: recaptchaSiteKey,
      secretKey: recaptchaSecretKey,
      enabled: recaptchaEnabled,
    });
  };

  const openActionDialog = (server: VFServer, action: string) => {
    setSelectedServer(server);
    setActionType(action);
    setActionDialogOpen(true);
  };

  const handleActionSubmit = () => {
    if (!selectedServer) return;
    const requiresReason = ['delete', 'suspend', 'transfer'].includes(actionType);
    if (requiresReason && !actionReason.trim()) {
      toast.error('Reason is required for this action');
      return;
    }
    if (actionType === 'transfer' && !transferUserId) {
      toast.error('New owner ID is required');
      return;
    }
    serverActionMutation.mutate({
      serverId: selectedServer.id,
      action: actionType,
      reason: actionReason || undefined,
      newOwnerId: actionType === 'transfer' ? parseInt(transferUserId) : undefined,
    });
  };

  if (userLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  if (!isAdmin) {
    return <Redirect to="/dashboard" />;
  }

  const servers: VFServer[] = serversData?.servers || [];
  const hypervisors: Hypervisor[] = hypervisorsData?.hypervisors || [];
  const ipAllocations: IpAllocation[] = ipAllocationsData?.allocations || [];
  const vfUsers: VFUser[] = (vfUsersData?.users || []).filter((u: VFUser) => u.status === 'active');
  const auditLogs: AuditLog[] = auditLogsData?.logs || [];

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground">
              Admin Command Center
            </h1>
            <p className="text-muted-foreground text-sm">
              Unified management dashboard
            </p>
          </div>
        </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-muted/50 border border-border mb-6 flex-wrap h-auto gap-1 p-1">
              <TabsTrigger value="overview" className="data-[state=active]:bg-primary/20 gap-2" data-testid="tab-overview">
                <Activity className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="servers" className="data-[state=active]:bg-primary/20 gap-2" data-testid="tab-servers">
                <Server className="h-4 w-4" />
                Servers
              </TabsTrigger>
              <TabsTrigger value="hypervisors" className="data-[state=active]:bg-primary/20 gap-2" data-testid="tab-hypervisors">
                <HardDrive className="h-4 w-4" />
                Hypervisors
              </TabsTrigger>
              <TabsTrigger value="networking" className="data-[state=active]:bg-primary/20 gap-2" data-testid="tab-networking">
                <Network className="h-4 w-4" />
                Networking
              </TabsTrigger>
              <TabsTrigger value="users" className="data-[state=active]:bg-primary/20 gap-2" data-testid="tab-users">
                <Users className="h-4 w-4" />
                Users & Billing
              </TabsTrigger>
              <TabsTrigger value="security" className="data-[state=active]:bg-primary/20 gap-2" data-testid="tab-security">
                <Shield className="h-4 w-4" />
                Security
              </TabsTrigger>
              <TabsTrigger value="audit" className="data-[state=active]:bg-primary/20 gap-2" data-testid="tab-audit">
                <FileText className="h-4 w-4" />
                Audit Log
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              {statsLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : stats && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard
                      icon={<Server className="h-5 w-5" />}
                      label="Total Servers"
                      value={stats.servers.total}
                      detail={`${stats.servers.running} running / ${stats.servers.stopped} stopped`}
                      color="cyan"
                    />
                    <StatCard
                      icon={<HardDrive className="h-5 w-5" />}
                      label="Hypervisors"
                      value={stats.hypervisors.total}
                      detail={`${stats.hypervisors.enabled} enabled / ${stats.hypervisors.maintenance} maintenance`}
                      color="purple"
                    />
                    <StatCard
                      icon={<Network className="h-5 w-5" />}
                      label="IP Utilization"
                      value={`${stats.networking.utilization}%`}
                      detail={`${stats.networking.usedIps}/${stats.networking.totalIps} IPs used`}
                      color="amber"
                    />
                    <StatCard
                      icon={<Users className="h-5 w-5" />}
                      label="Total Users"
                      value={stats.billing.totalWallets}
                      detail={`$${(stats.billing.totalBalance / 100).toFixed(2)} total balance`}
                      color="green"
                    />
                  </div>

                  <div className="rounded-xl bg-muted/20 ring-1 ring-border p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center text-foreground/70">
                          <HardDrive className="h-4 w-4" />
                        </div>
                        <h2 className="text-xl font-semibold text-foreground">Hypervisor Status</h2>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => refetchHypervisors()}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    {hypervisorsLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    ) : hypervisors.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">No hypervisors found</p>
                    ) : (
                      <div className="space-y-3">
                        {hypervisors.map((hv) => (
                          <div key={hv.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/15 ring-1 ring-border">
                            <div className="flex items-center gap-3">
                              <div className={`h-3 w-3 rounded-full ${hv.enabled && !hv.maintenance ? 'bg-green-500' : hv.maintenance ? 'bg-yellow-500' : 'bg-red-500'}`} />
                              <div>
                                <p className="font-medium text-foreground">{hv.name}</p>
                                <p className="text-xs text-muted-foreground">{hv.hostname || hv.ip}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-6 text-sm">
                              <div className="text-center">
                                <p className="text-foreground font-medium">{hv.vmCount}/{hv.maxVms}</p>
                                <p className="text-xs text-muted-foreground">VMs</p>
                              </div>
                              <div className="text-center">
                                <p className="text-foreground font-medium">{hv.memoryUsage !== null ? `${hv.memoryUsage}%` : 'N/A'}</p>
                                <p className="text-xs text-muted-foreground">RAM</p>
                              </div>
                              <div className="text-center">
                                <p className="text-foreground font-medium">{hv.diskUsage !== null ? `${hv.diskUsage}%` : 'N/A'}</p>
                                <p className="text-xs text-muted-foreground">Disk</p>
                              </div>
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                hv.maintenance ? 'bg-yellow-500/20 text-yellow-400' : 
                                hv.enabled ? 'bg-green-500/20 text-green-400' : 
                                'bg-red-500/20 text-red-400'
                              }`}>
                                {hv.maintenance ? 'Maintenance' : hv.enabled ? 'Active' : 'Disabled'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </TabsContent>

            {/* Servers Tab */}
            <TabsContent value="servers" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-sm">
                  {servers.length} servers across all users
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchServers()}
                  className="border-border gap-2"
                  data-testid="button-refresh-servers"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              </div>

              {serversLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : servers.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No servers found
                </div>
              ) : (
                <div className="rounded-xl bg-muted/20 ring-1 ring-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left bg-muted/20">
                          <th className="p-4 text-muted-foreground font-medium">Server</th>
                          <th className="p-4 text-muted-foreground font-medium">Owner</th>
                          <th className="p-4 text-muted-foreground font-medium">Status</th>
                          <th className="p-4 text-muted-foreground font-medium">IP</th>
                          <th className="p-4 text-muted-foreground font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {servers.map((server) => (
                          <tr key={server.id} className="border-b border-border hover:bg-muted/20" data-testid={`server-row-${server.id}`}>
                            <td className="p-4">
                              <p className="font-medium text-foreground">{server.name}</p>
                              <p className="text-xs text-muted-foreground">{server.hostname || `ID: ${server.id}`}</p>
                            </td>
                            <td className="p-4">
                              <p className="text-foreground">{server.owner?.email || 'Unknown'}</p>
                            </td>
                            <td className="p-4">
                              <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded ${
                                server.suspended ? 'bg-red-500/20 text-red-400' :
                                server.status === 'running' ? 'bg-green-500/20 text-green-400' :
                                'bg-yellow-500/20 text-yellow-400'
                              }`}>
                                {server.suspended ? <Ban className="h-3 w-3" /> : server.status === 'running' ? <CheckCircle className="h-3 w-3" /> : <Square className="h-3 w-3" />}
                                {server.suspended ? 'Suspended' : server.status}
                              </span>
                            </td>
                            <td className="p-4 text-muted-foreground font-mono text-xs">
                              {server.primaryIp || '-'}
                            </td>
                            <td className="p-4">
                              <div className="flex items-center justify-end gap-1">
                                {!server.suspended && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => openActionDialog(server, server.status === 'running' ? 'shutdown' : 'boot')}
                                      title={server.status === 'running' ? 'Stop' : 'Start'}
                                    >
                                      {server.status === 'running' ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => openActionDialog(server, 'reboot')}
                                      title="Restart"
                                    >
                                      <RotateCcw className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => openActionDialog(server, server.suspended ? 'unsuspend' : 'suspend')}
                                  title={server.suspended ? 'Unsuspend' : 'Suspend'}
                                >
                                  {server.suspended ? <CheckCircle className="h-3.5 w-3.5 text-green-400" /> : <Ban className="h-3.5 w-3.5 text-yellow-400" />}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => openActionDialog(server, 'transfer')}
                                  title="Transfer"
                                >
                                  <ArrowRightLeft className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-red-400 hover:text-red-300"
                                  onClick={() => openActionDialog(server, 'delete')}
                                  title="Delete"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Hypervisors Tab */}
            <TabsContent value="hypervisors" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-sm">
                  {hypervisors.length} hypervisors
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchHypervisors()}
                  className="border-border gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              </div>

              {hypervisorsLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : hypervisors.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No hypervisors found
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {hypervisors.map((hv) => (
                    <div
                      key={hv.id}
                      className="rounded-xl bg-muted/20 ring-1 ring-border p-5 cursor-pointer hover:bg-muted/20 transition-colors"
                      onClick={() => setExpandedHypervisor(expandedHypervisor === hv.id ? null : hv.id)}
                      data-testid={`hypervisor-card-${hv.id}`}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`h-3 w-3 rounded-full ${hv.enabled && !hv.maintenance ? 'bg-green-500' : hv.maintenance ? 'bg-yellow-500' : 'bg-red-500'}`} />
                          <div>
                            <p className="font-medium text-foreground">{hv.name}</p>
                            <p className="text-xs text-muted-foreground">{hv.hostname || hv.ip}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            hv.maintenance ? 'bg-yellow-500/20 text-yellow-400' : 
                            hv.enabled ? 'bg-green-500/20 text-green-400' : 
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {hv.maintenance ? 'Maintenance' : hv.enabled ? 'Active' : 'Disabled'}
                          </span>
                          {expandedHypervisor === hv.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-3">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">VMs</p>
                          <p className="text-lg font-semibold text-foreground">{hv.vmCount}/{hv.maxVms}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">RAM</p>
                          <p className="text-lg font-semibold text-foreground">{hv.memoryUsage !== null ? `${hv.memoryUsage}%` : 'N/A'}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Disk</p>
                          <p className="text-lg font-semibold text-foreground">{hv.diskUsage !== null ? `${hv.diskUsage}%` : 'N/A'}</p>
                        </div>
                      </div>

                      {expandedHypervisor === hv.id && (
                        <div className="border-t border-border pt-4 mt-4 space-y-4">
                          <div>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-muted-foreground">Memory Usage</span>
                              <span className="text-foreground">
                                {hv.ramUsedMb !== null && hv.ramTotalMb !== null 
                                  ? `${hv.ramUsedMb} / ${hv.ramTotalMb} MB`
                                  : 'Not available'}
                              </span>
                            </div>
                            <Progress value={hv.memoryUsage ?? 0} className="h-2" />
                          </div>
                          <div>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-muted-foreground">Disk Usage</span>
                              <span className="text-foreground">
                                {hv.diskUsedGb !== null && hv.diskTotalGb !== null 
                                  ? `${hv.diskUsedGb} / ${hv.diskTotalGb} GB`
                                  : 'Not available'}
                              </span>
                            </div>
                            <Progress value={hv.diskUsage ?? 0} className="h-2" />
                          </div>
                          <div>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-muted-foreground">CPU Usage</span>
                              <span className="text-foreground">{hv.cpuUsage !== null ? `${hv.cpuUsage}%` : 'Not available'}</span>
                            </div>
                            <Progress value={hv.cpuUsage ?? 0} className="h-2" />
                          </div>
                          {hv.group && (
                            <p className="text-xs text-muted-foreground">
                              Group: {hv.group.name}
                            </p>
                          )}
                          {hv.lastSeenAt && (
                            <p className="text-xs text-muted-foreground">
                              Last seen: {format(new Date(hv.lastSeenAt), 'MMM d, yyyy HH:mm')}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Networking Tab - Shows IPs with their servers */}
            <TabsContent value="networking" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Globe className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">IP Allocations</h2>
                    <p className="text-sm text-muted-foreground">{ipAllocations.length} IP addresses</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchIpAllocations()}
                  className="border-border gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              </div>
              
              {ipAllocationsLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : ipAllocations.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No IP allocations found
                </div>
              ) : (
                <div className="rounded-xl bg-muted/20 ring-1 ring-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left bg-muted/20">
                          <th className="p-4 text-muted-foreground font-medium">IP Address</th>
                          <th className="p-4 text-muted-foreground font-medium">Type</th>
                          <th className="p-4 text-muted-foreground font-medium">Server</th>
                          <th className="p-4 text-muted-foreground font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ipAllocations.map((ip) => (
                          <tr key={ip.id} className="border-b border-border hover:bg-muted/20" data-testid={`ip-row-${ip.id}`}>
                            <td className="p-4">
                              <p className="font-mono text-foreground">{ip.address}</p>
                            </td>
                            <td className="p-4">
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                ip.type === 'ipv4' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-purple-500/20 text-purple-400'
                              }`}>
                                {ip.type.toUpperCase()}
                              </span>
                            </td>
                            <td className="p-4">
                              {ip.serverName ? (
                                <div className="flex items-center gap-2">
                                  <Server className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-foreground">{ip.serverName}</span>
                                  <span className="text-xs text-muted-foreground">(ID: {ip.serverId})</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">Unassigned</span>
                              )}
                            </td>
                            <td className="p-4">
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                ip.serverId ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                              }`}>
                                {ip.serverId ? 'In Use' : 'Available'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Users & Billing Tab */}
            <TabsContent value="users" className="space-y-6">
              {/* Credit Adjustment Section - Prominent */}
              <div className="rounded-xl bg-gradient-to-br from-green-500/10 to-green-500/5 ring-1 ring-green-500/20 p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-green-400" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-foreground">Credit Adjustment</h2>
                    <p className="text-sm text-muted-foreground">Add or remove credits from user wallets. Search for a user below to adjust their balance.</p>
                  </div>
                </div>
                
                <form onSubmit={handleSearch} className="flex gap-3">
                  <Input
                    data-testid="input-admin-search"
                    type="email"
                    placeholder="Enter user email address to manage credits..."
                    value={searchEmail}
                    onChange={(e) => setSearchEmail(e.target.value)}
                    className="flex-1 bg-card/30 border-green-500/20 focus:border-green-500/40"
                  />
                  <Button
                    data-testid="button-admin-search"
                    type="submit"
                    disabled={searchEmail.length < 3 || searchMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {searchMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Search className="h-4 w-4 mr-2" />
                        Find User
                      </>
                    )}
                  </Button>
                </form>
              </div>

              {/* Selected User Card */}
              {selectedUser && (
                <div className="rounded-xl bg-muted/20 ring-1 ring-amber-500/20 overflow-hidden">
                  <div className="p-5 border-b border-border">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                          <User className="h-6 w-6 text-amber-400" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-foreground" data-testid="text-user-email">
                            {selectedUser.email}
                          </h3>
                          {selectedUser.name && (
                            <p className="text-sm text-muted-foreground">{selectedUser.name}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-green-500/10">
                        <Wallet className="h-4 w-4 text-green-500" />
                        <span className="text-lg font-bold text-green-400" data-testid="text-user-balance">
                          ${((selectedUser.wallet?.balanceCents || 0) / 100).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs mb-1">Auth0 ID</p>
                      <p className="font-mono text-xs text-foreground/80 truncate">{selectedUser.auth0UserId}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs mb-1">VirtFusion ID</p>
                      <p className="font-mono text-foreground/80">
                        {selectedUser.virtFusionUserId || <span className="text-yellow-500">Not linked</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs mb-1">Email Verified</p>
                      <p className="text-foreground/80">{selectedUser.emailVerified ? "Yes" : "No"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs mb-1">Stripe Customer</p>
                      <p className="font-mono text-xs text-foreground/80 truncate">
                        {selectedUser.wallet?.stripeCustomerId || "None"}
                      </p>
                    </div>
                  </div>

                  <div className="p-5 border-t border-border flex flex-wrap gap-2">
                    <Button
                      data-testid="button-add-credits"
                      onClick={() => handleOpenAdjust("add")}
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Credits
                    </Button>
                    <Button
                      data-testid="button-remove-credits"
                      onClick={() => handleOpenAdjust("remove")}
                      variant="destructive"
                      size="sm"
                    >
                      <Minus className="h-4 w-4 mr-1" />
                      Remove Credits
                    </Button>
                    <Button
                      data-testid="button-view-transactions"
                      onClick={() => setTransactionsDialogOpen(true)}
                      variant="outline"
                      size="sm"
                      className="border-border"
                    >
                      <History className="h-4 w-4 mr-1" />
                      Transactions
                    </Button>
                    {!selectedUser.virtFusionUserId && (
                      <Button
                        data-testid="button-link-virtfusion"
                        onClick={() => setLinkDialogOpen(true)}
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <Link className="h-4 w-4 mr-1" />
                        Link VirtFusion
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {searchMutation.isSuccess && !selectedUser && (
                <div className="rounded-xl bg-yellow-500/5 ring-1 ring-yellow-500/20 p-5 flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0" />
                  <p className="text-yellow-400">No user found with that email address.</p>
                </div>
              )}

              {/* All Users Table */}
              <div className="rounded-xl bg-muted/20 ring-1 ring-border p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <h2 className="font-semibold text-foreground">All Users</h2>
                      <p className="text-sm text-muted-foreground">{vfUsers.length} active users</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchUsers()}
                    className="border-border gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </Button>
                </div>

                {vfUsersLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : vfUsers.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No users found
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="p-3 text-muted-foreground font-medium">User</th>
                          <th className="p-3 text-muted-foreground font-medium">VirtFusion</th>
                          <th className="p-3 text-muted-foreground font-medium">Servers</th>
                          <th className="p-3 text-muted-foreground font-medium">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vfUsers.map((user, idx) => (
                          <tr key={user.auth0UserId || idx} className="border-b border-border hover:bg-muted/20" data-testid={`user-row-${idx}`}>
                            <td className="p-3">
                              <p className="font-medium text-foreground">{user.name}</p>
                              <p className="text-xs text-muted-foreground">{user.email}</p>
                            </td>
                            <td className="p-3">
                              {user.virtfusionLinked ? (
                                <span className="inline-flex items-center gap-1 text-xs text-green-400">
                                  <Link className="h-3 w-3" />
                                  ID: {user.virtfusionId}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <Unlink className="h-3 w-3" />
                                  Not linked
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-foreground">
                              {user.serverCount}
                            </td>
                            <td className="p-3">
                              <span className={`font-medium font-mono ${user.balanceCents >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                ${(user.balanceCents / 100).toFixed(2)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Security Tab */}
            <TabsContent value="security" className="space-y-6">
              <div className="rounded-xl bg-muted/20 ring-1 ring-border p-5">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="font-medium text-foreground">reCAPTCHA Protection</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Protect login forms from bots with Google reCAPTCHA v2
                    </p>
                  </div>
                  <Switch
                    data-testid="switch-recaptcha-enabled"
                    checked={recaptchaEnabled}
                    onCheckedChange={setRecaptchaEnabled}
                    disabled={recaptchaLoading}
                  />
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="recaptcha-site-key" className="text-sm">Site Key</Label>
                    <Input
                      data-testid="input-recaptcha-site-key"
                      id="recaptcha-site-key"
                      placeholder="6Lc..."
                      value={recaptchaSiteKey}
                      onChange={(e) => setRecaptchaSiteKey(e.target.value)}
                      className="font-mono text-sm bg-card/30 border-border"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="recaptcha-secret-key" className="text-sm">Secret Key</Label>
                    <div className="relative">
                      <Input
                        data-testid="input-recaptcha-secret-key"
                        id="recaptcha-secret-key"
                        type={showSecretKey ? "text" : "password"}
                        placeholder={recaptchaData?.hasSecretKey ? "••••••••••••••••" : "Enter secret key"}
                        value={recaptchaSecretKey}
                        onChange={(e) => setRecaptchaSecretKey(e.target.value)}
                        className="font-mono text-sm pr-10 bg-card/30 border-border"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecretKey(!showSecretKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {recaptchaData?.hasSecretKey && !recaptchaSecretKey && (
                      <p className="text-xs text-muted-foreground">
                        Secret key is already configured. Enter a new key only if you want to change it.
                      </p>
                    )}
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      data-testid="button-save-recaptcha"
                      onClick={handleSaveRecaptcha}
                      disabled={recaptchaMutation.isPending || (recaptchaEnabled && (!recaptchaSiteKey || (!recaptchaSecretKey && !recaptchaData?.hasSecretKey)))}
                      className="gap-2"
                    >
                      {recaptchaMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save Settings
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Audit Log Tab */}
            <TabsContent value="audit" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-sm">
                  Recent admin actions
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchAuditLogs()}
                  className="border-border gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              </div>

              {auditLogsLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No audit logs found
                </div>
              ) : (
                <div className="space-y-2">
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between p-4 rounded-xl bg-muted/20 ring-1 ring-border"
                      data-testid={`audit-log-${log.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                          log.status === 'success' ? 'bg-green-500/20' : 'bg-red-500/20'
                        }`}>
                          {log.status === 'success' ? (
                            <CheckCircle className="h-5 w-5 text-green-400" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 text-red-400" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm text-foreground">
                            <span className="font-medium">{log.action}</span>
                            {log.targetId && (
                              <span className="text-muted-foreground"> on {log.targetType} #{log.targetId}</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            by {log.adminEmail} · {format(new Date(log.createdAt), 'MMM d, yyyy HH:mm')}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {log.reason && (
                          <p className="text-xs text-muted-foreground max-w-xs truncate" title={log.reason}>
                            Reason: {log.reason}
                          </p>
                        )}
                        {log.errorMessage && (
                          <p className="text-xs text-red-400 max-w-xs truncate" title={log.errorMessage}>
                            Error: {log.errorMessage}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>

      {/* Server Action Dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent className="bg-gray-900 border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              {actionType === 'delete' && <Trash2 className="h-5 w-5 text-red-400" />}
              {actionType === 'suspend' && <Ban className="h-5 w-5 text-yellow-400" />}
              {actionType === 'unsuspend' && <CheckCircle className="h-5 w-5 text-green-400" />}
              {actionType === 'transfer' && <ArrowRightLeft className="h-5 w-5 text-blue-400" />}
              {['boot', 'shutdown', 'reboot', 'poweroff'].includes(actionType) && <Power className="h-5 w-5 text-cyan-400" />}
              {actionType.charAt(0).toUpperCase() + actionType.slice(1)} Server
            </DialogTitle>
            <DialogDescription>
              {selectedServer && (
                <span>
                  Performing <strong>{actionType}</strong> on server <strong>{selectedServer.name}</strong>
                  {selectedServer.owner && ` owned by ${selectedServer.owner.email}`}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {actionType === 'transfer' && (
              <div className="space-y-2">
                <Label htmlFor="newOwnerId">New Owner VirtFusion ID</Label>
                <Input
                  id="newOwnerId"
                  value={transferUserId}
                  onChange={(e) => setTransferUserId(e.target.value)}
                  placeholder="Enter VirtFusion user ID"
                  className="bg-muted/50 border-border"
                />
              </div>
            )}

            {['delete', 'suspend', 'transfer'].includes(actionType) && (
              <div className="space-y-2">
                <Label htmlFor="reason">
                  Reason <span className="text-red-400">*</span>
                </Label>
                <Textarea
                  id="reason"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Provide a reason for this action (required for audit)"
                  className="bg-muted/50 border-border min-h-[80px]"
                />
              </div>
            )}

            {actionType === 'delete' && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-sm text-red-400 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  This action is irreversible. The server will be permanently deleted.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setActionDialogOpen(false)}
              className="border-border"
            >
              Cancel
            </Button>
            <Button
              onClick={handleActionSubmit}
              disabled={serverActionMutation.isPending}
              className={actionType === 'delete' ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {serverActionMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirm {actionType.charAt(0).toUpperCase() + actionType.slice(1)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Credits Dialog */}
      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent className="bg-zinc-900 border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <DollarSign className="h-5 w-5 text-amber-400" />
              {adjustType === "add" ? "Add Credits" : "Remove Credits"}
            </DialogTitle>
            <DialogDescription>
              {adjustType === "add"
                ? "Add credits to the user's wallet."
                : "Remove credits from the user's wallet."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>User</Label>
              <p className="text-sm text-foreground">{selectedUser?.email}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (AUD)</Label>
              <Input
                data-testid="input-adjust-amount"
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                className="bg-card/30 border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea
                data-testid="input-adjust-reason"
                id="reason"
                placeholder="Enter reason for adjustment..."
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="bg-card/30 border-border"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialogOpen(false)} className="border-border">
              Cancel
            </Button>
            <Button
              data-testid="button-confirm-adjust"
              onClick={handleAdjustSubmit}
              disabled={!adjustAmount || !adjustReason || adjustMutation.isPending}
              className={adjustType === "add" ? "bg-green-600 hover:bg-green-700" : ""}
              variant={adjustType === "remove" ? "destructive" : "default"}
            >
              {adjustMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {adjustType === "add" ? "Add Credits" : "Remove Credits"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transactions Dialog */}
      <Dialog open={transactionsDialogOpen} onOpenChange={setTransactionsDialogOpen}>
        <DialogContent className="bg-zinc-900 border-border max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <History className="h-5 w-5 text-amber-400" />
              Transaction History
            </DialogTitle>
            <DialogDescription>
              {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {transactionsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
              </div>
            ) : (transactionsData?.transactions || []).length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No transactions found</p>
            ) : (
              <div className="space-y-2">
                {(transactionsData?.transactions || []).map((tx: Transaction) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/20 ring-1 ring-border"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground capitalize">{tx.type.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(tx.createdAt), 'MMM d, yyyy HH:mm')}
                      </p>
                    </div>
                    <span className={`font-mono font-medium ${tx.amountCents >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {tx.amountCents >= 0 ? '+' : ''}${(tx.amountCents / 100).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Link VirtFusion Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="bg-zinc-900 border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Link className="h-5 w-5 text-blue-400" />
              Link VirtFusion Account
            </DialogTitle>
            <DialogDescription>
              Link an existing VirtFusion account to this user by their old external relation ID.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>User</Label>
              <p className="text-sm text-foreground">{selectedUser?.email}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="oldExtRelationId">Old External Relation ID</Label>
              <Input
                id="oldExtRelationId"
                placeholder="e.g., auth0|abc123..."
                value={oldExtRelationId}
                onChange={(e) => setOldExtRelationId(e.target.value)}
                className="bg-card/30 border-border font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                This is the Auth0 user ID that was previously used for this VirtFusion account.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)} className="border-border">
              Cancel
            </Button>
            <Button
              onClick={handleLinkSubmit}
              disabled={!oldExtRelationId.trim() || linkMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {linkMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Link Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </AppShell>
  );
}
