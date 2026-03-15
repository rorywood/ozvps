import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { serversApi } from "../lib/api";
import { toast } from "sonner";
import { Server, Search, Power, Play, Square, RefreshCw, Trash2, AlertTriangle, Globe, User, CreditCard, HardDrive, Cpu, MemoryStick, HardDriveIcon, Plus, Download, X, Loader2, Clock, DollarSign } from "lucide-react";
import { Link } from "react-router-dom";
import { virtfusionApi } from "../lib/api";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { PromptDialog } from "../components/ui/prompt-dialog";

export default function Servers() {
  const [search, setSearch] = useState("");
  const [selectedServer, setSelectedServer] = useState<any>(null);
  const [showInstallOsModal, setShowInstallOsModal] = useState(false);
  const [selectedOsId, setSelectedOsId] = useState<number | null>(null);
  const [installResult, setInstallResult] = useState<{ password?: string; osName?: string } | null>(null);
  const [showConvertTrialModal, setShowConvertTrialModal] = useState(false);
  const [convertPrice, setConvertPrice] = useState("");
  const [convertBillingDate, setConvertBillingDate] = useState("");

  // Dialog states replacing native dialogs
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [showEndTrialDialog, setShowEndTrialDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

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
    refetchInterval: 15000,
  });

  const powerMutation = useMutation({
    mutationFn: ({ serverId, action }: { serverId: number; action: string }) =>
      serversApi.powerAction(serverId, action),
    onSuccess: () => {
      toast.success("Power action sent - status will update shortly");
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

  const convertTrialMutation = useMutation({
    mutationFn: ({ serverId, monthlyPriceCents, nextBillingDate }: { serverId: number; monthlyPriceCents: number; nextBillingDate?: string }) =>
      serversApi.convertTrial(serverId, monthlyPriceCents, nextBillingDate),
    onSuccess: (data) => {
      toast.success(data.poweredOn ? "Trial converted to paid - server has been powered on" : "Trial converted to paid");
      setShowConvertTrialModal(false);
      setConvertPrice("");
      setConvertBillingDate("");
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      queryClient.invalidateQueries({ queryKey: ["server", selectedServer?.id] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to convert trial"),
  });

  const { data: osTemplatesData, isLoading: loadingTemplates } = useQuery({
    queryKey: ["os-templates", serverDetails?.billing?.planId],
    queryFn: async () => {
      if (!serverDetails?.billing?.planId) return { templates: [] };
      const packages = await virtfusionApi.getPackages();
      const allTemplates: any[] = [];
      for (const pkg of packages.packages || []) {
        try {
          const templates = await virtfusionApi.getPackageTemplates(pkg.id);
          allTemplates.push(...(templates.templates || []));
        } catch (e) {
          // Ignore errors for packages without templates
        }
      }
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
      running: "bg-[hsl(160_84%_39%)/20] text-[hsl(160_84%_60%)] border border-[hsl(160_84%_39%)/30]",
      stopped: "bg-white/10 text-white/60 border border-white/10",
      suspended: "bg-[hsl(0_84%_60%)/20] text-[hsl(0_84%_70%)] border border-[hsl(0_84%_60%)/30]",
      installing: "bg-[hsl(14_100%_60%)/20] text-[hsl(14_100%_70%)] border border-[hsl(14_100%_60%)/30]",
    };
    return colors[status] || "bg-white/10 text-white/60 border border-white/10";
  };

  const getStatusDot = (status: string) => {
    const colors: Record<string, string> = {
      running: "bg-[hsl(160_84%_50%)]",
      stopped: "bg-white/40",
      suspended: "bg-[hsl(0_84%_60%)]",
      installing: "bg-[hsl(14_100%_60%)]",
    };
    return colors[status] || "bg-white/40";
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Servers</h1>
        <Link
          to="/servers/provision"
          className="flex items-center gap-2 px-4 py-2 bg-[hsl(210_100%_50%)] text-white rounded-lg hover:bg-[hsl(210_100%_45%)] transition-colors"
        >
          <Plus className="h-5 w-5" />
          Provision Server
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Server List */}
        <div className="lg:col-span-1">
          <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-4">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
              <input
                type="text"
                placeholder="Search servers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-[hsl(210_100%_50%)/40] outline-none text-white placeholder-white/30 transition-colors"
              />
            </div>

            {isLoading ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-white/40" />
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
                {servers?.servers?.map((server: any) => (
                  <button
                    key={server.id}
                    onClick={() => setSelectedServer(server)}
                    className={`w-full text-left p-3 rounded-lg transition-all ${
                      selectedServer?.id === server.id
                        ? "bg-[hsl(210_100%_50%)/10] border border-[hsl(210_100%_50%)/30]"
                        : "bg-white/3 hover:bg-white/5 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusDot(server.status)}`} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-white truncate">
                          {server.name || `Server ${server.id}`}
                        </p>
                        <p className="text-sm text-white/50 font-mono">
                          {server.primaryIp}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
                {servers?.servers?.length === 0 && (
                  <p className="text-center text-white/40 py-8">No servers found</p>
                )}
              </div>
            )}

            {servers?.pagination && (
              <div className="mt-4 pt-4 border-t border-white/8 text-sm text-white/40 text-center">
                {servers.pagination.total} server{servers.pagination.total !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>

        {/* Server Details */}
        <div className="lg:col-span-2">
          {selectedServer ? (
            <div className="space-y-6">
              <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-[hsl(210_100%_50%)/10] rounded-lg">
                      <HardDrive className="h-5 w-5 text-[hsl(210_100%_60%)]" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">
                        {selectedServer.name || `Server ${selectedServer.id}`}
                      </h2>
                      <p className="text-sm text-white/50 font-mono">
                        {selectedServer.primaryIp}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={refreshServer}
                      className="p-1.5 text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
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
                    <div className="h-4 bg-white/10 rounded w-3/4"></div>
                    <div className="h-4 bg-white/10 rounded w-1/2"></div>
                    <div className="h-4 bg-white/10 rounded w-2/3"></div>
                  </div>
                ) : serverDetails && (
                  <div className="space-y-6">
                    {/* Suspension Warning */}
                    {serverDetails.billing?.adminSuspended && (
                      <div className="p-4 bg-[hsl(0_84%_60%)/10] border border-[hsl(0_84%_60%)/30] rounded-lg flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-[hsl(0_84%_70%)] mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-[hsl(0_84%_70%)]">Admin Suspended</p>
                          <p className="text-sm text-[hsl(0_84%_70%)/80]">{serverDetails.billing.adminSuspendedReason}</p>
                        </div>
                      </div>
                    )}
                    {serverDetails.server?.suspended && !serverDetails.billing?.adminSuspended && (
                      <div className="p-4 bg-[hsl(14_100%_60%)/10] border border-[hsl(14_100%_60%)/30] rounded-lg flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-[hsl(14_100%_70%)] mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-[hsl(14_100%_70%)]">Suspended in VirtFusion</p>
                          <p className="text-sm text-[hsl(14_100%_70%)/80]">This server was suspended directly in VirtFusion (not via admin panel)</p>
                        </div>
                      </div>
                    )}

                    {/* Server Info Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-white/5 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <Globe className="h-4 w-4 text-white/40" />
                          <span className="text-sm font-medium text-white/60">Network</span>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-white/50">IP Address</span>
                            <span className="font-mono text-white">{serverDetails.server.primaryIp}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/50">Hostname</span>
                            <span className="font-medium text-white truncate ml-2">{serverDetails.server.hostname}</span>
                          </div>
                        </div>
                      </div>

                      {/* Resource Usage */}
                      <div className="p-4 bg-white/5 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <Cpu className="h-4 w-4 text-white/40" />
                          <span className="text-sm font-medium text-white/60">Resources</span>
                          {loadingStats && <RefreshCw className="h-3 w-3 animate-spin text-white/40" />}
                        </div>
                        {serverDetails.server.status !== "running" ? (
                          <p className="text-sm text-white/40">Server is not running</p>
                        ) : serverStats?.stats ? (
                          <div className="space-y-3">
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-white/50">CPU</span>
                                <span className="text-white">{serverStats.stats.cpu_usage.toFixed(1)}%</span>
                              </div>
                              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    serverStats.stats.cpu_usage > 90 ? "bg-[hsl(0_84%_60%)]" :
                                    serverStats.stats.cpu_usage > 70 ? "bg-[hsl(14_100%_60%)]" :
                                    "bg-[hsl(160_84%_50%)]"
                                  }`}
                                  style={{ width: `${Math.min(100, serverStats.stats.cpu_usage)}%` }}
                                />
                              </div>
                            </div>
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-white/50">RAM</span>
                                <span className="text-white">
                                  {serverStats.stats.memory_used_mb} / {serverStats.stats.memory_total_mb} MB ({serverStats.stats.ram_usage.toFixed(1)}%)
                                </span>
                              </div>
                              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    serverStats.stats.ram_usage > 90 ? "bg-[hsl(0_84%_60%)]" :
                                    serverStats.stats.ram_usage > 70 ? "bg-[hsl(14_100%_60%)]" :
                                    "bg-[hsl(160_84%_50%)]"
                                  }`}
                                  style={{ width: `${Math.min(100, serverStats.stats.ram_usage)}%` }}
                                />
                              </div>
                            </div>
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-white/50">Disk</span>
                                <span className="text-white">
                                  {serverStats.stats.disk_used_gb.toFixed(1)} / {serverStats.stats.disk_total_gb.toFixed(1)} GB ({serverStats.stats.disk_usage.toFixed(1)}%)
                                </span>
                              </div>
                              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    serverStats.stats.disk_usage > 90 ? "bg-[hsl(0_84%_60%)]" :
                                    serverStats.stats.disk_usage > 70 ? "bg-[hsl(14_100%_60%)]" :
                                    "bg-[hsl(160_84%_50%)]"
                                  }`}
                                  style={{ width: `${Math.min(100, serverStats.stats.disk_usage)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-white/40">Loading stats...</p>
                        )}
                      </div>

                      {/* Server Specs */}
                      <div className="p-4 bg-white/5 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <HardDrive className="h-4 w-4 text-white/40" />
                          <span className="text-sm font-medium text-white/60">Specifications</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-sm">
                          <div className="text-center p-2 bg-white/5 rounded-lg">
                            <div className="text-lg font-bold text-[hsl(210_100%_60%)]">{serverDetails.server.plan?.specs?.vcpu || 1}</div>
                            <div className="text-xs text-white/40">vCPU</div>
                          </div>
                          <div className="text-center p-2 bg-white/5 rounded-lg">
                            <div className="text-lg font-bold text-[hsl(160_84%_60%)]">
                              {serverDetails.server.plan?.specs?.ram >= 1024
                                ? `${(serverDetails.server.plan.specs.ram / 1024).toFixed(0)} GB`
                                : `${serverDetails.server.plan?.specs?.ram || 1024} MB`}
                            </div>
                            <div className="text-xs text-white/40">RAM</div>
                          </div>
                          <div className="text-center p-2 bg-white/5 rounded-lg">
                            <div className="text-lg font-bold text-[hsl(270_70%_70%)]">{serverDetails.server.plan?.specs?.disk || 20} GB</div>
                            <div className="text-xs text-white/40">Disk</div>
                          </div>
                        </div>
                      </div>

                      {serverDetails.owner && (
                        <div className="p-4 bg-white/5 rounded-lg">
                          <div className="flex items-center gap-2 mb-3">
                            <User className="h-4 w-4 text-white/40" />
                            <span className="text-sm font-medium text-white/60">Owner</span>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-white/50">Email</span>
                              <span className="font-medium text-white truncate ml-2">{serverDetails.owner.email}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-white/50">Name</span>
                              <span className="font-medium text-white">{serverDetails.owner.name || "Not set"}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {serverDetails.billing && (
                        <div className="p-4 bg-white/5 rounded-lg md:col-span-2">
                          <div className="flex items-center gap-2 mb-3">
                            <CreditCard className="h-4 w-4 text-white/40" />
                            <span className="text-sm font-medium text-white/60">Billing</span>
                            {serverDetails.billing.isTrial ? (
                              <span className="px-2 py-0.5 text-xs bg-[hsl(14_100%_60%)/20] text-[hsl(14_100%_70%)] border border-[hsl(14_100%_60%)/30] rounded-full flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Trial Server
                              </span>
                            ) : serverDetails.billing.freeServer && (
                              <span className="px-2 py-0.5 text-xs bg-[hsl(160_84%_39%)/20] text-[hsl(160_84%_60%)] border border-[hsl(160_84%_39%)/30] rounded-full">
                                Free Server
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-white/50 block">Status</span>
                              <span className="font-medium text-white capitalize">{serverDetails.billing.status}</span>
                            </div>
                            <div>
                              <span className="text-white/50 block">
                                {serverDetails.billing.isTrial ? 'Trial Expires' : 'Monthly'}
                              </span>
                              <span className="font-medium text-white">
                                {serverDetails.billing.isTrial ? (
                                  serverDetails.billing.trialEndedAt ? (
                                    <span className="text-[hsl(0_84%_70%)]">Ended</span>
                                  ) : serverDetails.billing.trialExpiresAt ? (
                                    <span className="text-[hsl(14_100%_70%)]">
                                      {new Date(serverDetails.billing.trialExpiresAt).toLocaleDateString('en-AU', {
                                        day: 'numeric',
                                        month: 'short',
                                        hour: 'numeric',
                                        minute: '2-digit',
                                      })}
                                    </span>
                                  ) : (
                                    <span className="text-[hsl(14_100%_70%)]">Trial</span>
                                  )
                                ) : serverDetails.billing.freeServer ? (
                                  <span className="text-[hsl(160_84%_60%)]">$0.00 (Free)</span>
                                ) : (
                                  `$${(serverDetails.billing.monthlyPriceCents / 100).toFixed(2)}`
                                )}
                              </span>
                            </div>
                            <div>
                              <span className="text-white/50 block">Server ID</span>
                              <span className="font-mono text-white">{serverDetails.server.id}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Power Actions */}
                    <div className="pt-4 border-t border-white/8">
                      <h3 className="text-sm font-medium text-white/60 mb-3">Power Actions</h3>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => powerMutation.mutate({ serverId: selectedServer.id, action: "start" })}
                          disabled={powerMutation.isPending}
                          className="flex items-center gap-2 px-4 py-2 bg-[hsl(160_84%_39%)/10] text-[hsl(160_84%_60%)] border border-[hsl(160_84%_39%)/30] rounded-lg hover:bg-[hsl(160_84%_39%)/20] transition-colors disabled:opacity-50 text-sm"
                        >
                          <Play className="h-4 w-4" />
                          Start
                        </button>
                        <button
                          onClick={() => powerMutation.mutate({ serverId: selectedServer.id, action: "stop" })}
                          disabled={powerMutation.isPending}
                          className="flex items-center gap-2 px-4 py-2 bg-[hsl(14_100%_60%)/10] text-[hsl(14_100%_70%)] border border-[hsl(14_100%_60%)/30] rounded-lg hover:bg-[hsl(14_100%_60%)/20] transition-colors disabled:opacity-50 text-sm"
                        >
                          <Square className="h-4 w-4" />
                          Stop
                        </button>
                        <button
                          onClick={() => powerMutation.mutate({ serverId: selectedServer.id, action: "restart" })}
                          disabled={powerMutation.isPending}
                          className="flex items-center gap-2 px-4 py-2 bg-[hsl(210_100%_50%)/10] text-[hsl(210_100%_70%)] border border-[hsl(210_100%_50%)/30] rounded-lg hover:bg-[hsl(210_100%_50%)/20] transition-colors disabled:opacity-50 text-sm"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Restart
                        </button>
                        <button
                          onClick={() => powerMutation.mutate({ serverId: selectedServer.id, action: "kill" })}
                          disabled={powerMutation.isPending}
                          className="flex items-center gap-2 px-4 py-2 bg-[hsl(0_84%_60%)/10] text-[hsl(0_84%_70%)] border border-[hsl(0_84%_60%)/30] rounded-lg hover:bg-[hsl(0_84%_60%)/20] transition-colors disabled:opacity-50 text-sm"
                        >
                          <Power className="h-4 w-4" />
                          Kill
                        </button>
                      </div>
                    </div>

                    {/* Admin Actions */}
                    <div className="pt-4 border-t border-white/8">
                      <h3 className="text-sm font-medium text-white/60 mb-3">Admin Actions</h3>
                      <div className="flex flex-wrap gap-2">
                        {(serverDetails.billing?.adminSuspended || serverDetails.server?.suspended) ? (
                          <button
                            onClick={() => unsuspendMutation.mutate(selectedServer.id)}
                            disabled={unsuspendMutation.isPending}
                            className="flex items-center gap-2 px-4 py-2 bg-[hsl(160_84%_39%)/10] text-[hsl(160_84%_60%)] border border-[hsl(160_84%_39%)/30] rounded-lg hover:bg-[hsl(160_84%_39%)/20] transition-colors disabled:opacity-50 text-sm"
                          >
                            {unsuspendMutation.isPending ? (
                              <><Loader2 className="h-4 w-4 animate-spin" />Unsuspending...</>
                            ) : "Unsuspend"}
                          </button>
                        ) : (
                          <button
                            onClick={() => setShowSuspendDialog(true)}
                            disabled={suspendMutation.isPending}
                            className="flex items-center gap-2 px-4 py-2 bg-[hsl(14_100%_60%)/10] text-[hsl(14_100%_70%)] border border-[hsl(14_100%_60%)/30] rounded-lg hover:bg-[hsl(14_100%_60%)/20] transition-colors disabled:opacity-50 text-sm"
                          >
                            Suspend
                          </button>
                        )}
                        {serverDetails.billing?.isTrial && (
                          <>
                            {!serverDetails.billing?.trialEndedAt && (
                              <button
                                onClick={() => setShowEndTrialDialog(true)}
                                disabled={endTrialMutation.isPending}
                                className="flex items-center gap-2 px-4 py-2 bg-[hsl(14_100%_60%)/10] text-[hsl(14_100%_70%)] border border-[hsl(14_100%_60%)/30] rounded-lg hover:bg-[hsl(14_100%_60%)/20] transition-colors disabled:opacity-50 text-sm"
                              >
                                <Clock className="h-4 w-4" />
                                End Trial
                              </button>
                            )}
                            <button
                              onClick={() => {
                                const defaultPrice = serverDetails.billing?.monthlyPriceCents || 0;
                                setConvertPrice((defaultPrice / 100).toString());
                                const defaultDate = new Date();
                                defaultDate.setDate(defaultDate.getDate() + 30);
                                setConvertBillingDate(defaultDate.toISOString().split('T')[0]);
                                setShowConvertTrialModal(true);
                              }}
                              disabled={convertTrialMutation.isPending}
                              className="flex items-center gap-2 px-4 py-2 bg-[hsl(160_84%_39%)/10] text-[hsl(160_84%_60%)] border border-[hsl(160_84%_39%)/30] rounded-lg hover:bg-[hsl(160_84%_39%)/20] transition-colors disabled:opacity-50 text-sm"
                            >
                              <DollarSign className="h-4 w-4" />
                              Convert to Paid
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setShowInstallOsModal(true)}
                          className="flex items-center gap-2 px-4 py-2 bg-[hsl(270_70%_60%)/10] text-[hsl(270_70%_70%)] border border-[hsl(270_70%_60%)/30] rounded-lg hover:bg-[hsl(270_70%_60%)/20] transition-colors text-sm"
                        >
                          <Download className="h-4 w-4" />
                          Install OS
                        </button>
                        <button
                          onClick={() => setShowDeleteDialog(true)}
                          className="flex items-center gap-2 px-4 py-2 bg-[hsl(0_84%_60%)] text-white rounded-lg hover:bg-[hsl(0_84%_55%)] transition-colors text-sm"
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
            <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-12 text-center">
              <div className="inline-flex p-4 bg-white/5 rounded-full mb-4">
                <Server className="h-8 w-8 text-white/30" />
              </div>
              <p className="text-white/40">Select a server to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Suspend Dialog */}
      <PromptDialog
        open={showSuspendDialog}
        onOpenChange={setShowSuspendDialog}
        title="Suspend Server"
        description="Enter a reason for suspending this server."
        placeholder="e.g., Payment overdue"
        label="Suspension Reason"
        confirmText="Suspend"
        onConfirm={(reason) => {
          if (selectedServer) {
            suspendMutation.mutate({ serverId: selectedServer.id, reason });
          }
        }}
        isPending={suspendMutation.isPending}
      />

      {/* End Trial Dialog */}
      <ConfirmDialog
        open={showEndTrialDialog}
        onOpenChange={setShowEndTrialDialog}
        title="End Trial"
        description="Are you sure you want to end this trial? The server will be powered off immediately."
        confirmText="End Trial"
        variant="destructive"
        onConfirm={() => {
          if (selectedServer) {
            endTrialMutation.mutate(selectedServer.id);
          }
        }}
        isPending={endTrialMutation.isPending}
      />

      {/* Delete Dialog */}
      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Server"
        description="Are you sure you want to delete this server? This action cannot be undone."
        confirmText="Delete Server"
        variant="destructive"
        onConfirm={() => {
          if (selectedServer) {
            serversApi.delete(selectedServer.id).then(() => {
              toast.success("Server deleted");
              setSelectedServer(null);
              queryClient.invalidateQueries({ queryKey: ["servers"] });
            }).catch((err: any) => toast.error(err.message));
          }
        }}
      />

      {/* Install OS Modal */}
      {showInstallOsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[hsl(215_21%_11%)] border border-white/10 rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/8">
              <h2 className="text-lg font-semibold text-white">Install Operating System</h2>
              <button
                onClick={closeInstallModal}
                className="p-1 text-white/40 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {installResult ? (
                <div className="space-y-4">
                  <div className="p-4 bg-[hsl(160_84%_39%)/10] border border-[hsl(160_84%_39%)/30] rounded-lg">
                    <p className="font-medium text-[hsl(160_84%_60%)] mb-2">OS Installation Started!</p>
                    <p className="text-sm text-white/50">The server is now installing the operating system. This may take a few minutes.</p>
                  </div>

                  {installResult.password && (
                    <div className="p-4 bg-white/5 rounded-lg">
                      <label className="text-sm text-white/40 block mb-1">New Root Password</label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 font-mono text-lg bg-white/8 px-3 py-2 rounded text-white">
                          {installResult.password}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(installResult.password || "");
                            toast.success("Password copied!");
                          }}
                          className="px-3 py-2 bg-white/10 rounded hover:bg-white/15 transition-colors text-white/70 hover:text-white"
                        >
                          Copy
                        </button>
                      </div>
                      <p className="text-xs text-white/40 mt-2">Credentials have been emailed to the user.</p>
                    </div>
                  )}

                  <button
                    onClick={closeInstallModal}
                    className="w-full py-2 bg-[hsl(210_100%_50%)] text-white rounded-lg hover:bg-[hsl(210_100%_45%)] transition-colors"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-white/50 mb-4">
                    Select an operating system to install on <strong className="text-white">{selectedServer?.name || `Server ${selectedServer?.id}`}</strong>.
                    This will erase all existing data on the server.
                  </p>

                  {loadingTemplates ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-white/40" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {osTemplatesData?.templates?.map((template: any) => (
                        <button
                          key={template.id}
                          onClick={() => setSelectedOsId(template.id)}
                          className={`w-full text-left p-3 rounded-lg border transition-colors ${
                            selectedOsId === template.id
                              ? "border-[hsl(210_100%_50%)/50] bg-[hsl(210_100%_50%)/10] text-white"
                              : "border-white/10 hover:border-white/20 text-white/70 hover:text-white"
                          }`}
                        >
                          <p className="font-medium">{template.name}</p>
                          {template.description && (
                            <p className="text-sm text-white/40">{template.description}</p>
                          )}
                        </button>
                      ))}
                      {(!osTemplatesData?.templates || osTemplatesData.templates.length === 0) && (
                        <p className="text-center text-white/40 py-4">No OS templates available</p>
                      )}
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-white/8 flex gap-3">
                    <button
                      onClick={closeInstallModal}
                      className="flex-1 py-2 bg-white/8 text-white/70 rounded-lg hover:bg-white/12 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleInstallOs}
                      disabled={!selectedOsId || installOsMutation.isPending}
                      className="flex-1 py-2 bg-[hsl(210_100%_50%)] text-white rounded-lg hover:bg-[hsl(210_100%_45%)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

      {/* Convert Trial Modal */}
      {showConvertTrialModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[hsl(215_21%_11%)] border border-white/10 rounded-xl shadow-2xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between p-4 border-b border-white/8">
              <h2 className="text-lg font-semibold text-white">Convert Trial to Paid</h2>
              <button
                onClick={() => {
                  setShowConvertTrialModal(false);
                  setConvertPrice("");
                  setConvertBillingDate("");
                }}
                className="p-1 text-white/40 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <p className="text-sm text-white/50">
                Convert <strong className="text-white">{selectedServer?.name || `Server ${selectedServer?.id}`}</strong> from a trial to a regular server.
                {serverDetails?.billing?.trialEndedAt && (
                  <span className="block mt-1 text-[hsl(160_84%_60%)]">The server will be powered on after conversion.</span>
                )}
              </p>

              <div>
                <label className="block text-sm font-medium text-white/60 mb-1">
                  Monthly Price ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={convertPrice}
                  onChange={(e) => setConvertPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-[hsl(210_100%_50%)/40] outline-none text-white placeholder-white/30"
                />
                <p className="text-xs text-white/40 mt-1">Set to 0 for a free server</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/60 mb-1">
                  First Billing Date
                </label>
                <input
                  type="date"
                  value={convertBillingDate}
                  onChange={(e) => setConvertBillingDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-[hsl(210_100%_50%)/40] outline-none text-white"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowConvertTrialModal(false);
                    setConvertPrice("");
                    setConvertBillingDate("");
                  }}
                  className="flex-1 py-2 bg-white/8 text-white/70 rounded-lg hover:bg-white/12 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const priceCents = Math.round(parseFloat(convertPrice || "0") * 100);
                    if (isNaN(priceCents) || priceCents < 0) {
                      toast.error("Please enter a valid price");
                      return;
                    }
                    convertTrialMutation.mutate({
                      serverId: selectedServer.id,
                      monthlyPriceCents: priceCents,
                      nextBillingDate: convertBillingDate || undefined,
                    });
                  }}
                  disabled={convertTrialMutation.isPending}
                  className="flex-1 py-2 bg-[hsl(160_84%_39%)] text-white rounded-lg hover:bg-[hsl(160_84%_34%)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {convertTrialMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Converting...
                    </>
                  ) : (
                    <>
                      <DollarSign className="h-4 w-4" />
                      Convert
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
