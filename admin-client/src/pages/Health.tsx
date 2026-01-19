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
      healthy: "bg-green-50 border-green-200",
      degraded: "bg-yellow-50 border-yellow-200",
      unhealthy: "bg-red-50 border-red-200",
    };
    return colors[status] || "bg-gray-50 border-gray-200";
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">System Health</h1>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
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
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Services</h2>
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
                        <h3 className="font-medium text-gray-900">{service.name}</h3>
                        {service.message && (
                          <p className="text-sm text-gray-500">{service.message}</p>
                        )}
                      </div>
                    </div>
                    {service.latencyMs !== undefined && (
                      <span className="text-sm text-gray-600">{service.latencyMs}ms</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* System Info */}
          {health.system && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">System Resources</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Memory */}
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Memory</h3>
                  <div className="bg-gray-100 rounded-full h-4 mb-2">
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
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>{health.system.memory.used} MB used</span>
                    <span>{health.system.memory.total} MB total</span>
                  </div>
                </div>

                {/* CPU */}
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">CPU Load Average</h3>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">1 min</span>
                      <span className="font-medium">{health.system.cpu.loadAvg["1min"]}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">5 min</span>
                      <span className="font-medium">{health.system.cpu.loadAvg["5min"]}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">15 min</span>
                      <span className="font-medium">{health.system.cpu.loadAvg["15min"]}</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">{health.system.cpu.cores} CPU cores</p>
                </div>

                {/* System Info */}
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">System</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Hostname</span>
                      <span className="font-medium">{health.system.hostname}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Platform</span>
                      <span className="font-medium">{health.system.platform} ({health.system.arch})</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Uptime</span>
                      <span className="font-medium">
                        {Math.floor(health.system.uptime / 86400)}d{" "}
                        {Math.floor((health.system.uptime % 86400) / 3600)}h{" "}
                        {Math.floor((health.system.uptime % 3600) / 60)}m
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
