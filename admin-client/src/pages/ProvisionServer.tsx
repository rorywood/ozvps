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
} from "lucide-react";
import { Link } from "wouter";

export default function ProvisionServer() {
  const queryClient = useQueryClient();

  // Form state
  const [userSearch, setUserSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [hostname, setHostname] = useState("");
  const [selectedOs, setSelectedOs] = useState<number | null>(null);
  const [freeServer, setFreeServer] = useState(false);
  const [sendCredentials, setSendCredentials] = useState(true);
  const [notes, setNotes] = useState("");

  // Result state
  const [provisionResult, setProvisionResult] = useState<any>(null);

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

  // Provision mutation
  const provisionMutation = useMutation({
    mutationFn: serversApi.provision,
    onSuccess: (data) => {
      toast.success("Server provisioned successfully!");
      setProvisionResult(data);
      queryClient.invalidateQueries({ queryKey: ["servers"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to provision server");
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

    provisionMutation.mutate({
      auth0UserId: selectedUser.auth0UserId,
      planId: selectedPlan.id,
      hostname,
      osId: selectedOs || undefined,
      freeServer,
      sendCredentials,
      notes: notes || undefined,
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
    setFreeServer(false);
    setSendCredentials(true);
    setNotes("");
    setProvisionResult(null);
    setUserSearch("");
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
              <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <div>
                  <p className="font-medium">{selectedUser.name || selectedUser.email}</p>
                  <p className="text-sm text-gray-400">{selectedUser.email}</p>
                </div>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="text-gray-400 hover:text-white"
                >
                  Change
                </button>
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
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                <button
                  onClick={() => setSelectedOs(null)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedOs === null
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                >
                  <p className="font-medium">No OS (Install Later)</p>
                  <p className="text-sm text-gray-400">Server will be created without an operating system</p>
                </button>

                {templatesData?.templates && templatesData.templates.length > 0 ? (
                  templatesData.templates.map((template: any) => (
                    <button
                      key={template.id}
                      onClick={() => setSelectedOs(template.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedOs === template.id
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                      }`}
                    >
                      <p className="font-medium">{template.name}</p>
                      {template.group && (
                        <p className="text-sm text-gray-400">{template.group}</p>
                      )}
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-gray-400 text-center py-2">
                    No OS templates available for this plan. You can install an OS later.
                  </p>
                )}
              </div>
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
                  checked={freeServer}
                  onChange={(e) => setFreeServer(e.target.checked)}
                  className="w-5 h-5 rounded text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                />
              </label>

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
                <span className="text-gray-400">Operating System</span>
                <span>
                  {selectedOs
                    ? templatesData?.templates?.find((t: any) => t.id === selectedOs)?.name
                    : "None (Install Later)"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Monthly Cost</span>
                <span className="font-mono font-bold text-[var(--color-primary)]">
                  {freeServer
                    ? "FREE"
                    : selectedPlan
                    ? `$${(selectedPlan.priceMonthly / 100).toFixed(2)}`
                    : "-"}
                </span>
              </div>
            </div>

            <button
              onClick={handleProvision}
              disabled={!selectedUser || !selectedPlan || !hostname || provisionMutation.isPending}
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
