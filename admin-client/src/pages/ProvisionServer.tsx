import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { serversApi, usersApi, plansApi } from "../lib/api";
import { toast } from "sonner";
import {
  Server,
  Search,
  User,
  Package,
  HardDrive,
  Cpu,
  MemoryStick,
  Globe,
  Gift,
  Mail,
  Check,
  Loader2,
  ArrowLeft,
  Copy,
  MapPin,
  Clock,
} from "lucide-react";
import { Link } from "wouter";
import { getOsLogoUrl, FALLBACK_LOGO } from "../lib/os-logos";

export default function ProvisionServer() {
  const queryClient = useQueryClient();

  // Form state
  const [userSearch, setUserSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [hostname, setHostname] = useState("");
  const [selectedOs, setSelectedOs] = useState<number | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string>("BNE");
  const [freeServer, setFreeServer] = useState(false);
  const [sendCredentials, setSendCredentials] = useState(true);
  const [notes, setNotes] = useState("");
  const [isTrial, setIsTrial] = useState(false);
  const [trialDuration, setTrialDuration] = useState<'24h' | '7d'>('24h');

  // Result state
  const [provisionResult, setProvisionResult] = useState<any>(null);
  const [needsVirtFusionSync, setNeedsVirtFusionSync] = useState(false);

  // Fetch users for search
  const { data: usersData, isLoading: loadingUsers } = useQuery({
    queryKey: ["users-search", userSearch],
    queryFn: () => usersApi.search(userSearch),
    enabled: userSearch.length >= 2,
  });

  // Fetch plans
  const { data: plansData, isLoading: loadingPlans } = useQuery({
    queryKey: ["plans"],
    queryFn: () => plansApi.list(),
  });

  // Fetch OS templates for selected plan
  const { data: templatesData, isLoading: loadingTemplates } = useQuery({
    queryKey: ["plan-templates", selectedPlan?.id],
    queryFn: () => plansApi.getTemplates(selectedPlan.id),
    enabled: !!selectedPlan?.id,
  });

  // Fetch locations
  const { data: locationsData } = useQuery({
    queryKey: ["locations"],
    queryFn: () => serversApi.getLocations(),
  });

  // Sync to VirtFusion mutation
  const syncMutation = useMutation({
    mutationFn: () => usersApi.syncToVirtFusion(selectedUser.auth0UserId),
    onSuccess: () => {
      toast.success("User synced to VirtFusion successfully!");
      setNeedsVirtFusionSync(false);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to sync user to VirtFusion");
    },
  });

  // Provision mutation
  const provisionMutation = useMutation({
    mutationFn: serversApi.provision,
    onSuccess: (data) => {
      toast.success("Server provisioned successfully!");
      setProvisionResult(data);
      setNeedsVirtFusionSync(false);
      queryClient.invalidateQueries({ queryKey: ["servers"] });
    },
    onError: (err: any) => {
      // Check if the error indicates user needs VirtFusion sync
      if (err.needsSync) {
        setNeedsVirtFusionSync(true);
        toast.error("User needs to be synced to VirtFusion first");
      } else {
        toast.error(err.message || "Failed to provision server");
      }
    },
  });

  const handleProvision = () => {
    if (!selectedUser) {
      toast.error("Please select a user");
      return;
    }
    if (!selectedPlan) {
      toast.error("Please select a plan");
      return;
    }
    if (!hostname || hostname.length < 3) {
      toast.error("Please enter a valid hostname (at least 3 characters)");
      return;
    }
    if (!selectedOs) {
      toast.error("Please select an operating system");
      return;
    }

    provisionMutation.mutate({
      auth0UserId: selectedUser.auth0UserId,
      email: selectedUser.email,
      name: selectedUser.name || null,
      planId: selectedPlan.id,
      hostname,
      osId: selectedOs,
      locationCode: selectedLocation,
      freeServer: freeServer || isTrial, // Trials are always free
      sendCredentials,
      notes: notes || undefined,
      isTrial,
      trialDuration: isTrial ? trialDuration : undefined,
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const resetForm = () => {
    setSelectedUser(null);
    setSelectedPlan(null);
    setHostname("");
    setSelectedOs(null);
    setSelectedLocation("BNE");
    setFreeServer(false);
    setSendCredentials(true);
    setNotes("");
    setProvisionResult(null);
    setUserSearch("");
    setIsTrial(false);
    setTrialDuration('24h');
  };

  // Show result screen after successful provision
  if (provisionResult) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={resetForm}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            Provision Another
          </button>
        </div>

        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Check className="h-8 w-8 text-green-400" />
            <h2 className="text-xl font-semibold text-green-400">Server Provisioned Successfully</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <div className="bg-[var(--color-card)] rounded-lg p-4">
              <label className="text-sm text-gray-400">Server ID</label>
              <div className="flex items-center justify-between mt-1">
                <span className="font-mono text-lg">{provisionResult.server.id}</span>
                <button
                  onClick={() => copyToClipboard(String(provisionResult.server.id))}
                  className="text-gray-400 hover:text-white"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="bg-[var(--color-card)] rounded-lg p-4">
              <label className="text-sm text-gray-400">Hostname</label>
              <div className="flex items-center justify-between mt-1">
                <span className="font-mono text-lg">{provisionResult.server.name}</span>
                <button
                  onClick={() => copyToClipboard(provisionResult.server.name)}
                  className="text-gray-400 hover:text-white"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>

            {provisionResult.server.primaryIp && (
              <div className="bg-[var(--color-card)] rounded-lg p-4">
                <label className="text-sm text-gray-400">IP Address</label>
                <div className="flex items-center justify-between mt-1">
                  <span className="font-mono text-lg">{provisionResult.server.primaryIp}</span>
                  <button
                    onClick={() => copyToClipboard(provisionResult.server.primaryIp)}
                    className="text-gray-400 hover:text-white"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {provisionResult.server.password && (
              <div className="bg-[var(--color-card)] rounded-lg p-4">
                <label className="text-sm text-gray-400">Root Password</label>
                <div className="flex items-center justify-between mt-1">
                  <span className="font-mono text-lg">{provisionResult.server.password}</span>
                  <button
                    onClick={() => copyToClipboard(provisionResult.server.password)}
                    className="text-gray-400 hover:text-white"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 flex gap-3">
            <Link
              href={`/servers`}
              className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 transition-opacity"
            >
              View All Servers
            </Link>
            <button
              onClick={resetForm}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors"
            >
              Provision Another Server
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Server className="h-8 w-8 text-[var(--color-primary)]" />
          <div>
            <h1 className="text-2xl font-bold">Provision Server</h1>
            <p className="text-gray-400 text-sm">Create a new server for a user</p>
          </div>
        </div>
        <Link
          href="/servers"
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          Back to Servers
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Form */}
        <div className="space-y-6">
          {/* User Selection */}
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <User className="h-5 w-5 text-[var(--color-primary)]" />
              <h2 className="text-lg font-semibold">Select User</h2>
            </div>

            {selectedUser ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <div>
                    <p className="font-medium">{selectedUser.name || selectedUser.email}</p>
                    <p className="text-sm text-gray-400">{selectedUser.email}</p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedUser(null);
                      setNeedsVirtFusionSync(false);
                    }}
                    className="text-gray-400 hover:text-white"
                  >
                    Change
                  </button>
                </div>

                {needsVirtFusionSync && (
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <p className="text-sm text-yellow-400 mb-2">
                      This user hasn't logged in yet and needs to be synced to VirtFusion before provisioning.
                    </p>
                    <button
                      onClick={() => syncMutation.mutate()}
                      disabled={syncMutation.isPending}
                      className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500 text-black rounded font-medium text-sm hover:bg-yellow-400 transition-colors disabled:opacity-50"
                    >
                      {syncMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        "Sync to VirtFusion"
                      )}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search users by email or name..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
                  />
                </div>

                {loadingUsers && userSearch.length >= 2 && (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                )}

                {usersData?.users && usersData.users.length > 0 && (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {usersData.users.map((user: any) => (
                      <button
                        key={user.auth0UserId}
                        onClick={() => setSelectedUser(user)}
                        className="w-full text-left p-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <p className="font-medium">{user.name || user.email}</p>
                        <p className="text-sm text-gray-400">{user.email}</p>
                      </button>
                    ))}
                  </div>
                )}

                {userSearch.length >= 2 && !loadingUsers && usersData?.users?.length === 0 && (
                  <p className="text-center text-gray-400 py-4">No users found</p>
                )}
              </div>
            )}
          </div>

          {/* Plan Selection */}
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Package className="h-5 w-5 text-[var(--color-primary)]" />
              <h2 className="text-lg font-semibold">Select Plan</h2>
            </div>

            {loadingPlans ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 max-h-80 overflow-y-auto">
                {plansData?.plans
                  ?.filter((p: any) => p.active && p.virtfusionPackageId)
                  .map((plan: any) => (
                    <button
                      key={plan.id}
                      onClick={() => {
                        setSelectedPlan(plan);
                        setSelectedOs(null);
                      }}
                      className={`text-left p-4 rounded-lg border transition-colors ${
                        selectedPlan?.id === plan.id
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold">{plan.name}</p>
                          <div className="flex gap-4 mt-2 text-sm text-gray-400">
                            <span className="flex items-center gap-1">
                              <Cpu className="h-4 w-4" />
                              {plan.vcpu} vCPU
                            </span>
                            <span className="flex items-center gap-1">
                              <MemoryStick className="h-4 w-4" />
                              {plan.ramMb >= 1024 ? `${plan.ramMb / 1024} GB` : `${plan.ramMb} MB`}
                            </span>
                            <span className="flex items-center gap-1">
                              <HardDrive className="h-4 w-4" />
                              {plan.storageGb} GB
                            </span>
                          </div>
                        </div>
                        <span className="font-mono font-bold text-[var(--color-primary)]">
                          ${(plan.priceMonthly / 100).toFixed(2)}/mo
                        </span>
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Hostname */}
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="h-5 w-5 text-[var(--color-primary)]" />
              <h2 className="text-lg font-semibold">Server Name</h2>
            </div>

            <input
              type="text"
              placeholder="my-server"
              value={hostname}
              onChange={(e) => setHostname(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent font-mono"
              maxLength={32}
            />
            <p className="text-sm text-gray-400 mt-2">
              Only lowercase letters, numbers, and hyphens allowed
            </p>
          </div>

          {/* Location Selection */}
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="h-5 w-5 text-[var(--color-primary)]" />
              <h2 className="text-lg font-semibold">Location</h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {locationsData?.locations?.map((location: any) => (
                <button
                  key={location.code}
                  onClick={() => location.enabled && setSelectedLocation(location.code)}
                  disabled={!location.enabled}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${
                    selectedLocation === location.code
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                      : location.enabled
                      ? "border-gray-200 dark:border-gray-700 hover:border-[var(--color-primary)]/50"
                      : "border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={`https://flagcdn.com/w40/${location.countryCode.toLowerCase()}.png`}
                      alt={location.country}
                      className="w-8 h-6 object-cover rounded"
                    />
                    <div>
                      <div className="font-semibold">{location.name}</div>
                      <div className="text-xs text-gray-400">{location.country}</div>
                    </div>
                  </div>
                  {!location.enabled && (
                    <span className="text-xs text-yellow-500 mt-2 block">Coming Soon</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - OS & Options */}
        <div className="space-y-6">
          {/* OS Selection */}
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Server className="h-5 w-5 text-[var(--color-primary)]" />
              <h2 className="text-lg font-semibold">Operating System</h2>
            </div>

            {!selectedPlan ? (
              <p className="text-gray-400 text-center py-4">Select a plan first</p>
            ) : loadingTemplates ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : templatesData?.groups && templatesData.groups.length > 0 ? (
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                {templatesData.groups.map((group: any) => (
                  <div key={group.name}>
                    <h3 className="text-sm font-medium text-gray-400 mb-2">{group.name}</h3>
                    <div className="space-y-2">
                      {group.templates.map((template: any) => (
                        <button
                          key={template.id}
                          onClick={() => setSelectedOs(template.id)}
                          className={`w-full text-left p-3 rounded-lg border transition-colors flex items-center gap-3 ${
                            selectedOs === template.id
                              ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                              : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                          }`}
                        >
                          <img
                            src={getOsLogoUrl({ id: template.id, name: template.name, group: template.group, distro: template.distro })}
                            alt={template.name}
                            className="h-8 w-8 object-contain"
                            onError={(e) => { e.currentTarget.src = FALLBACK_LOGO; }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{template.name}</p>
                            {template.version && (
                              <p className="text-sm text-gray-400">{template.version}</p>
                            )}
                          </div>
                          {selectedOs === template.id && (
                            <Check className="h-5 w-5 text-[var(--color-primary)]" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : templatesData?.templates && templatesData.templates.length > 0 ? (
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                {templatesData.templates.map((template: any) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedOs(template.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors flex items-center gap-3 ${
                      selectedOs === template.id
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                        : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                    }`}
                  >
                    <img
                      src={getOsLogoUrl({ id: template.id, name: template.name, group: template.group, distro: template.distro })}
                      alt={template.name}
                      className="h-8 w-8 object-contain"
                      onError={(e) => { e.currentTarget.src = FALLBACK_LOGO; }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{template.name}</p>
                      {template.version && (
                        <p className="text-sm text-gray-400">{template.version}</p>
                      )}
                    </div>
                    {selectedOs === template.id && (
                      <Check className="h-5 w-5 text-[var(--color-primary)]" />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-red-400 text-center py-4">
                No OS templates available for this plan. Cannot provision without an OS.
              </p>
            )}
          </div>

          {/* Options */}
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">Options</h2>

            <div className="space-y-4">
              <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-pointer">
                <div className="flex items-center gap-3">
                  <Gift className="h-5 w-5 text-green-400" />
                  <div>
                    <p className="font-medium">Free Server</p>
                    <p className="text-sm text-gray-400">No billing charges for this server</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={freeServer || isTrial}
                  onChange={(e) => setFreeServer(e.target.checked)}
                  disabled={isTrial}
                  className="w-5 h-5 rounded text-[var(--color-primary)] focus:ring-[var(--color-primary)] disabled:opacity-50"
                />
              </label>

              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-amber-400" />
                    <div>
                      <p className="font-medium">Trial Server</p>
                      <p className="text-sm text-gray-400">Time-limited server (auto-stops when trial ends)</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={isTrial}
                    onChange={(e) => {
                      setIsTrial(e.target.checked);
                      if (e.target.checked) {
                        setFreeServer(true);
                      }
                    }}
                    className="w-5 h-5 rounded text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                  />
                </label>

                {isTrial && (
                  <div className="mt-3 ml-8 space-y-2">
                    <p className="text-xs text-gray-400 font-medium">Trial Duration:</p>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="trialDuration"
                          value="24h"
                          checked={trialDuration === '24h'}
                          onChange={() => setTrialDuration('24h')}
                          className="text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                        />
                        <span className="text-sm">24 Hours</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="trialDuration"
                          value="7d"
                          checked={trialDuration === '7d'}
                          onChange={() => setTrialDuration('7d')}
                          className="text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                        />
                        <span className="text-sm">7 Days</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-pointer">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-blue-400" />
                  <div>
                    <p className="font-medium">Send Credentials</p>
                    <p className="text-sm text-gray-400">Email login details to the user</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={sendCredentials}
                  onChange={(e) => setSendCredentials(e.target.checked)}
                  className="w-5 h-5 rounded text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                />
              </label>
            </div>

            {/* Notes */}
            <div className="mt-4">
              <label className="block text-sm font-medium mb-2">Admin Notes (Optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal notes about this provision..."
                className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
                rows={3}
              />
            </div>
          </div>

          {/* Summary & Submit */}
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">Summary</h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">User</span>
                <span className="font-medium">
                  {selectedUser?.email || <span className="text-gray-400">Not selected</span>}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Plan</span>
                <span className="font-medium">
                  {selectedPlan?.name || <span className="text-gray-400">Not selected</span>}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Hostname</span>
                <span className="font-mono">
                  {hostname || <span className="text-gray-400">Not entered</span>}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Location</span>
                <span className="flex items-center gap-2">
                  {locationsData?.locations?.find((l: any) => l.code === selectedLocation) && (
                    <>
                      <img
                        src={`https://flagcdn.com/w20/${locationsData.locations.find((l: any) => l.code === selectedLocation)?.countryCode.toLowerCase()}.png`}
                        alt=""
                        className="w-5 h-3.5 object-cover rounded-sm"
                      />
                      {locationsData.locations.find((l: any) => l.code === selectedLocation)?.name}
                    </>
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Operating System</span>
                <span>
                  {selectedOs
                    ? (templatesData?.templates?.find((t: any) => t.id === selectedOs)?.name ||
                       templatesData?.groups?.flatMap((g: any) => g.templates).find((t: any) => t.id === selectedOs)?.name ||
                       "Selected")
                    : <span className="text-gray-400 italic">Not selected</span>}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Monthly Cost</span>
                <span className="font-mono font-bold text-[var(--color-primary)]">
                  {freeServer || isTrial
                    ? "FREE"
                    : selectedPlan
                    ? `$${(selectedPlan.priceMonthly / 100).toFixed(2)}`
                    : "-"}
                </span>
              </div>
              {isTrial && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Trial Duration</span>
                  <span className="font-medium text-amber-400">
                    {trialDuration === '24h' ? '24 Hours' : '7 Days'}
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={handleProvision}
              disabled={!selectedUser || !selectedPlan || !hostname || !selectedOs || provisionMutation.isPending}
              className="w-full mt-6 py-3 bg-[var(--color-primary)] text-white rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {provisionMutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Provisioning...
                </>
              ) : (
                <>
                  <Server className="h-5 w-5" />
                  Provision Server
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
