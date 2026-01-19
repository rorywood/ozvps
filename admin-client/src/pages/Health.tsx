import { useQuery } from "@tanstack/react-query";
import { healthApi } from "../lib/api";
import { Activity, CheckCircle, AlertTriangle, XCircle, RefreshCw } from "lucide-react";

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "healthy":
      return <CheckCircle className="h-6 w-6 text-green-600" />;
    case "degraded":
      return <AlertTriangle className="h-6 w-6 text-yellow-600" />;
    case "unhealthy":
      return <XCircle className="h-6 w-6 text-red-600" />;
    default:
      return <AlertTriangle className="h-6 w-6 text-gray-400" />;
  }
}

export default function Health() {
  const { data: health, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["health-detailed"],
    queryFn: healthApi.get,
    refetchInterval: 30000,
  });

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      healthy: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
      degraded: "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800",
      unhealthy: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
    };
    return colors[status] || "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700";
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">System Health</h1>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : health && (
        <div className="space-y-6">
          {/* Overall Status */}
          <div className={`p-6 rounded-xl border-2 ${getStatusColor(health.status)}`}>
            <div className="flex items-center gap-4">
              <StatusIcon status={health.status} />
              <div>
                <h2 className="text-xl font-semibold capitalize">{health.status}</h2>
                <p className="text-sm text-gray-500">
                  Last checked: {new Date(health.timestamp).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Services */}
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Services</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {health.services.map((service) => (
                <div
                  key={service.name}
                  className={`p-4 rounded-lg border ${getStatusColor(service.status)}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <StatusIcon status={service.status} />
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">{service.name}</h3>
                        {service.message && (
                          <p className="text-sm text-gray-500 dark:text-gray-400">{service.message}</p>
                        )}
                      </div>
                    </div>
                    {service.latencyMs !== undefined && (
                      <span className="text-sm text-gray-600 dark:text-gray-400">{service.latencyMs}ms</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* System Resources */}
          {health.system && (
            <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">System Resources</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Memory */}
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Memory</h3>
                  <div className="bg-gray-100 dark:bg-gray-700 rounded-full h-4 mb-2">
                    <div
                      className={`h-4 rounded-full ${
                        health.system.memory.usagePercent > 90
                          ? "bg-red-500"
                          : health.system.memory.usagePercent > 70
                          ? "bg-yellow-500"
                          : "bg-green-500"
                      }`}
                      style={{ width: `${health.system.memory.usagePercent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                    <span>{health.system.memory.used} MB used</span>
                    <span>{health.system.memory.total} MB total</span>
                  </div>
                </div>

                {/* CPU */}
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">CPU Load</h3>
                  {(() => {
                    const load1m = parseFloat(health.system.cpu.loadAvg["1min"]);
                    const cores = health.system.cpu.cores;
                    const cpuPercent = Math.min(Math.round((load1m / cores) * 100), 100);
                    return (
                      <>
                        <div className="bg-gray-100 dark:bg-gray-700 rounded-full h-4 mb-2">
                          <div
                            className={`h-4 rounded-full ${
                              cpuPercent > 90
                                ? "bg-red-500"
                                : cpuPercent > 70
                                ? "bg-yellow-500"
                                : "bg-green-500"
                            }`}
                            style={{ width: `${cpuPercent}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                          <span>Load: {health.system.cpu.loadAvg["1min"]}</span>
                          <span>{cores} cores</span>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Disk Space */}
                {health.system.disk && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Disk Space</h3>
                    <div className="bg-gray-100 dark:bg-gray-700 rounded-full h-4 mb-2">
                      <div
                        className={`h-4 rounded-full ${
                          health.system.disk.usagePercent > 90
                            ? "bg-red-500"
                            : health.system.disk.usagePercent > 70
                            ? "bg-yellow-500"
                            : "bg-green-500"
                        }`}
                        style={{ width: `${health.system.disk.usagePercent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                      <span>{Math.round(health.system.disk.used / 1024)} GB used</span>
                      <span>{Math.round(health.system.disk.total / 1024)} GB total</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Database Stats */}
          {(health as any).database && (
            <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Database</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{(health as any).database.size}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Database Size</p>
                </div>
                <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{(health as any).database.connections}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Active Connections</p>
                </div>
                <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{(health as any).database.tables}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Tables</p>
                </div>
              </div>
            </div>
          )}

          {/* System Info */}
          {health.system && (
            <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">System Info</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Hostname</p>
                  <p className="font-medium text-gray-900 dark:text-white">{health.system.hostname}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Platform</p>
                  <p className="font-medium text-gray-900 dark:text-white">{health.system.platform} ({health.system.arch})</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Uptime</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {Math.floor(health.system.uptime / 86400)}d{" "}
                    {Math.floor((health.system.uptime % 86400) / 3600)}h{" "}
                    {Math.floor((health.system.uptime % 3600) / 60)}m
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">CPU Cores</p>
                  <p className="font-medium text-gray-900 dark:text-white">{health.system.cpu.cores}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
