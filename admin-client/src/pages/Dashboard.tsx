import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { healthApi, billingApi, ticketsApi, settingsApi } from "../lib/api";
import { toast } from "sonner";
import {
  Activity,
  Server,
  CreditCard,
  MessageSquare,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  XCircle,
  UserPlus,
  Settings,
} from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    healthy: "bg-[hsl(160_84%_39%)/20] text-[hsl(160_84%_60%)] border border-[hsl(160_84%_39%)/30]",
    degraded: "bg-[hsl(14_100%_60%)/20] text-[hsl(14_100%_70%)] border border-[hsl(14_100%_60%)/30]",
    unhealthy: "bg-[hsl(0_84%_60%)/20] text-[hsl(0_84%_70%)] border border-[hsl(0_84%_60%)/30]",
  };

  const icons: Record<string, typeof CheckCircle> = {
    healthy: CheckCircle,
    degraded: AlertTriangle,
    unhealthy: XCircle,
  };

  const Icon = icons[status] || AlertTriangle;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.degraded}`}>
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  color = "blue",
}: {
  title: string;
  value: string | number;
  icon: typeof Activity;
  trend?: string;
  color?: string;
}) {
  const iconBg: Record<string, string> = {
    blue: "bg-[hsl(210_100%_50%)/15] text-[hsl(210_100%_60%)]",
    green: "bg-[hsl(160_84%_39%)/15] text-[hsl(160_84%_60%)]",
    yellow: "bg-[hsl(14_100%_60%)/15] text-[hsl(14_100%_70%)]",
    purple: "bg-[hsl(270_70%_60%)/15] text-[hsl(270_70%_70%)]",
  };

  const borderAccent: Record<string, string> = {
    blue: "border-t-[hsl(210_100%_50%)/40]",
    green: "border-t-[hsl(160_84%_39%)/40]",
    yellow: "border-t-[hsl(14_100%_60%)/40]",
    purple: "border-t-[hsl(270_70%_60%)/40]",
  };

  return (
    <div className={`bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-6 border-t-2 ${borderAccent[color] || borderAccent.blue}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/40 mb-1">{title}</p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
          {trend && (
            <p className="text-sm text-[hsl(160_84%_60%)] mt-1 flex items-center gap-1">
              <TrendingUp className="h-4 w-4" />
              {trend}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-xl ${iconBg[color] || iconBg.blue}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();

  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ["health"],
    queryFn: healthApi.get,
    refetchInterval: 30000,
  });

  const { data: billingStats } = useQuery({
    queryKey: ["billing-stats"],
    queryFn: billingApi.getStats,
    refetchInterval: 60000,
  });

  const { data: ticketCounts } = useQuery({
    queryKey: ["ticket-counts"],
    queryFn: ticketsApi.getCounts,
    refetchInterval: 60000,
  });

  const { data: registrationSetting } = useQuery({
    queryKey: ["registration-setting"],
    queryFn: settingsApi.getRegistration,
  });

  const toggleRegistrationMutation = useMutation({
    mutationFn: (enabled: boolean) => settingsApi.updateRegistration(enabled),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["registration-setting"] });
      toast.success(`Registration ${data.enabled ? "enabled" : "disabled"}`);
    },
    onError: (err: any) => toast.error(err.message || "Failed to update setting"),
  });

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(cents / 100);
  };

  const openTickets =
    (ticketCounts?.counts?.new || 0) +
    (ticketCounts?.counts?.open || 0) +
    (ticketCounts?.counts?.waiting_admin || 0);

  return (
    <div>
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Monthly Recurring Revenue"
          value={formatCurrency(billingStats?.mrr || 0)}
          icon={CreditCard}
          color="green"
        />
        <StatCard
          title="Active Servers"
          value={billingStats?.statusCounts?.active || 0}
          icon={Server}
          color="blue"
        />
        <StatCard
          title="Open Tickets"
          value={openTickets}
          icon={MessageSquare}
          color="yellow"
        />
        <StatCard
          title="Due Soon (24h)"
          value={billingStats?.dueSoonCount || 0}
          icon={Activity}
          color="purple"
        />
      </div>

      {/* Quick Settings */}
      <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="h-5 w-5 text-white/40" />
          <h2 className="text-base font-semibold text-white">Quick Settings</h2>
        </div>
        <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${registrationSetting?.enabled ? 'bg-[hsl(160_84%_39%)/15]' : 'bg-[hsl(0_84%_60%)/15]'}`}>
              <UserPlus className={`h-5 w-5 ${registrationSetting?.enabled ? 'text-[hsl(160_84%_60%)]' : 'text-[hsl(0_84%_70%)]'}`} />
            </div>
            <div>
              <p className="font-medium text-white">User Registration</p>
              <p className="text-sm text-white/50">
                {registrationSetting?.enabled ? 'New users can create accounts' : 'Registration is disabled'}
              </p>
            </div>
          </div>
          <button
            onClick={() => toggleRegistrationMutation.mutate(!registrationSetting?.enabled)}
            disabled={toggleRegistrationMutation.isPending}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              registrationSetting?.enabled ? 'bg-[hsl(160_84%_39%)]' : 'bg-white/20'
            } ${toggleRegistrationMutation.isPending ? 'opacity-50' : ''}`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                registrationSetting?.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Service Health */}
      <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Service Health</h2>
          {health && <StatusBadge status={health.status} />}
        </div>

        {healthLoading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-white/5 rounded-lg"></div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {health?.services.map((service) => (
              <div
                key={service.name}
                className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    service.status === "healthy" ? "bg-[hsl(160_84%_50%)]" :
                    service.status === "degraded" ? "bg-[hsl(14_100%_60%)]" :
                    "bg-[hsl(0_84%_60%)]"
                  }`} />
                  <span className="font-medium text-white text-sm">{service.name}</span>
                  {service.message && (
                    <span className="text-xs text-white/40">({service.message})</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {service.latencyMs !== undefined && (
                    <span className="text-xs text-white/40">{service.latencyMs}ms</span>
                  )}
                  <StatusBadge status={service.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* System Info */}
      {health?.system && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-6">
            <h3 className="text-xs uppercase tracking-wide text-white/40 mb-3">Memory Usage</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Used</span>
                <span className="font-medium text-white">{health.system.memory.used} MB</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    health.system.memory.usagePercent > 90
                      ? "bg-[hsl(0_84%_60%)]"
                      : health.system.memory.usagePercent > 70
                      ? "bg-[hsl(14_100%_60%)]"
                      : "bg-[hsl(210_100%_50%)]"
                  }`}
                  style={{ width: `${health.system.memory.usagePercent}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-white/40">
                <span>{health.system.memory.usagePercent}% used</span>
                <span>{health.system.memory.total} MB total</span>
              </div>
            </div>
          </div>

          <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-6">
            <h3 className="text-xs uppercase tracking-wide text-white/40 mb-3">CPU Load</h3>
            {(() => {
              const load1m = parseFloat(health.system.cpu.loadAvg["1min"]);
              const cores = health.system.cpu.cores;
              const cpuPercent = Math.min(Math.round((load1m / cores) * 100), 100);
              return (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Load</span>
                    <span className="font-medium text-white">{health.system.cpu.loadAvg["1min"]}</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        cpuPercent > 90
                          ? "bg-[hsl(0_84%_60%)]"
                          : cpuPercent > 70
                          ? "bg-[hsl(14_100%_60%)]"
                          : "bg-[hsl(210_100%_50%)]"
                      }`}
                      style={{ width: `${cpuPercent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-white/40">
                    <span>{cpuPercent}% utilized</span>
                    <span>{cores} cores</span>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-6">
            <h3 className="text-xs uppercase tracking-wide text-white/40 mb-3">Disk Usage</h3>
            {health.system.disk ? (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Used</span>
                  <span className="font-medium text-white">
                    {health.system.disk.total >= 1024
                      ? `${(health.system.disk.used / 1024).toFixed(1)} GB`
                      : `${health.system.disk.used} MB`}
                  </span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      health.system.disk.usagePercent > 90
                        ? "bg-[hsl(0_84%_60%)]"
                        : health.system.disk.usagePercent > 70
                        ? "bg-[hsl(14_100%_60%)]"
                        : "bg-[hsl(210_100%_50%)]"
                    }`}
                    style={{ width: `${health.system.disk.usagePercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-white/40">
                  <span>{health.system.disk.usagePercent}% used</span>
                  <span>
                    {health.system.disk.total >= 1024
                      ? `${(health.system.disk.total / 1024).toFixed(1)} GB`
                      : `${health.system.disk.total} MB`} total
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-white/40">Not available</p>
            )}
          </div>

          <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-6">
            <h3 className="text-xs uppercase tracking-wide text-white/40 mb-3">System Info</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/60">Hostname</span>
                <span className="font-medium text-white">{health.system.hostname}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Platform</span>
                <span className="font-medium text-white">{health.system.platform}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Uptime</span>
                <span className="font-medium text-white">
                  {Math.floor(health.system.uptime / 86400)}d{" "}
                  {Math.floor((health.system.uptime % 86400) / 3600)}h
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Billing Summary */}
      {billingStats && (
        <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">Billing Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Object.entries(billingStats.statusCounts).map(([status, count]) => (
              <div key={status} className="text-center p-3 bg-white/5 rounded-lg">
                <p className="text-2xl font-bold text-white">{count}</p>
                <p className="text-xs text-white/40 capitalize mt-1">{status}</p>
              </div>
            ))}
          </div>
          {billingStats.freeServerCount > 0 && (
            <p className="mt-4 text-sm text-white/40">
              {billingStats.freeServerCount} complimentary server(s)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
