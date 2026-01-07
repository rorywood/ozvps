import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  Server, Cpu, Network, Users, FileText, Loader2, Power, PowerOff, RefreshCw, Trash2,
  AlertTriangle, CheckCircle, Activity, HardDrive, Play, Square, RotateCcw, ArrowRightLeft,
  ChevronDown, ChevronUp, Eye, Ban, ShieldAlert
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
  enabled: boolean;
  maintenance: boolean;
  vmCount: number;
  maxVms: number;
  cpuUsage?: number;
  memoryUsage?: number;
  diskUsage?: number;
  lastSeenAt?: string;
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
  id: number;
  email: string;
  name?: string;
  extRelationId?: string;
  createdAt?: string;
  serversCount?: number;
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

  const { data: hypervisorsData, isLoading: hypervisorsLoading } = useQuery({
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

  const { data: vfUsersData, isLoading: vfUsersLoading } = useQuery({
    queryKey: ['admin', 'vf', 'users'],
    queryFn: async () => {
      const res = await fetch('/api/admin/vf/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      return res.json();
    },
    enabled: isAdmin && activeTab === 'users',
  });

  const { data: auditLogsData, isLoading: auditLogsLoading } = useQuery({
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
                Infrastructure
              </h1>
              <p className="text-muted-foreground text-sm">
                Manage VirtFusion servers, hypervisors, and networking
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
                VF Users
              </TabsTrigger>
              <TabsTrigger value="audit" className="data-[state=active]:bg-primary/20 gap-2" data-testid="tab-audit">
                <FileText className="h-4 w-4" />
                Audit Log
              </TabsTrigger>
            </TabsList>

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
                      label="Total Wallets"
                      value={stats.billing.totalWallets}
                      detail={`$${(stats.billing.totalBalance / 100).toFixed(2)} total balance`}
                      color="green"
                    />
                  </div>

                  <div className="rounded-xl bg-white/[0.02] ring-1 ring-white/5 p-5">
                    <h3 className="text-lg font-semibold text-white mb-4">Hypervisor Status</h3>
                    <div className="space-y-3">
                      {hypervisorsLoading ? (
                        <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
                      ) : hypervisors.length === 0 ? (
                        <p className="text-muted-foreground text-center py-4">No hypervisors found</p>
                      ) : (
                        hypervisors.map((hv) => (
                          <div key={hv.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] ring-1 ring-white/5">
                            <div className="flex items-center gap-3">
                              <div className={`h-3 w-3 rounded-full ${hv.enabled && !hv.maintenance ? 'bg-green-500' : hv.maintenance ? 'bg-yellow-500' : 'bg-red-500'}`} />
                              <div>
                                <p className="font-medium text-white">{hv.name}</p>
                                <p className="text-xs text-muted-foreground">{hv.hostname}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-white">{hv.vmCount}/{hv.maxVms} VMs</p>
                              <p className="text-xs text-muted-foreground">
                                {hv.maintenance ? 'Maintenance' : hv.enabled ? 'Active' : 'Disabled'}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

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
                <div className="space-y-2">
                  {servers.map((server) => (
                    <div
                      key={server.id}
                      className="rounded-lg bg-white/[0.02] ring-1 ring-white/5 p-4 hover:bg-white/[0.04] transition-colors"
                      data-testid={`server-row-${server.id}`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-4">
                          <div className={`h-3 w-3 rounded-full flex-shrink-0 ${
                            server.suspended ? 'bg-red-500' :
                            server.status === 'running' ? 'bg-green-500' :
                            server.status === 'stopped' ? 'bg-gray-500' :
                            'bg-yellow-500'
                          }`} />
                          <div>
                            <p className="font-medium text-white">{server.name || server.hostname}</p>
                            <p className="text-sm text-muted-foreground">
                              {server.primaryIp || 'No IP'} • {server.package?.name || 'Unknown plan'}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Owner: {server.owner?.email || 'Unknown'} (ID: {server.owner?.id || 'N/A'})
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            server.suspended ? 'bg-red-500/10 text-red-400 ring-1 ring-red-500/30' :
                            server.status === 'running' ? 'bg-green-500/10 text-green-400 ring-1 ring-green-500/30' :
                            'bg-gray-500/10 text-gray-400 ring-1 ring-gray-500/30'
                          }`}>
                            {server.suspended ? 'SUSPENDED' : server.status?.toUpperCase()}
                          </span>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              onClick={() => openActionDialog(server, 'start')}
                              disabled={server.status === 'running'}
                              title="Start"
                              data-testid={`button-start-${server.id}`}
                            >
                              <Play className="h-4 w-4 text-green-400" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              onClick={() => openActionDialog(server, 'stop')}
                              disabled={server.status !== 'running'}
                              title="Stop"
                              data-testid={`button-stop-${server.id}`}
                            >
                              <Square className="h-4 w-4 text-yellow-400" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              onClick={() => openActionDialog(server, 'restart')}
                              disabled={server.status !== 'running'}
                              title="Restart"
                              data-testid={`button-restart-${server.id}`}
                            >
                              <RotateCcw className="h-4 w-4 text-blue-400" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              onClick={() => openActionDialog(server, server.suspended ? 'unsuspend' : 'suspend')}
                              title={server.suspended ? 'Unsuspend' : 'Suspend'}
                              data-testid={`button-suspend-${server.id}`}
                            >
                              <Ban className="h-4 w-4 text-orange-400" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              onClick={() => openActionDialog(server, 'transfer')}
                              title="Transfer"
                              data-testid={`button-transfer-${server.id}`}
                            >
                              <ArrowRightLeft className="h-4 w-4 text-purple-400" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              onClick={() => openActionDialog(server, 'delete')}
                              title="Delete"
                              data-testid={`button-delete-${server.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-red-400" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="hypervisors" className="space-y-4">
              {hypervisorsLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : hypervisors.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No hypervisors found
                </div>
              ) : (
                <div className="space-y-3">
                  {hypervisors.map((hv) => (
                    <div
                      key={hv.id}
                      className="rounded-xl bg-white/[0.02] ring-1 ring-white/5 overflow-hidden"
                      data-testid={`hypervisor-card-${hv.id}`}
                    >
                      <button
                        className="w-full p-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                        onClick={() => setExpandedHypervisor(expandedHypervisor === hv.id ? null : hv.id)}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                            hv.enabled && !hv.maintenance ? 'bg-green-500/10' : 
                            hv.maintenance ? 'bg-yellow-500/10' : 'bg-red-500/10'
                          }`}>
                            <HardDrive className={`h-6 w-6 ${
                              hv.enabled && !hv.maintenance ? 'text-green-400' :
                              hv.maintenance ? 'text-yellow-400' : 'text-red-400'
                            }`} />
                          </div>
                          <div className="text-left">
                            <p className="font-semibold text-white">{hv.name}</p>
                            <p className="text-sm text-muted-foreground">{hv.hostname}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="text-lg font-semibold text-white">{hv.vmCount}/{hv.maxVms}</p>
                            <p className="text-xs text-muted-foreground">Virtual Machines</p>
                          </div>
                          {expandedHypervisor === hv.id ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </button>
                      
                      {expandedHypervisor === hv.id && (
                        <div className="px-5 pb-5 border-t border-white/5 pt-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Status</p>
                              <p className={`font-medium ${
                                hv.maintenance ? 'text-yellow-400' :
                                hv.enabled ? 'text-green-400' : 'text-red-400'
                              }`}>
                                {hv.maintenance ? 'Maintenance' : hv.enabled ? 'Active' : 'Disabled'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">CPU Usage</p>
                              <p className="font-medium text-white">{hv.cpuUsage ?? 'N/A'}%</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Memory Usage</p>
                              <p className="font-medium text-white">{hv.memoryUsage ?? 'N/A'}%</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Disk Usage</p>
                              <p className="font-medium text-white">{hv.diskUsage ?? 'N/A'}%</p>
                            </div>
                          </div>
                          {hv.lastSeenAt && (
                            <p className="text-xs text-muted-foreground mt-4">
                              Last seen: {format(new Date(hv.lastSeenAt), 'PPp')}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="networking" className="space-y-4">
              {ipBlocksLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : ipBlocks.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No IP blocks found
                </div>
              ) : (
                <div className="space-y-3">
                  {ipBlocks.map((block) => {
                    const utilization = block.totalAddresses > 0
                      ? Math.round((block.usedAddresses / block.totalAddresses) * 100)
                      : 0;
                    return (
                      <div
                        key={block.id}
                        className="rounded-xl bg-white/[0.02] ring-1 ring-white/5 p-5"
                        data-testid={`ip-block-${block.id}`}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="font-semibold text-white font-mono">{block.cidr}</p>
                            <p className="text-sm text-muted-foreground">Gateway: {block.gateway}</p>
                          </div>
                          <span className={`px-3 py-1 text-xs rounded-full ${
                            block.type === 'ipv4' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'
                          }`}>
                            {block.type.toUpperCase()}
                          </span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Utilization</span>
                            <span className="text-white">{block.usedAddresses}/{block.totalAddresses} ({utilization}%)</span>
                          </div>
                          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                utilization > 90 ? 'bg-red-500' :
                                utilization > 70 ? 'bg-yellow-500' : 'bg-green-500'
                              }`}
                              style={{ width: `${utilization}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="users" className="space-y-4">
              <p className="text-muted-foreground text-sm">
                VirtFusion users (linked to OzVPS accounts via extRelationId)
              </p>
              {vfUsersLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : vfUsers.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No VirtFusion users found
                </div>
              ) : (
                <div className="space-y-2">
                  {vfUsers.map((user) => (
                    <div
                      key={user.id}
                      className="rounded-lg bg-white/[0.02] ring-1 ring-white/5 p-4"
                      data-testid={`vf-user-${user.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-white">{user.email}</p>
                          <p className="text-sm text-muted-foreground">
                            ID: {user.id} • extRelationId: {user.extRelationId || 'None'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-white">{user.serversCount || 0} servers</p>
                          {user.createdAt && (
                            <p className="text-xs text-muted-foreground">
                              Created {format(new Date(user.createdAt), 'PP')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="audit" className="space-y-4">
              <p className="text-muted-foreground text-sm">
                Recent admin actions on infrastructure
              </p>
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
                      className="rounded-lg bg-white/[0.02] ring-1 ring-white/5 p-4"
                      data-testid={`audit-log-${log.id}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            log.status === 'success' ? 'bg-green-500/10' : 'bg-red-500/10'
                          }`}>
                            {log.status === 'success' ? (
                              <CheckCircle className="h-4 w-4 text-green-400" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-red-400" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-white">{log.action}</p>
                            <p className="text-sm text-muted-foreground">
                              {log.targetType} {log.targetId && `#${log.targetId}`}
                            </p>
                            {log.reason && (
                              <p className="text-sm text-amber-400/70 mt-1">
                                Reason: {log.reason}
                              </p>
                            )}
                            {log.errorMessage && (
                              <p className="text-sm text-red-400 mt-1">
                                Error: {log.errorMessage}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm text-white">{log.adminEmail}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(log.createdAt), 'PPp')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent className="bg-zinc-900 border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <ShieldAlert className="h-5 w-5 text-amber-400" />
              Confirm Action: {actionType}
            </DialogTitle>
            <DialogDescription>
              Server: {selectedServer?.name || selectedServer?.hostname} (ID: {selectedServer?.id})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {actionType === 'transfer' && (
              <div className="space-y-2">
                <Label htmlFor="newOwnerId">New Owner VirtFusion ID</Label>
                <Input
                  id="newOwnerId"
                  type="number"
                  placeholder="Enter VirtFusion user ID..."
                  value={transferUserId}
                  onChange={(e) => setTransferUserId(e.target.value)}
                  className="bg-black/20 border-white/10"
                  data-testid="input-transfer-user-id"
                />
              </div>
            )}
            {['delete', 'suspend', 'transfer'].includes(actionType) && (
              <div className="space-y-2">
                <Label htmlFor="reason">Reason (Required)</Label>
                <Textarea
                  id="reason"
                  placeholder="Enter reason for this action..."
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  className="bg-black/20 border-white/10"
                  data-testid="input-action-reason"
                />
              </div>
            )}
            {actionType === 'delete' && (
              <div className="rounded-lg bg-red-500/10 ring-1 ring-red-500/30 p-3 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-400">
                  This action is irreversible. The server and all its data will be permanently deleted.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialogOpen(false)} className="border-white/10">
              Cancel
            </Button>
            <Button
              onClick={handleActionSubmit}
              disabled={serverActionMutation.isPending}
              variant={actionType === 'delete' ? 'destructive' : 'default'}
              data-testid="button-confirm-action"
            >
              {serverActionMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirm {actionType}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  detail,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  detail: string;
  color: 'cyan' | 'purple' | 'amber' | 'green';
}) {
  const colorClasses = {
    cyan: 'bg-cyan-500/10 text-cyan-400',
    purple: 'bg-purple-500/10 text-purple-400',
    amber: 'bg-amber-500/10 text-amber-400',
    green: 'bg-green-500/10 text-green-400',
  };

  return (
    <div className="rounded-xl bg-white/[0.02] ring-1 ring-white/5 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${colorClasses[color]}`}>
          {icon}
        </div>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{detail}</p>
    </div>
  );
}
