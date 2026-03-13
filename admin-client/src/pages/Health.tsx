import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { healthApi } from "../lib/api";
import { toast } from "sonner";
import { Activity, CheckCircle, AlertTriangle, XCircle, RefreshCw, Play, Square, RotateCw } from "lucide-react";

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "healthy":
      return <CheckCircle className="h-6 w-6 text-[hsl(160_84%_60%)]" />;
    case "degraded":
      return <AlertTriangle className="h-6 w-6 text-[hsl(14_100%_70%)]" />;
    case "unhealthy":
      return <XCircle className="h-6 w-6 text-[hsl(0_84%_70%)]" />;
    default:
      return <AlertTriangle className="h-6 w-6 text-white/40" />;
  }
}

export default function Health() {
  const queryClient = useQueryClient();

  const { data: health, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["health-detailed"],
    queryFn: healthApi.get,
    refetchInterval: 30000,
  });

  const { data: serviceStatus } = useQuery({
    queryKey: ["service-status"],
    queryFn: healthApi.getServiceStatus,
    refetchInterval: 10000,
  });

  const controlMutation = useMutation({
    mutationFn: ({ service, action }: { service: string; action: "start" | "stop" | "restart" }) =>
      healthApi.controlService(service, action),
    onSuccess: (_data, { service, action }) => {
      toast.success(`${service} ${action}ed successfully`);
      queryClient.invalidateQueries({ queryKey: ["service-status"] });
      queryClient.invalidateQueries({ queryKey: ["health-detailed"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to control service"),
  });

  const getStatusBg = (status: string) => {
    const colors: Record<string, string> = {
      healthy: "bg-[hsl(160_84%_39%)/10] border-[hsl(160_84%_39%)/30]",
      degraded: "bg-[hsl(14_100%_60%)/10] border-[hsl(14_100%_60%)/30]",
      unhealthy: "bg-[hsl(0_84%_60%)/10] border-[hsl(0_84%_60%)/30]",
    };
    return colors[status] || "bg-white/5 border-white/10";
  };

  const serviceDisplayNames: Record<string, string> = {
    postgresql: "PostgreSQL",
    redis: "Redis",
    ozvps: "OzVPS App",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">System Health</h1>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white/70 rounded-lg hover:bg-white/10 hover:text-white transition-colors text-sm"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-white/40" />
        </div>
      ) : health && (
        <div className="space-y-6">
          {/* Overall Status */}
          <div className={`p-6 rounded-xl border-2 ${getStatusBg(health.status)}`}>
            <div className="flex items-center gap-4">
              <StatusIcon status={health.status} />
              <div>
                <h2 className="text-xl font-semibold capitalize text-white">{health.status}</h2>
                <p className="text-sm text-white/50">
                  Last checked: {new Date(health.timestamp).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Service Controls */}
          <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-6">
            <h2 className="text-base font-semibold text-white mb-4">Service Controls</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {["postgresql", "redis", "ozvps"].map((service) => {
                const status = serviceStatus?.services?.[service];
                const isRunning = status?.running;

                return (
                  <div
                    key={service}
                    className={`p-4 rounded-lg border ${isRunning
                      ? "bg-[hsl(160_84%_39%)/10] border-[hsl(160_84%_39%)/30]"
                      : "bg-[hsl(0_84%_60%)/10] border-[hsl(0_84%_60%)/30]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full ${isRunning ? "bg-[hsl(160_84%_60%)]" : "bg-[hsl(0_84%_60%)]"}`} />
                        <div>
                          <h3 className="font-medium text-white text-sm">{serviceDisplayNames[service]}</h3>
                          <p className="text-xs text-white/50">
                            {isRunning ? "Running" : "Stopped"}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {!isRunning && (
                          <button
                            onClick={() => controlMutation.mutate({ service, action: "start" })}
                            disabled={controlMutation.isPending}
                            className="p-1.5 bg-[hsl(160_84%_39%)/20] text-[hsl(160_84%_60%)] rounded-lg hover:bg-[hsl(160_84%_39%)/30] transition-colors"
                            title="Start"
                          >
                            <Play className="h-4 w-4" />
                          </button>
                        )}
                        {isRunning && service !== "postgresql" && (
                          <button
                            onClick={() => controlMutation.mutate({ service, action: "stop" })}
                            disabled={controlMutation.isPending}
                            className="p-1.5 bg-[hsl(0_84%_60%)/20] text-[hsl(0_84%_70%)] rounded-lg hover:bg-[hsl(0_84%_60%)/30] transition-colors"
                            title="Stop"
                          >
                            <Square className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => controlMutation.mutate({ service, action: "restart" })}
                          disabled={controlMutation.isPending}
                          className="p-1.5 bg-[hsl(210_100%_50%)/20] text-[hsl(210_100%_70%)] rounded-lg hover:bg-[hsl(210_100%_50%)/30] transition-colors"
                          title="Restart"
                        >
                          <RotateCw className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* External Services Health */}
          <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-6">
            <h2 className="text-base font-semibold text-white mb-4">External Services</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {health.services.map((service) => (
                <div
                  key={service.name}
                  className={`p-4 rounded-lg border ${getStatusBg(service.status)}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <StatusIcon status={service.status} />
                      <div>
                        <h3 className="font-medium text-white text-sm">{service.name}</h3>
                        {service.message && (
                          <p className="text-xs text-white/50">{service.message}</p>
                        )}
                      </div>
                    </div>
                    {service.latencyMs !== undefined && (
                      <span className="text-xs text-white/50 font-mono">{service.latencyMs}ms</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* System Resources */}
          {health.system && (
            <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-6">
              <h2 className="text-base font-semibold text-white mb-4">System Resources</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Memory */}
                <div>
                  <h3 className="text-xs font-medium text-white/50 uppercase tracking-wide mb-3">Memory</h3>
                  <div className="bg-white/8 rounded-full h-2 mb-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        health.system.memory.usagePercent > 90
                          ? "bg-[hsl(0_84%_60%)]"
                          : health.system.memory.usagePercent > 70
                          ? "bg-[hsl(14_100%_60%)]"
                          : "bg-[hsl(160_84%_39%)]"
                      }`}
                      style={{ width: `${health.system.memory.usagePercent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-white/50">
                    <span>{health.system.memory.used} MB used</span>
                    <span>{health.system.memory.total} MB total</span>
                  </div>
                </div>

                {/* CPU */}
                <div>
                  <h3 className="text-xs font-medium text-white/50 uppercase tracking-wide mb-3">CPU Load</h3>
                  {(() => {
                    const load1m = parseFloat(health.system.cpu.loadAvg["1min"]);
                    const cores = health.system.cpu.cores;
                    const cpuPercent = Math.min(Math.round((load1m / cores) * 100), 100);
                    return (
                      <>
                        <div className="bg-white/8 rounded-full h-2 mb-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              cpuPercent > 90
                                ? "bg-[hsl(0_84%_60%)]"
                                : cpuPercent > 70
                                ? "bg-[hsl(14_100%_60%)]"
                                : "bg-[hsl(160_84%_39%)]"
                            }`}
                            style={{ width: `${cpuPercent}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-white/50">
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
                    <h3 className="text-xs font-medium text-white/50 uppercase tracking-wide mb-3">Disk Space</h3>
                    <div className="bg-white/8 rounded-full h-2 mb-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          health.system.disk.usagePercent > 90
                            ? "bg-[hsl(0_84%_60%)]"
                            : health.system.disk.usagePercent > 70
                            ? "bg-[hsl(14_100%_60%)]"
                            : "bg-[hsl(160_84%_39%)]"
                        }`}
                        style={{ width: `${health.system.disk.usagePercent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-white/50">
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
            <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-6">
              <h2 className="text-base font-semibold text-white mb-4">Database</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-[hsl(210_100%_70%)]">{(health as any).database.size}</p>
                  <p className="text-xs text-white/50 mt-1">Database Size</p>
                </div>
                <div className="text-center p-4 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-[hsl(160_84%_60%)]">{(health as any).database.connections}</p>
                  <p className="text-xs text-white/50 mt-1">Active Connections</p>
                </div>
                <div className="text-center p-4 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-[hsl(280_84%_70%)]">{(health as any).database.tables}</p>
                  <p className="text-xs text-white/50 mt-1">Tables</p>
                </div>
              </div>
            </div>
          )}

          {/* System Info */}
          {health.system && (
            <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-6">
              <h2 className="text-base font-semibold text-white mb-4">System Info</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-white/50 mb-1">Hostname</p>
                  <p className="font-medium text-white font-mono text-xs">{health.system.hostname}</p>
                </div>
                <div>
                  <p className="text-xs text-white/50 mb-1">Platform</p>
                  <p className="font-medium text-white text-xs">{health.system.platform} ({health.system.arch})</p>
                </div>
                <div>
                  <p className="text-xs text-white/50 mb-1">Uptime</p>
                  <p className="font-medium text-white text-xs">
                    {Math.floor(health.system.uptime / 86400)}d{" "}
                    {Math.floor((health.system.uptime % 86400) / 3600)}h{" "}
                    {Math.floor((health.system.uptime % 3600) / 60)}m
                  </p>
                </div>
                <div>
                  <p className="text-xs text-white/50 mb-1">CPU Cores</p>
                  <p className="font-medium text-white text-xs">{health.system.cpu.cores}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
