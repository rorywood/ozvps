import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { serversApi } from "../lib/api";
import { toast } from "sonner";
import { Server, Search, Power, Play, Square, RefreshCw, Trash2, AlertTriangle, Globe, User, CreditCard, HardDrive } from "lucide-react";

export default function Servers() {
  const [search, setSearch] = useState("");
  const [selectedServer, setSelectedServer] = useState<any>(null);
  const queryClient = useQueryClient();

  const { data: servers, isLoading } = useQuery({
    queryKey: ["servers", search],
    queryFn: () => serversApi.list(1, 50, search || undefined),
  });

  const { data: serverDetails, isLoading: loadingDetails } = useQuery({
    queryKey: ["server", selectedServer?.id],
    queryFn: () => serversApi.get(selectedServer.id),
    enabled: !!selectedServer?.id,
  });

  const powerMutation = useMutation({
    mutationFn: ({ serverId, action }: { serverId: number; action: string }) =>
      serversApi.powerAction(serverId, action),
    onSuccess: () => {
      toast.success("Power action executed");
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      queryClient.invalidateQueries({ queryKey: ["server", selectedServer?.id] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const suspendMutation = useMutation({
    mutationFn: ({ serverId, reason }: { serverId: number; reason: string }) =>
      serversApi.adminSuspend(serverId, reason),
    onSuccess: () => {
      toast.success("Server suspended");
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      queryClient.invalidateQueries({ queryKey: ["server", selectedServer?.id] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const unsuspendMutation = useMutation({
    mutationFn: (serverId: number) => serversApi.adminUnsuspend(serverId),
    onSuccess: () => {
      toast.success("Server unsuspended");
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      queryClient.invalidateQueries({ queryKey: ["server", selectedServer?.id] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      running: "bg-green-500/20 text-green-400 border border-green-500/30",
      stopped: "bg-gray-500/20 text-gray-400 border border-gray-500/30",
      suspended: "bg-red-500/20 text-red-400 border border-red-500/30",
      installing: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
    };
    return colors[status] || "bg-gray-500/20 text-gray-400 border border-gray-500/30";
  };

  const getStatusDot = (status: string) => {
    const colors: Record<string, string> = {
      running: "bg-green-400",
      stopped: "bg-gray-400",
      suspended: "bg-red-400",
      installing: "bg-yellow-400",
    };
    return colors[status] || "bg-gray-400";
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Servers</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Server List */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-4">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search servers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-500/40 outline-none text-gray-900 dark:text-white placeholder-gray-500"
              />
            </div>

            {isLoading ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {servers?.servers?.map((server: any) => (
                  <button
                    key={server.id}
                    onClick={() => setSelectedServer(server)}
                    className={`w-full text-left p-3 rounded-lg transition-all ${
                      selectedServer?.id === server.id
                        ? "bg-blue-500/10 border border-blue-500/30 dark:bg-blue-500/20"
                        : "bg-gray-50 dark:bg-gray-800/30 hover:bg-gray-100 dark:hover:bg-gray-800/50 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${getStatusDot(server.status)}`} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                          {server.name || `Server ${server.id}`}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                          {server.primaryIpAddress}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
                {servers?.servers?.length === 0 && (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">No servers found</p>
                )}
              </div>
            )}

            {servers?.pagination && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 text-center">
                {servers.pagination.total} server{servers.pagination.total !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>

        {/* Server Details */}
        <div className="lg:col-span-2">
          {selectedServer ? (
            <div className="space-y-6">
              <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                      <HardDrive className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {selectedServer.name || `Server ${selectedServer.id}`}
                      </h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                        {selectedServer.primaryIpAddress}
                      </p>
                    </div>
                  </div>
                  <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${getStatusColor(selectedServer.status)}`}>
                    {selectedServer.status}
                  </span>
                </div>

                {loadingDetails ? (
                  <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
                  </div>
                ) : serverDetails && (
                  <div className="space-y-6">
                    {/* Admin Suspension Warning */}
                    {serverDetails.billing?.adminSuspended && (
                      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-red-400">Admin Suspended</p>
                          <p className="text-sm text-red-400/80">{serverDetails.billing.adminSuspendedReason}</p>
                        </div>
                      </div>
                    )}

                    {/* Server Info Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <Globe className="h-4 w-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Network</span>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-gray-400">IP Address</span>
                            <span className="font-mono text-gray-900 dark:text-white">{serverDetails.server.primaryIpAddress}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-gray-400">Hostname</span>
                            <span className="font-medium text-gray-900 dark:text-white truncate ml-2">{serverDetails.server.hostname}</span>
                          </div>
                        </div>
                      </div>

                      {serverDetails.owner && (
                        <div className="p-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg">
                          <div className="flex items-center gap-2 mb-3">
                            <User className="h-4 w-4 text-gray-400" />
                            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Owner</span>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-500 dark:text-gray-400">Email</span>
                              <span className="font-medium text-gray-900 dark:text-white truncate ml-2">{serverDetails.owner.email}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500 dark:text-gray-400">Name</span>
                              <span className="font-medium text-gray-900 dark:text-white">{serverDetails.owner.name || "Not set"}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {serverDetails.billing && (
                        <div className="p-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg md:col-span-2">
                          <div className="flex items-center gap-2 mb-3">
                            <CreditCard className="h-4 w-4 text-gray-400" />
                            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Billing</span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500 dark:text-gray-400 block">Status</span>
                              <span className="font-medium text-gray-900 dark:text-white capitalize">{serverDetails.billing.status}</span>
                            </div>
                            <div>
                              <span className="text-gray-500 dark:text-gray-400 block">Monthly</span>
                              <span className="font-medium text-gray-900 dark:text-white">
                                ${(serverDetails.billing.monthlyPriceCents / 100).toFixed(2)}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500 dark:text-gray-400 block">Server ID</span>
                              <span className="font-mono text-gray-900 dark:text-white">{serverDetails.server.id}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Power Actions */}
                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Power Actions</h3>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => powerMutation.mutate({ serverId: selectedServer.id, action: "start" })}
                          disabled={powerMutation.isPending}
                          className="flex items-center gap-2 px-4 py-2 bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30 rounded-lg hover:bg-green-500/20 transition-colors disabled:opacity-50"
                        >
                          <Play className="h-4 w-4" />
                          Start
                        </button>
                        <button
                          onClick={() => powerMutation.mutate({ serverId: selectedServer.id, action: "stop" })}
                          disabled={powerMutation.isPending}
                          className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30 rounded-lg hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
                        >
                          <Square className="h-4 w-4" />
                          Stop
                        </button>
                        <button
                          onClick={() => powerMutation.mutate({ serverId: selectedServer.id, action: "restart" })}
                          disabled={powerMutation.isPending}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Restart
                        </button>
                        <button
                          onClick={() => powerMutation.mutate({ serverId: selectedServer.id, action: "kill" })}
                          disabled={powerMutation.isPending}
                          className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        >
                          <Power className="h-4 w-4" />
                          Kill
                        </button>
                      </div>
                    </div>

                    {/* Admin Actions */}
                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Admin Actions</h3>
                      <div className="flex flex-wrap gap-2">
                        {serverDetails.billing?.adminSuspended ? (
                          <button
                            onClick={() => unsuspendMutation.mutate(selectedServer.id)}
                            disabled={unsuspendMutation.isPending}
                            className="flex items-center gap-2 px-4 py-2 bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30 rounded-lg hover:bg-green-500/20 transition-colors disabled:opacity-50"
                          >
                            Unsuspend
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              const reason = prompt("Enter suspension reason:");
                              if (reason) suspendMutation.mutate({ serverId: selectedServer.id, reason });
                            }}
                            disabled={suspendMutation.isPending}
                            className="flex items-center gap-2 px-4 py-2 bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30 rounded-lg hover:bg-orange-500/20 transition-colors disabled:opacity-50"
                          >
                            Suspend
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirm("Are you sure you want to delete this server? This cannot be undone.")) {
                              serversApi.delete(selectedServer.id).then(() => {
                                toast.success("Server deleted");
                                setSelectedServer(null);
                                queryClient.invalidateQueries({ queryKey: ["servers"] });
                              }).catch((err: any) => toast.error(err.message));
                            }
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-12 text-center">
              <div className="inline-flex p-4 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
                <Server className="h-8 w-8 text-gray-400" />
              </div>
              <p className="text-gray-500 dark:text-gray-400">Select a server to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
