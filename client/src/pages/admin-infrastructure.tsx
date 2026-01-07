import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  Server, Cpu, Network, Users, FileText, Loader2, Power, PowerOff, RefreshCw, Trash2,
  AlertTriangle, CheckCircle, Activity, HardDrive, Play, Square, RotateCcw, ArrowRightLeft,
  ChevronDown, ChevronUp, Eye, Ban, ShieldAlert, DollarSign, Link, Unlink
} from "lucide-react";
import { format } from "date-fns";

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

interface IpBlock {
  id: number;
  cidr: string;
  gateway: string;
  totalAddresses: number;
  usedAddresses: number;
  type: string;
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
    <div className="rounded-xl bg-white/[0.02] ring-1 ring-white/5 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
          {icon}
        </div>
        <span className="text-muted-foreground text-sm">{label}</span>
      </div>
      <p className="text-3xl font-bold text-white">{value}</p>
      {detail && <p className="text-xs text-muted-foreground mt-1">{detail}</p>}
    </div>
  );
}

function SectionHeader({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center text-white/70">
          {icon}
        </div>
        <h2 className="text-xl font-semibold text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default function AdminInfrastructurePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedServer, setSelectedServer] = useState<VFServer | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<string>("");
  const [actionReason, setActionReason] = useState("");
  const [transferUserId, setTransferUserId] = useState("");
  const [expandedHypervisor, setExpandedHypervisor] = useState<number | null>(null);

  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.getCurrentUser(),
    staleTime: 1000 * 60 * 5,
  });

  const isAdmin = userData?.user?.isAdmin ?? false;

  const { data: stats, isLoading: statsLoading } = useQuery<StatsResponse>({
    queryKey: ['admin', 'vf', 'stats'],
    queryFn: async () => {
      const res = await fetch('/api/admin/vf/stats');
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
    enabled: isAdmin,
    refetchInterval: 30000,
  });

  const { data: serversData, isLoading: serversLoading, refetch: refetchServers } = useQuery({
    queryKey: ['admin', 'vf', 'servers'],
    queryFn: async () => {
      const res = await fetch('/api/admin/vf/servers');
      if (!res.ok) throw new Error('Failed to fetch servers');
      return res.json();
    },
    enabled: isAdmin && activeTab === 'servers',
  });

  const { data: hypervisorsData, isLoading: hypervisorsLoading, refetch: refetchHypervisors } = useQuery({
    queryKey: ['admin', 'vf', 'hypervisors'],
    queryFn: async () => {
      const res = await fetch('/api/admin/vf/hypervisors');
      if (!res.ok) throw new Error('Failed to fetch hypervisors');
      return res.json();
    },
    enabled: isAdmin && (activeTab === 'hypervisors' || activeTab === 'overview'),
  });

  const { data: ipBlocksData, isLoading: ipBlocksLoading } = useQuery({
    queryKey: ['admin', 'vf', 'ip-blocks'],
    queryFn: async () => {
      const res = await fetch('/api/admin/vf/ip-blocks');
      if (!res.ok) throw new Error('Failed to fetch IP blocks');
      return res.json();
    },
    enabled: isAdmin && activeTab === 'networking',
  });

  const { data: vfUsersData, isLoading: vfUsersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ['admin', 'vf', 'users'],
    queryFn: async () => {
      const res = await fetch('/api/admin/vf/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      return res.json();
    },
    enabled: isAdmin && activeTab === 'users',
  });

  const { data: auditLogsData, isLoading: auditLogsLoading, refetch: refetchAuditLogs } = useQuery({
    queryKey: ['admin', 'audit-logs'],
    queryFn: async () => {
      const res = await fetch('/api/admin/audit-logs?limit=50');
      if (!res.ok) throw new Error('Failed to fetch audit logs');
      return res.json();
    },
    enabled: isAdmin && activeTab === 'audit',
  });

  const serverActionMutation = useMutation({
    mutationFn: async (params: { serverId: number; action: string; reason?: string; newOwnerId?: number }) => {
      const { serverId, action, reason, newOwnerId } = params;
      let url = `/api/admin/vf/servers/${serverId}`;
      let method = 'POST';
      let body: any = { reason };

      if (action === 'delete') {
        method = 'DELETE';
      } else if (action === 'transfer') {
        url += '/transfer';
        body.newOwnerId = newOwnerId;
      } else if (action === 'suspend' || action === 'unsuspend') {
        url += `/${action}`;
      } else {
        url += `/power/${action}`;
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
      toast.success(`Server action completed successfully`);
      setActionDialogOpen(false);
      setActionReason("");
      setTransferUserId("");
      setSelectedServer(null);
      refetchServers();
      queryClient.invalidateQueries({ queryKey: ['admin', 'vf', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

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
      <div className="min-h-screen bg-gradient-dark">
        <Sidebar />
        <main className="lg:pl-64 pt-16 lg:pt-0 min-h-screen">
          <div className="p-4 sm:p-6 lg:p-8 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    );
  }

  if (!isAdmin) {
    return <Redirect to="/dashboard" />;
  }

  const servers: VFServer[] = serversData?.servers || [];
  const hypervisors: Hypervisor[] = hypervisorsData?.hypervisors || [];
  const ipBlocks: IpBlock[] = ipBlocksData?.ipBlocks || [];
  const vfUsers: VFUser[] = vfUsersData?.users || [];
  const auditLogs: AuditLog[] = auditLogsData?.logs || [];

  return (
    <div className="min-h-screen bg-gradient-dark">
      <Sidebar />
      <main className="lg:pl-64 pt-16 lg:pt-0 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
              <Cpu className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-white">
                Infrastructure Dashboard
              </h1>
              <p className="text-muted-foreground text-sm">
                Complete VirtFusion management overview
              </p>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-white/5 border border-white/10 mb-6 flex-wrap h-auto gap-1 p-1">
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
                Users
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

                  <div className="rounded-xl bg-white/[0.02] ring-1 ring-white/5 p-5">
                    <SectionHeader icon={<HardDrive className="h-4 w-4" />} title="Hypervisor Status">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => refetchHypervisors()}
                        className="text-muted-foreground hover:text-white"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </SectionHeader>
                    
                    {hypervisorsLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    ) : hypervisors.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">No hypervisors found</p>
                    ) : (
                      <div className="space-y-3">
                        {hypervisors.map((hv) => (
                          <div key={hv.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] ring-1 ring-white/5">
                            <div className="flex items-center gap-3">
                              <div className={`h-3 w-3 rounded-full ${hv.enabled && !hv.maintenance ? 'bg-green-500' : hv.maintenance ? 'bg-yellow-500' : 'bg-red-500'}`} />
                              <div>
                                <p className="font-medium text-white">{hv.name}</p>
                                <p className="text-xs text-muted-foreground">{hv.hostname || hv.ip}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-6 text-sm">
                              <div className="text-center">
                                <p className="text-white font-medium">{hv.vmCount}/{hv.maxVms}</p>
                                <p className="text-xs text-muted-foreground">VMs</p>
                              </div>
                              <div className="text-center">
                                <p className="text-white font-medium">{hv.memoryUsage !== null ? `${hv.memoryUsage}%` : 'N/A'}</p>
                                <p className="text-xs text-muted-foreground">RAM</p>
                              </div>
                              <div className="text-center">
                                <p className="text-white font-medium">{hv.diskUsage !== null ? `${hv.diskUsage}%` : 'N/A'}</p>
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
                  className="border-white/10 gap-2"
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
                <div className="rounded-xl bg-white/[0.02] ring-1 ring-white/5 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left bg-white/[0.02]">
                        <th className="p-4 text-muted-foreground font-medium">Server</th>
                        <th className="p-4 text-muted-foreground font-medium">Owner</th>
                        <th className="p-4 text-muted-foreground font-medium">Status</th>
                        <th className="p-4 text-muted-foreground font-medium">IP</th>
                        <th className="p-4 text-muted-foreground font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {servers.map((server) => (
                        <tr key={server.id} className="border-b border-white/5 hover:bg-white/[0.02]" data-testid={`server-row-${server.id}`}>
                          <td className="p-4">
                            <p className="font-medium text-white">{server.name}</p>
                            <p className="text-xs text-muted-foreground">{server.hostname}</p>
                          </td>
                          <td className="p-4">
                            <p className="text-white">{server.owner?.email || 'Unknown'}</p>
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
                          <td className="p-4 text-muted-foreground">
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
                                    onClick={() => openActionDialog(server, server.status === 'running' ? 'stop' : 'start')}
                                    title={server.status === 'running' ? 'Stop' : 'Start'}
                                  >
                                    {server.status === 'running' ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => openActionDialog(server, 'restart')}
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
                  className="border-white/10 gap-2"
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
                      className="rounded-xl bg-white/[0.02] ring-1 ring-white/5 p-5 cursor-pointer hover:bg-white/[0.04] transition-colors"
                      onClick={() => setExpandedHypervisor(expandedHypervisor === hv.id ? null : hv.id)}
                      data-testid={`hypervisor-card-${hv.id}`}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`h-3 w-3 rounded-full ${hv.enabled && !hv.maintenance ? 'bg-green-500' : hv.maintenance ? 'bg-yellow-500' : 'bg-red-500'}`} />
                          <div>
                            <p className="font-medium text-white">{hv.name}</p>
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
                          <p className="text-lg font-semibold text-white">{hv.vmCount}/{hv.maxVms}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">RAM</p>
                          <p className="text-lg font-semibold text-white">{hv.memoryUsage !== null ? `${hv.memoryUsage}%` : 'N/A'}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Disk</p>
                          <p className="text-lg font-semibold text-white">{hv.diskUsage !== null ? `${hv.diskUsage}%` : 'N/A'}</p>
                        </div>
                      </div>

                      {expandedHypervisor === hv.id && (
                        <div className="border-t border-white/10 pt-4 mt-4 space-y-4">
                          <div>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-muted-foreground">Memory Usage</span>
                              <span className="text-white">
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
                              <span className="text-white">
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
                              <span className="text-white">{hv.cpuUsage !== null ? `${hv.cpuUsage}%` : 'Not available'}</span>
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

            {/* Networking Tab */}
            <TabsContent value="networking" className="space-y-4">
              <SectionHeader icon={<Network className="h-4 w-4" />} title="IP Blocks" />
              
              {ipBlocksLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : ipBlocks.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No IP blocks found
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {ipBlocks.map((block) => {
                    const usagePercent = block.totalAddresses > 0 
                      ? Math.round((block.usedAddresses / block.totalAddresses) * 100) 
                      : 0;
                    return (
                      <div key={block.id} className="rounded-xl bg-white/[0.02] ring-1 ring-white/5 p-5" data-testid={`ip-block-${block.id}`}>
                        <div className="flex items-center justify-between mb-3">
                          <p className="font-medium text-white">{block.cidr}</p>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            block.type === 'ipv4' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-purple-500/20 text-purple-400'
                          }`}>
                            {block.type.toUpperCase()}
                          </span>
                        </div>
                        <div className="mb-3">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">Usage</span>
                            <span className="text-white">{block.usedAddresses}/{block.totalAddresses} ({usagePercent}%)</span>
                          </div>
                          <Progress value={usagePercent} className="h-2" />
                        </div>
                        <p className="text-xs text-muted-foreground">Gateway: {block.gateway}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Users Tab */}
            <TabsContent value="users" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-sm">
                  {vfUsers.length} users
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchUsers()}
                  className="border-white/10 gap-2"
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
                <div className="rounded-xl bg-white/[0.02] ring-1 ring-white/5 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left bg-white/[0.02]">
                        <th className="p-4 text-muted-foreground font-medium">User</th>
                        <th className="p-4 text-muted-foreground font-medium">VirtFusion</th>
                        <th className="p-4 text-muted-foreground font-medium">Servers</th>
                        <th className="p-4 text-muted-foreground font-medium">Balance</th>
                        <th className="p-4 text-muted-foreground font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vfUsers.map((user, idx) => (
                        <tr key={user.auth0UserId || idx} className="border-b border-white/5 hover:bg-white/[0.02]" data-testid={`user-row-${idx}`}>
                          <td className="p-4">
                            <p className="font-medium text-white">{user.name}</p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          </td>
                          <td className="p-4">
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
                          <td className="p-4 text-white">
                            {user.serverCount}
                          </td>
                          <td className="p-4">
                            <span className={`font-medium ${user.balanceCents >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              ${(user.balanceCents / 100).toFixed(2)}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              user.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                            }`}>
                              {user.status === 'active' ? 'Active' : 'Deleted'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
                  className="border-white/10 gap-2"
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
                      className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] ring-1 ring-white/5"
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
                          <p className="text-sm text-white">
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
        </div>
      </main>

      {/* Action Dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent className="bg-gray-900 border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              {actionType === 'delete' && <Trash2 className="h-5 w-5 text-red-400" />}
              {actionType === 'suspend' && <Ban className="h-5 w-5 text-yellow-400" />}
              {actionType === 'unsuspend' && <CheckCircle className="h-5 w-5 text-green-400" />}
              {actionType === 'transfer' && <ArrowRightLeft className="h-5 w-5 text-blue-400" />}
              {['start', 'stop', 'restart', 'poweroff'].includes(actionType) && <Power className="h-5 w-5 text-cyan-400" />}
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
                  className="bg-white/5 border-white/10"
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
                  className="bg-white/5 border-white/10 min-h-[80px]"
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
              className="border-white/10"
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
    </div>
  );
}
