import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { serversApi } from "../lib/api";
import { toast } from "sonner";
import { Server, Search, Power, Play, Square, RefreshCw, Trash2, AlertTriangle } from "lucide-react";

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
      running: "bg-green-100 text-green-800",
      stopped: "bg-gray-100 text-gray-800",
      suspended: "bg-red-100 text-red-800",
      installing: "bg-yellow-100 text-yellow-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Servers</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Server List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search servers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
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
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedServer?.id === server.id
                        ? "bg-blue-50 border border-blue-200"
                        : "bg-gray-50 hover:bg-gray-100"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{server.name || `Server ${server.id}`}</p>
                        <p className="text-sm text-gray-500">{server.primaryIpAddress}</p>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(server.status)}`}>
                        {server.status}
                      </span>
                    </div>
                  </button>
                ))}
                {servers?.servers?.length === 0 && (
                  <p className="text-center text-gray-500 py-4">No servers found</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Server Details */}
        <div className="lg:col-span-2">
          {selectedServer ? (
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-gray-900">Server Details</h2>
                  <span className={`px-3 py-1 rounded-full ${getStatusColor(selectedServer.status)}`}>
                    {selectedServer.status}
                  </span>
                </div>

                {loadingDetails ? (
                  <div className="animate-pulse space-y-3">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  </div>
                ) : serverDetails && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">ID</p>
                        <p className="font-medium">{serverDetails.server.id}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Name</p>
                        <p className="font-medium">{serverDetails.server.name}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Hostname</p>
                        <p className="font-medium">{serverDetails.server.hostname}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">IP Address</p>
                        <p className="font-medium">{serverDetails.server.primaryIpAddress}</p>
                      </div>
                      {serverDetails.owner && (
                        <>
                          <div>
                            <p className="text-gray-500">Owner</p>
                            <p className="font-medium">{serverDetails.owner.email}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Owner Name</p>
                            <p className="font-medium">{serverDetails.owner.name || "Not set"}</p>
                          </div>
                        </>
                      )}
                      {serverDetails.billing && (
                        <>
                          <div>
                            <p className="text-gray-500">Billing Status</p>
                            <p className="font-medium capitalize">{serverDetails.billing.status}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Monthly Price</p>
                            <p className="font-medium">
                              ${(serverDetails.billing.monthlyPriceCents / 100).toFixed(2)}
                            </p>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Admin Suspension Warning */}
                    {serverDetails.billing?.adminSuspended && (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                        <div>
                          <p className="font-medium text-red-800">Admin Suspended</p>
                          <p className="text-sm text-red-600">{serverDetails.billing.adminSuspendedReason}</p>
                        </div>
                      </div>
                    )}

                    {/* Power Actions */}
                    <div className="pt-4 border-t">
                      <h3 className="text-sm font-medium text-gray-700 mb-3">Power Actions</h3>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => powerMutation.mutate({ serverId: selectedServer.id, action: "start" })}
                          disabled={powerMutation.isPending}
                          className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
                        >
                          <Play className="h-4 w-4" />
                          Start
                        </button>
                        <button
                          onClick={() => powerMutation.mutate({ serverId: selectedServer.id, action: "stop" })}
                          disabled={powerMutation.isPending}
                          className="flex items-center gap-2 px-4 py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200"
                        >
                          <Square className="h-4 w-4" />
                          Stop
                        </button>
                        <button
                          onClick={() => powerMutation.mutate({ serverId: selectedServer.id, action: "restart" })}
                          disabled={powerMutation.isPending}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Restart
                        </button>
                        <button
                          onClick={() => powerMutation.mutate({ serverId: selectedServer.id, action: "kill" })}
                          disabled={powerMutation.isPending}
                          className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                        >
                          <Power className="h-4 w-4" />
                          Kill
                        </button>
                      </div>
                    </div>

                    {/* Admin Actions */}
                    <div className="pt-4 border-t">
                      <h3 className="text-sm font-medium text-gray-700 mb-3">Admin Actions</h3>
                      <div className="flex flex-wrap gap-2">
                        {serverDetails.billing?.adminSuspended ? (
                          <button
                            onClick={() => unsuspendMutation.mutate(selectedServer.id)}
                            disabled={unsuspendMutation.isPending}
                            className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
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
                            className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
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
                          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
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
            <div className="bg-white rounded-xl shadow-sm p-12 text-center">
              <Server className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Select a server to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
