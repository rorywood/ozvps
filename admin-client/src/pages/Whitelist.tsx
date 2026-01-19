import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { whitelistApi } from "../lib/api";
import { toast } from "sonner";
import { Shield, Plus, Trash2, RefreshCw, AlertTriangle, Check, X } from "lucide-react";
import { useAuth } from "../lib/auth";

export default function Whitelist() {
  const { bootstrapMode } = useAuth();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newIp, setNewIp] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const queryClient = useQueryClient();

  const { data: entries, isLoading } = useQuery({
    queryKey: ["whitelist"],
    queryFn: whitelistApi.list,
  });

  const { data: currentIp } = useQuery({
    queryKey: ["current-ip"],
    queryFn: whitelistApi.getCurrentIp,
  });

  const addMutation = useMutation({
    mutationFn: (data: { ipAddress: string; label: string }) => whitelistApi.add(data),
    onSuccess: () => {
      toast.success("IP added to whitelist");
      setNewIp("");
      setNewLabel("");
      setShowAddForm(false);
      queryClient.invalidateQueries({ queryKey: ["whitelist"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const addCurrentMutation = useMutation({
    mutationFn: (label: string) => whitelistApi.addCurrent(label),
    onSuccess: () => {
      toast.success("Your IP has been added to the whitelist");
      queryClient.invalidateQueries({ queryKey: ["whitelist"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      whitelistApi.update(id, { enabled }),
    onSuccess: () => {
      toast.success("Entry updated");
      queryClient.invalidateQueries({ queryKey: ["whitelist"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => whitelistApi.delete(id),
    onSuccess: () => {
      toast.success("Entry deleted");
      queryClient.invalidateQueries({ queryKey: ["whitelist"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const isCurrentIpWhitelisted = entries?.entries?.some(
    (entry: any) => entry.ipAddress === currentIp?.ip && entry.enabled
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">IP Whitelist</h1>

      {/* Bootstrap Warning */}
      {bootstrapMode && (
        <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5" />
          <div>
            <h3 className="font-semibold text-yellow-400">Bootstrap Mode Active</h3>
            <p className="text-sm text-yellow-400/80 mt-1">
              The IP whitelist is empty, so all admin access is currently allowed. Add your IP address below to enable whitelist protection.
            </p>
          </div>
        </div>
      )}

      {/* Current IP Info */}
      <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Your Current IP</h2>
            <p className="text-2xl font-mono text-gray-700 dark:text-gray-300 mt-1">{currentIp?.ip || "Loading..."}</p>
            {isCurrentIpWhitelisted ? (
              <p className="text-sm text-green-600 dark:text-green-400 mt-2 flex items-center gap-1">
                <Check className="h-4 w-4" />
                Your IP is whitelisted
              </p>
            ) : (
              <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-2 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                Your IP is not whitelisted
              </p>
            )}
          </div>
          {!isCurrentIpWhitelisted && (
            <button
              onClick={() => {
                const label = prompt("Enter a label for this IP (e.g., 'Office', 'Home'):");
                if (label) {
                  addCurrentMutation.mutate(label);
                }
              }}
              disabled={addCurrentMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add My IP
            </button>
          )}
        </div>
      </div>

      {/* Add IP Form */}
      <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Whitelist Entries</h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add IP
          </button>
        </div>

        {showAddForm && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">IP Address</label>
                <input
                  type="text"
                  value={newIp}
                  onChange={(e) => setNewIp(e.target.value)}
                  placeholder="192.168.1.1"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Label</label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Office, Home, etc."
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="flex items-end gap-2">
                <button
                  onClick={() => {
                    if (newIp && newLabel) {
                      addMutation.mutate({ ipAddress: newIp, label: newLabel });
                    }
                  }}
                  disabled={!newIp || !newLabel || addMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setNewIp("");
                    setNewLabel("");
                  }}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Entries List */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">IP Address</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Label</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Added By</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {entries?.entries?.map((entry: any) => (
                  <tr key={entry.id} className={!entry.enabled ? "bg-gray-50 dark:bg-gray-800/30 opacity-60" : ""}>
                    <td className="px-4 py-3 font-mono text-gray-900 dark:text-gray-100">
                      {entry.ipAddress}
                      {entry.cidr && <span className="text-gray-400">{entry.cidr}</span>}
                      {entry.ipAddress === currentIp?.ip && (
                        <span className="ml-2 px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">You</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{entry.label}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{entry.addedByEmail}</td>
                    <td className="px-4 py-3">
                      {entry.enabled ? (
                        <span className="px-2 py-1 bg-green-500/20 text-green-400 border border-green-500/30 text-xs rounded-full">Active</span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-500/20 text-gray-400 border border-gray-500/30 text-xs rounded-full">Disabled</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleMutation.mutate({ id: entry.id, enabled: !entry.enabled })}
                          className={`p-1 rounded transition-colors ${entry.enabled ? "text-yellow-400 hover:bg-yellow-500/20" : "text-green-400 hover:bg-green-500/20"}`}
                          title={entry.enabled ? "Disable" : "Enable"}
                        >
                          {entry.enabled ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("Delete this whitelist entry?")) {
                              deleteMutation.mutate(entry.id);
                            }
                          }}
                          className="p-1 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!entries?.entries || entries.entries.length === 0) && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      <Shield className="h-8 w-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                      No whitelist entries. Add your IP to enable protection.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
