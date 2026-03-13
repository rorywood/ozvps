import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { whitelistApi } from "../lib/api";
import { toast } from "sonner";
import { Shield, Plus, Trash2, RefreshCw, AlertTriangle, Check, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { PromptDialog } from "../components/ui/prompt-dialog";

export default function Whitelist() {
  const { bootstrapMode } = useAuth();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newIp, setNewIp] = useState("");
  const [newLabel, setNewLabel] = useState("");

  // Dialog states replacing native dialogs
  const [showAddMyIpDialog, setShowAddMyIpDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

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
      setPendingDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ["whitelist"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const isCurrentIpWhitelisted = entries?.entries?.some(
    (entry: any) => entry.ipAddress === currentIp?.ip && entry.enabled
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">IP Whitelist</h1>

      {/* Bootstrap Warning */}
      {bootstrapMode && (
        <div className="mb-6 p-4 bg-[hsl(14_100%_60%)/10] border border-[hsl(14_100%_60%)/30] rounded-xl flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-[hsl(14_100%_70%)] mt-0.5" />
          <div>
            <h3 className="font-semibold text-[hsl(14_100%_70%)]">Bootstrap Mode Active</h3>
            <p className="text-sm text-[hsl(14_100%_70%)/80] mt-1">
              The IP whitelist is empty, so all admin access is currently allowed. Add your IP address below to enable whitelist protection.
            </p>
          </div>
        </div>
      )}

      {/* Current IP Info */}
      <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Your Current IP</h2>
            <p className="text-2xl font-mono text-white mt-1">{currentIp?.ip || "Loading..."}</p>
            {isCurrentIpWhitelisted ? (
              <p className="text-sm text-[hsl(160_84%_60%)] mt-2 flex items-center gap-1">
                <Check className="h-4 w-4" />
                Your IP is whitelisted
              </p>
            ) : (
              <p className="text-sm text-[hsl(14_100%_70%)] mt-2 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                Your IP is not whitelisted
              </p>
            )}
          </div>
          {!isCurrentIpWhitelisted && (
            <button
              onClick={() => setShowAddMyIpDialog(true)}
              disabled={addCurrentMutation.isPending}
              className="px-4 py-2 bg-[hsl(210_100%_50%)] text-white rounded-lg hover:bg-[hsl(210_100%_45%)] flex items-center gap-2 transition-colors text-sm"
            >
              <Plus className="h-4 w-4" />
              Add My IP
            </button>
          )}
        </div>
      </div>

      {/* Add IP Form */}
      <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Whitelist Entries</h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-white/5 border border-white/10 text-white/70 rounded-lg hover:bg-white/10 hover:text-white flex items-center gap-2 transition-colors text-sm"
          >
            <Plus className="h-4 w-4" />
            Add IP
          </button>
        </div>

        {showAddForm && (
          <div className="mb-6 p-4 bg-white/5 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1">IP Address</label>
                <input
                  type="text"
                  value={newIp}
                  onChange={(e) => setNewIp(e.target.value)}
                  placeholder="192.168.1.1"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:ring-2 focus:ring-[hsl(210_100%_50%)/40] outline-none placeholder-white/30 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1">Label</label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Office, Home, etc."
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:ring-2 focus:ring-[hsl(210_100%_50%)/40] outline-none placeholder-white/30 text-sm"
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
                  className="px-4 py-2 bg-[hsl(210_100%_50%)] text-white rounded-lg hover:bg-[hsl(210_100%_45%)] disabled:opacity-50 transition-colors text-sm"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setNewIp("");
                    setNewLabel("");
                  }}
                  className="px-4 py-2 bg-white/8 text-white/70 rounded-lg hover:bg-white/12 hover:text-white transition-colors text-sm"
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
            <RefreshCw className="h-6 w-6 animate-spin text-white/40" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">IP Address</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Label</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Added By</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {entries?.entries?.map((entry: any) => (
                  <tr key={entry.id} className={!entry.enabled ? "opacity-50" : ""}>
                    <td className="px-4 py-3 font-mono text-white text-sm">
                      {entry.ipAddress}
                      {entry.cidr && <span className="text-white/40">{entry.cidr}</span>}
                      {entry.ipAddress === currentIp?.ip && (
                        <span className="ml-2 px-2 py-0.5 bg-[hsl(210_100%_50%)/20] text-[hsl(210_100%_70%)] text-xs rounded-full">You</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-white text-sm">{entry.label}</td>
                    <td className="px-4 py-3 text-sm text-white/50">{entry.addedByEmail}</td>
                    <td className="px-4 py-3">
                      {entry.enabled ? (
                        <span className="px-2 py-1 bg-[hsl(160_84%_39%)/20] text-[hsl(160_84%_60%)] border border-[hsl(160_84%_39%)/30] text-xs rounded-full">Active</span>
                      ) : (
                        <span className="px-2 py-1 bg-white/10 text-white/50 border border-white/10 text-xs rounded-full">Disabled</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleMutation.mutate({ id: entry.id, enabled: !entry.enabled })}
                          className={`p-1 rounded transition-colors ${entry.enabled ? "text-[hsl(14_100%_70%)] hover:bg-[hsl(14_100%_60%)/20]" : "text-[hsl(160_84%_60%)] hover:bg-[hsl(160_84%_39%)/20]"}`}
                          title={entry.enabled ? "Disable" : "Enable"}
                        >
                          {entry.enabled ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => {
                            setPendingDeleteId(entry.id);
                            setShowDeleteConfirm(true);
                          }}
                          className="p-1 text-[hsl(0_84%_70%)] hover:bg-[hsl(0_84%_60%)/20] rounded transition-colors"
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
                    <td colSpan={5} className="px-4 py-8 text-center text-white/40">
                      <Shield className="h-8 w-8 mx-auto mb-2 text-white/20" />
                      No whitelist entries. Add your IP to enable protection.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add My IP Dialog */}
      <PromptDialog
        open={showAddMyIpDialog}
        onOpenChange={setShowAddMyIpDialog}
        title="Add My IP to Whitelist"
        description={`Add your current IP (${currentIp?.ip}) to the whitelist.`}
        placeholder="e.g., Office, Home"
        label="Label for this IP"
        confirmText="Add to Whitelist"
        onConfirm={(label) => addCurrentMutation.mutate(label)}
        isPending={addCurrentMutation.isPending}
      />

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          setShowDeleteConfirm(open);
          if (!open) setPendingDeleteId(null);
        }}
        title="Delete Whitelist Entry"
        description="Are you sure you want to delete this whitelist entry?"
        confirmText="Delete"
        variant="destructive"
        onConfirm={() => {
          if (pendingDeleteId !== null) {
            deleteMutation.mutate(pendingDeleteId);
          }
        }}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
