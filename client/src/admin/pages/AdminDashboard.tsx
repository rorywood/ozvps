import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "../layout/AdminLayout";
import { StatCard } from "../components/StatCard";
import { Server, HardDrive, Network, Users, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

async function secureFetch(url: string): Promise<Response> {
  return fetch(url, { credentials: 'include' });
}

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
      </div>
    </AdminLayout>
  );
}
