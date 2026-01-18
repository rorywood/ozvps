import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "../layout/AdminLayout";
import { StatCard } from "../components/StatCard";
import { Server, HardDrive, Network, Users, RefreshCw, Loader2, UserPlus, Webhook, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { secureFetch } from "@/lib/api";

interface StatsResponse {
  servers: { total: number; running: number; stopped: number };
  hypervisors: { total: number; enabled: number; maintenance: number };
  networking: { totalIps: number; usedIps: number; availableIps: number; utilization: number };
  billing: { totalWallets: number; totalBalance: number };
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
  lastSeenAt: string | null;
}

export default function AdminDashboard() {
  const queryClient = useQueryClient();

  // Registration setting query
  const { data: registrationData, isLoading: registrationLoading } = useQuery<{ enabled: boolean }>({
    queryKey: ['admin', 'settings', 'registration'],
    queryFn: async () => {
      const res = await secureFetch('/api/admin/settings/registration');
      if (!res.ok) throw new Error('Failed to fetch registration setting');
      return res.json();
    },
  });

  // Registration toggle mutation
  const toggleRegistrationMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await secureFetch('/api/admin/settings/registration', {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      });
      if (!response.ok) throw new Error('Failed to update registration setting');
      return response.json();
    },
    onSuccess: (data) => {
      toast.success(`Registration ${data.enabled ? 'enabled' : 'disabled'}`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings', 'registration'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<StatsResponse>({
    queryKey: ['admin', 'vf', 'stats'],
    queryFn: async () => {
      const res = await secureFetch('/api/admin/vf/stats');
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: hypervisorsData, isLoading: hypervisorsLoading, refetch: refetchHypervisors } = useQuery({
    queryKey: ['admin', 'vf', 'hypervisors'],
    queryFn: async () => {
      const res = await secureFetch('/api/admin/vf/hypervisors');
      if (!res.ok) throw new Error('Failed to fetch hypervisors');
      return res.json();
    },
  });

  const hypervisors: Hypervisor[] = hypervisorsData?.hypervisors || [];

  // Webhook health query
  const { data: webhookHealth, isLoading: webhookLoading, refetch: refetchWebhook } = useQuery<{
    healthy: boolean;
    lastReceived: string | null;
    lastEvent: string | null;
    totalReceived: number;
    configuredUrl: string;
    message: string;
  }>({
    queryKey: ['admin', 'webhook-health'],
    queryFn: async () => {
      const res = await secureFetch('/api/admin/webhook-health');
      if (!res.ok) throw new Error('Failed to fetch webhook health');
      return res.json();
    },
    refetchInterval: 60000, // Check every minute
  });

  return (
    <AdminLayout title="Admin Dashboard">
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Dashboard</h1>
            <p className="text-slate-400 mt-1">System overview and status</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { refetchStats(); refetchHypervisors(); }}
            className="border-white/10 text-slate-300 hover:text-white hover:bg-white/5"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats Grid */}
        {statsLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
          </div>
        ) : stats && (
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
        )}

        {/* Hypervisor Status */}
        <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-300">
                <HardDrive className="h-4 w-4" />
              </div>
              <h2 className="text-xl font-semibold text-white">Hypervisor Status</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetchHypervisors()}
              className="text-slate-400 hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {hypervisorsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
            </div>
          ) : hypervisors.length === 0 ? (
            <p className="text-slate-500 text-center py-8">No hypervisors found</p>
          ) : (
            <div className="space-y-3">
              {hypervisors.map((hv) => (
                <div key={hv.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 ring-1 ring-white/5">
                  <div className="flex items-center gap-3">
                    <div className={`h-3 w-3 rounded-full ${
                      hv.enabled && !hv.maintenance ? 'bg-green-500' :
                      hv.maintenance ? 'bg-yellow-500' : 'bg-red-500'
                    }`} />
                    <div>
                      <p className="font-medium text-white">{hv.name}</p>
                      <p className="text-xs text-slate-500">{hv.hostname || hv.ip}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <p className="text-white font-medium">{hv.vmCount}/{hv.maxVms}</p>
                      <p className="text-xs text-slate-500">VMs</p>
                    </div>
                    <div className="text-center">
                      <p className="text-white font-medium">{hv.memoryUsage !== null ? `${hv.memoryUsage}%` : 'N/A'}</p>
                      <p className="text-xs text-slate-500">RAM</p>
                    </div>
                    <div className="text-center">
                      <p className="text-white font-medium">{hv.diskUsage !== null ? `${hv.diskUsage}%` : 'N/A'}</p>
                      <p className="text-xs text-slate-500">Disk</p>
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

        {/* Quick Settings */}
        <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-300">
              <UserPlus className="h-4 w-4" />
            </div>
            <h2 className="text-xl font-semibold text-white">Quick Settings</h2>
          </div>

          <div className="space-y-4">
            {/* Registration Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 ring-1 ring-white/5">
              <div>
                <p className="font-medium text-white">User Registration</p>
                <p className="text-xs text-slate-500">Allow new users to create accounts</p>
              </div>
              <div className="flex items-center gap-3">
                {registrationLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                ) : (
                  <>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      registrationData?.enabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {registrationData?.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <Switch
                      checked={registrationData?.enabled ?? false}
                      onCheckedChange={(checked) => toggleRegistrationMutation.mutate(checked)}
                      disabled={toggleRegistrationMutation.isPending}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stripe Webhook Health */}
        <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-300">
                <Webhook className="h-4 w-4" />
              </div>
              <h2 className="text-xl font-semibold text-white">Stripe Webhook</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetchWebhook()}
              className="text-slate-400 hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {webhookLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
            </div>
          ) : webhookHealth ? (
            <div className="space-y-3">
              {/* Status */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 ring-1 ring-white/5">
                <div className="flex items-center gap-3">
                  {webhookHealth.healthy ? (
                    <CheckCircle className="h-5 w-5 text-green-400" />
                  ) : webhookHealth.lastReceived ? (
                    <AlertCircle className="h-5 w-5 text-yellow-400" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-400" />
                  )}
                  <div>
                    <p className="font-medium text-white">Status</p>
                    <p className="text-xs text-slate-500">{webhookHealth.message}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  webhookHealth.healthy ? 'bg-green-500/20 text-green-400' :
                  webhookHealth.lastReceived ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-red-500/20 text-red-400'
                }`}>
                  {webhookHealth.healthy ? 'Healthy' : webhookHealth.lastReceived ? 'Warning' : 'Not Receiving'}
                </span>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-white/5 ring-1 ring-white/5">
                  <p className="text-xs text-slate-500">Total Received</p>
                  <p className="text-lg font-semibold text-white">{webhookHealth.totalReceived}</p>
                </div>
                <div className="p-3 rounded-lg bg-white/5 ring-1 ring-white/5">
                  <p className="text-xs text-slate-500">Last Event</p>
                  <p className="text-sm font-medium text-white truncate">{webhookHealth.lastEvent || 'None'}</p>
                </div>
              </div>

              {/* Last Received */}
              {webhookHealth.lastReceived && (
                <div className="p-3 rounded-lg bg-white/5 ring-1 ring-white/5">
                  <p className="text-xs text-slate-500">Last Received</p>
                  <p className="text-sm font-medium text-white">
                    {new Date(webhookHealth.lastReceived).toLocaleString()}
                  </p>
                </div>
              )}

              {/* Configured URL */}
              <div className="p-3 rounded-lg bg-white/5 ring-1 ring-white/5">
                <p className="text-xs text-slate-500">Configured Endpoint</p>
                <p className="text-xs font-mono text-slate-400 break-all">{webhookHealth.configuredUrl}</p>
              </div>
            </div>
          ) : (
            <p className="text-slate-500 text-center py-8">Failed to load webhook status</p>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
