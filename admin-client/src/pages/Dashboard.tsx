import { useQuery } from "@tanstack/react-query";
import { healthApi, billingApi, ticketsApi } from "../lib/api";
import {
  Activity,
  Server,
  CreditCard,
  MessageSquare,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    healthy: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400",
    degraded: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400",
    unhealthy: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400",
  };

  const icons: Record<string, typeof CheckCircle> = {
    healthy: CheckCircle,
    degraded: AlertTriangle,
    unhealthy: XCircle,
  };

  const Icon = icons[status] || AlertTriangle;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${colors[status] || colors.degraded}`}>
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
  const colorClasses: Record<string, string> = {
    blue: "bg-blue-500",
    green: "bg-green-500",
    yellow: "bg-yellow-500",
    purple: "bg-purple-500",
  };

  return (
    <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
          {trend && (
            <p className="text-sm text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
              <TrendingUp className="h-4 w-4" />
              {trend}
            </p>
          )}
        </div>
        <div className={`${colorClasses[color]} p-3 rounded-lg`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
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
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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

      {/* Service Health */}
      <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Service Health</h2>
          {health && <StatusBadge status={health.status} />}
        </div>

        {healthLoading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded"></div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {health?.services.map((service) => (
              <div
                key={service.name}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-900 dark:text-white">{service.name}</span>
                  {service.message && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">({service.message})</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {service.latencyMs !== undefined && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">{service.latencyMs}ms</span>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Memory Usage</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Used</span>
                <span className="font-medium dark:text-white">{health.system.memory.used} MB</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${health.system.memory.usagePercent}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>{health.system.memory.usagePercent}% used</span>
                <span>{health.system.memory.total} MB total</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">CPU Load</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">1 min avg</span>
                <span className="font-medium dark:text-white">{health.system.cpu.loadAvg["1min"]}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">5 min avg</span>
                <span className="font-medium dark:text-white">{health.system.cpu.loadAvg["5min"]}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">15 min avg</span>
                <span className="font-medium dark:text-white">{health.system.cpu.loadAvg["15min"]}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{health.system.cpu.cores} cores</p>
            </div>
          </div>

          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">System Info</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Hostname</span>
                <span className="font-medium dark:text-white">{health.system.hostname}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Platform</span>
                <span className="font-medium dark:text-white">{health.system.platform}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Uptime</span>
                <span className="font-medium dark:text-white">
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
        <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-6 mt-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Billing Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.entries(billingStats.statusCounts).map(([status, count]) => (
              <div key={status} className="text-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{count}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">{status}</p>
              </div>
            ))}
          </div>
          {billingStats.freeServerCount > 0 && (
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              {billingStats.freeServerCount} complimentary server(s)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
