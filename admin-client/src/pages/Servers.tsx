import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { serversApi } from "../lib/api";
import { toast } from "sonner";
import { Server, Search, Power, Play, Square, RefreshCw, Trash2, AlertTriangle, Globe, User, CreditCard, HardDrive, Cpu, MemoryStick, HardDriveIcon, Plus, Download, X, Loader2, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { virtfusionApi } from "../lib/api";

export default function Servers() {
  const [search, setSearch] = useState("");
  const [selectedServer, setSelectedServer] = useState<any>(null);
  const [showInstallOsModal, setShowInstallOsModal] = useState(false);
  const [selectedOsId, setSelectedOsId] = useState<number | null>(null);
  const [installResult, setInstallResult] = useState<{ password?: string; osName?: string } | null>(null);
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

  const { data: serverStats, isLoading: loadingStats } = useQuery({
    queryKey: ["server-stats", selectedServer?.id],
    queryFn: () => serversApi.getStats(selectedServer.id),
    enabled: !!selectedServer?.id && serverDetails?.server?.status === "running",
    refetchInterval: 15000, // Refresh stats every 15 seconds
  });

  const powerMutation = useMutation({
    mutationFn: ({ serverId, action }: { serverId: number; action: string }) =>
      serversApi.powerAction(serverId, action),
    onSuccess: () => {
      toast.success("Power action sent - status will update shortly");
      // Delay refetch to allow VirtFusion to process the action
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["servers"] });
        queryClient.invalidateQueries({ queryKey: ["server", selectedServer?.id] });
        queryClient.invalidateQueries({ queryKey: ["server-stats", selectedServer?.id] });
      }, 2000);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const refreshServer = () => {
    queryClient.invalidateQueries({ queryKey: ["servers"] });
    if (selectedServer?.id) {
      queryClient.invalidateQueries({ queryKey: ["server", selectedServer.id] });
      queryClient.invalidateQueries({ queryKey: ["server-stats", selectedServer.id] });
    }
  };

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

  const endTrialMutation = useMutation({
    mutationFn: (serverId: number) => serversApi.endTrial(serverId),
    onSuccess: () => {
      toast.success("Trial ended - server has been powered off");
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      queryClient.invalidateQueries({ queryKey: ["server", selectedServer?.id] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to end trial"),
  });

  // Query for OS templates when modal is open
  const { data: osTemplatesData, isLoading: loadingTemplates } = useQuery({
    queryKey: ["os-templates", serverDetails?.billing?.planId],
    queryFn: async () => {
      // Get the VirtFusion package ID from the plan
      if (!serverDetails?.billing?.planId) return { templates: [] };
      // We need to get packages to find the virtfusionPackageId
      const packages = await virtfusionApi.getPackages();
      // For now, get all templates from all packages (simplified)
      // In production, you'd want to get the specific package's templates
      const allTemplates: any[] = [];
      for (const pkg of packages.packages || []) {
        try {
          const templates = await virtfusionApi.getPackageTemplates(pkg.id);
          allTemplates.push(...(templates.templates || []));
        } catch (e) {
          // Ignore errors for packages without templates
        }
      }
      // Deduplicate by ID
      const uniqueTemplates = Array.from(new Map(allTemplates.map(t => [t.id, t])).values());
      return { templates: uniqueTemplates };
    },
    enabled: showInstallOsModal,
  });

  const installOsMutation = useMutation({
    mutationFn: ({ serverId, osId }: { serverId: number; osId: number }) =>
      serversApi.installOs(serverId, osId, undefined, true),
    onSuccess: (data) => {
      toast.success("OS installation started!");
      setInstallResult(data);
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      queryClient.invalidateQueries({ queryKey: ["server", selectedServer?.id] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleInstallOs = () => {
    if (!selectedOsId || !selectedServer) return;
    installOsMutation.mutate({ serverId: selectedServer.id, osId: selectedOsId });
  };

  const closeInstallModal = () => {
    setShowInstallOsModal(false);
    setSelectedOsId(null);
    setInstallResult(null);
  };

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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Servers</h1>
        <Link
          to="/servers/provision"
          className="flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus className="h-5 w-5" />
          Provision Server
        </Link>
      </div>

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
                          {server.primaryIp}
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
                        {selectedServer.primaryIp}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={refreshServer}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                      title="Refresh status"
                    >
                      <RefreshCw className={`h-4 w-4 ${loadingDetails ? 'animate-spin' : ''}`} />
                    </button>
                    <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${getStatusColor(serverDetails?.server?.status || selectedServer.status)}`}>
                      {serverDetails?.server?.status || selectedServer.status}
                    </span>
                  </div>
                </div>

                {loadingDetails ? (
                  <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
                  </div>
                ) : serverDetails && (
                  <div className="space-y-6">
                    {/* Suspension Warning */}
                    {serverDetails.billing?.adminSuspended && (
                      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-red-400">Admin Suspended</p>
                          <p className="text-sm text-red-400/80">{serverDetails.billing.adminSuspendedReason}</p>
                        </div>
                      </div>
                    )}
                    {serverDetails.server?.suspended && !serverDetails.billing?.adminSuspended && (
                      <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-orange-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-orange-400">Suspended in VirtFusion</p>
                          <p className="text-sm text-orange-400/80">This server was suspended directly in VirtFusion (not via admin panel)</p>
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
                            <span className="font-mono text-gray-900 dark:text-white">{serverDetails.server.primaryIp}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-gray-400">Hostname</span>
                            <span className="font-medium text-gray-900 dark:text-white truncate ml-2">{serverDetails.server.hostname}</span>
                          </div>
                        </div>
                      </div>

                      {/* Resource Usage */}
                      <div className="p-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <Cpu className="h-4 w-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Resources</span>
                          {loadingStats && <RefreshCw className="h-3 w-3 animate-spin text-gray-400" />}
                        </div>
                        {serverDetails.server.status !== "running" ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400">Server is not running</p>
                        ) : serverStats?.stats ? (
                          <div className="space-y-3">
                            {/* CPU */}
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-gray-500 dark:text-gray-400">CPU</span>
                                <span className="text-gray-900 dark:text-white">{serverStats.stats.cpu_usage.toFixed(1)}%</span>
                              </div>
                              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    serverStats.stats.cpu_usage > 90
                                      ? "bg-red-500"
                                      : serverStats.stats.cpu_usage > 70
                                      ? "bg-yellow-500"
                                      : "bg-green-500"
                                  }`}
                                  style={{ width: `${Math.min(100, serverStats.stats.cpu_usage)}%` }}
                                />
                              </div>
                            </div>
                            {/* RAM */}
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-gray-500 dark:text-gray-400">RAM</span>
                                <span className="text-gray-900 dark:text-white">
                                  {serverStats.stats.memory_used_mb} / {serverStats.stats.memory_total_mb} MB ({serverStats.stats.ram_usage.toFixed(1)}%)
                                </span>
                              </div>
                              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    serverStats.stats.ram_usage > 90
                                      ? "bg-red-500"
                                      : serverStats.stats.ram_usage > 70
                                      ? "bg-yellow-500"
                                      : "bg-green-500"
                                  }`}
                                  style={{ width: `${Math.min(100, serverStats.stats.ram_usage)}%` }}
                                />
                              </div>
                            </div>
                            {/* Disk */}
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-gray-500 dark:text-gray-400">Disk</span>
                                <span className="text-gray-900 dark:text-white">
                                  {serverStats.stats.disk_used_gb.toFixed(1)} / {serverStats.stats.disk_total_gb.toFixed(1)} GB ({serverStats.stats.disk_usage.toFixed(1)}%)
                                </span>
                              </div>
                              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    serverStats.stats.disk_usage > 90
                                      ? "bg-red-500"
                                      : serverStats.stats.disk_usage > 70
                                      ? "bg-yellow-500"
                                      : "bg-green-500"
                                  }`}
                                  style={{ width: `${Math.min(100, serverStats.stats.disk_usage)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500 dark:text-gray-400">Loading stats...</p>
                        )}
                      </div>

                      {/* Server Specs */}
                      <div className="p-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <HardDrive className="h-4 w-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Specifications</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-sm">
                          <div className="text-center p-2 bg-white dark:bg-gray-900/50 rounded-lg">
                            <div className="text-lg font-bold text-blue-500">{serverDetails.server.plan?.specs?.vcpu || 1}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">vCPU</div>
                          </div>
                          <div className="text-center p-2 bg-white dark:bg-gray-900/50 rounded-lg">
                            <div className="text-lg font-bold text-green-500">
                              {serverDetails.server.plan?.specs?.ram >= 1024
                                ? `${(serverDetails.server.plan.specs.ram / 1024).toFixed(0)} GB`
                                : `${serverDetails.server.plan?.specs?.ram || 1024} MB`}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">RAM</div>
                          </div>
                          <div className="text-center p-2 bg-white dark:bg-gray-900/50 rounded-lg">
                            <div className="text-lg font-bold text-purple-500">{serverDetails.server.plan?.specs?.disk || 20} GB</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Disk</div>
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
                            {serverDetails.billing.isTrial ? (
                              <span className="px-2 py-0.5 text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Trial Server
                              </span>
                            ) : serverDetails.billing.freeServer && (
                              <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 border border-green-500/30 rounded-full">
                                Free Server
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500 dark:text-gray-400 block">Status</span>
                              <span className="font-medium text-gray-900 dark:text-white capitalize">{serverDetails.billing.status}</span>
                            </div>
                            <div>
                              <span className="text-gray-500 dark:text-gray-400 block">
                                {serverDetails.billing.isTrial ? 'Trial Expires' : 'Monthly'}
                              </span>
                              <span className="font-medium text-gray-900 dark:text-white">
                                {serverDetails.billing.isTrial ? (
                                  serverDetails.billing.trialEndedAt ? (
                                    <span className="text-red-400">Ended</span>
                                  ) : serverDetails.billing.trialExpiresAt ? (
                                    <span className="text-amber-400">
                                      {new Date(serverDetails.billing.trialExpiresAt).toLocaleDateString('en-AU', {
                                        day: 'numeric',
                                        month: 'short',
                                        hour: 'numeric',
                                        minute: '2-digit',
                                      })}
                                    </span>
                                  ) : (
                                    <span className="text-amber-400">Trial</span>
                                  )
                                ) : serverDetails.billing.freeServer ? (
                                  <span className="text-green-400">$0.00 (Free)</span>
                                ) : (
                                  `$${(serverDetails.billing.monthlyPriceCents / 100).toFixed(2)}`
                                )}
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
                        {(serverDetails.billing?.adminSuspended || serverDetails.server?.suspended) ? (
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
                        {serverDetails.billing?.isTrial && !serverDetails.billing?.trialEndedAt && (
                          <button
                            onClick={() => {
                              if (confirm("Are you sure you want to end this trial? The server will be powered off.")) {
                                endTrialMutation.mutate(selectedServer.id);
                              }
                            }}
                            disabled={endTrialMutation.isPending}
                            className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                          >
                            <Clock className="h-4 w-4" />
                            End Trial
                          </button>
                        )}
                        <button
                          onClick={() => setShowInstallOsModal(true)}
                          className="flex items-center gap-2 px-4 py-2 bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 rounded-lg hover:bg-purple-500/20 transition-colors"
                        >
                          <Download className="h-4 w-4" />
                          Install OS
                        </button>
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

      {/* Install OS Modal */}
      {showInstallOsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold">Install Operating System</h2>
              <button
                onClick={closeInstallModal}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {installResult ? (
                <div className="space-y-4">
                  <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <p className="font-medium text-green-400 mb-2">OS Installation Started!</p>
                    <p className="text-sm text-gray-400">The server is now installing the operating system. This may take a few minutes.</p>
                  </div>

                  {installResult.password && (
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <label className="text-sm text-gray-400 block mb-1">New Root Password</label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 font-mono text-lg bg-gray-100 dark:bg-gray-900 px-3 py-2 rounded">
                          {installResult.password}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(installResult.password || "");
                            toast.success("Password copied!");
                          }}
                          className="px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                          Copy
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 mt-2">Credentials have been emailed to the user.</p>
                    </div>
                  )}

                  <button
                    onClick={closeInstallModal}
                    className="w-full py-2 bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 transition-opacity"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-400 mb-4">
                    Select an operating system to install on <strong>{selectedServer?.name || `Server ${selectedServer?.id}`}</strong>.
                    This will erase all existing data on the server.
                  </p>

                  {loadingTemplates ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {osTemplatesData?.templates?.map((template: any) => (
                        <button
                          key={template.id}
                          onClick={() => setSelectedOsId(template.id)}
                          className={`w-full text-left p-3 rounded-lg border transition-colors ${
                            selectedOsId === template.id
                              ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                              : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                          }`}
                        >
                          <p className="font-medium">{template.name}</p>
                          {template.description && (
                            <p className="text-sm text-gray-400">{template.description}</p>
                          )}
                        </button>
                      ))}
                      {(!osTemplatesData?.templates || osTemplatesData.templates.length === 0) && (
                        <p className="text-center text-gray-400 py-4">No OS templates available</p>
                      )}
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
                    <button
                      onClick={closeInstallModal}
                      className="flex-1 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleInstallOs}
                      disabled={!selectedOsId || installOsMutation.isPending}
                      className="flex-1 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {installOsMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Installing...
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4" />
                          Install OS
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
