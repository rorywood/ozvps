import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { billingApi, serversApi } from "../lib/api";
import { toast } from "sonner";
import { CreditCard, RefreshCw, Play, Pause, DollarSign, Calendar, Gift, X, Trash2, Clock, Loader2 } from "lucide-react";
import { ConfirmDialog } from "../components/ui/confirm-dialog";

export default function Billing() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDueDateModal, setShowDueDateModal] = useState(false);
  const [newDueDate, setNewDueDate] = useState("");

  // Dialog states replacing native confirm()
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
  const [showEndTrialConfirm, setShowEndTrialConfirm] = useState(false);
  const [showSuspendConfirm, setShowSuspendConfirm] = useState(false);

  const queryClient = useQueryClient();

  const { data: records, isLoading } = useQuery({
    queryKey: ["billing-records", statusFilter],
    queryFn: () => billingApi.listRecords(100, 0, statusFilter || undefined),
  });

  const { data: stats } = useQuery({
    queryKey: ["billing-stats"],
    queryFn: billingApi.getStats,
  });

  const runJobMutation = useMutation({
    mutationFn: billingApi.runBillingJob,
    onSuccess: (data: any) => {
      const r = data?.result;
      if (!r) { toast.success("Billing job completed"); return; }
      const lines = [
        `Found: ${r.serversFound} servers`,
        r.charged.length ? `✓ Charged: ${r.charged.join(", ")}` : null,
        r.skippedInsufficientFunds.length ? `✗ No funds: ${r.skippedInsufficientFunds.join(", ")}` : null,
        r.skippedAlreadyCharged.length ? `⟳ Already charged: ${r.skippedAlreadyCharged.join(", ")}` : null,
        r.skippedSuspendedUser.length ? `— Suspended user: ${r.skippedSuspendedUser.join(", ")}` : null,
        r.errors.length ? `⚠ Errors: ${r.errors.join("; ")}` : null,
      ].filter(Boolean).join("\n");
      if (r.serversFound === 0) {
        toast.info("Billing job ran — no servers due today");
      } else if (r.charged.length > 0) {
        toast.success(`Charged ${r.charged.length} server(s)\n${lines}`);
      } else {
        toast.warning(`Job ran — 0 charged\n${lines}`);
      }
      queryClient.invalidateQueries({ queryKey: ["billing-records"] });
      queryClient.invalidateQueries({ queryKey: ["billing-stats"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const cleanupMutation = useMutation({
    mutationFn: billingApi.cleanupOrphaned,
    onSuccess: (data) => {
      toast.success(`Cleaned up ${data.cleaned} orphaned records`);
      queryClient.invalidateQueries({ queryKey: ["billing-records"] });
      queryClient.invalidateQueries({ queryKey: ["billing-stats"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const suspendMutation = useMutation({
    mutationFn: (id: number) => billingApi.suspendRecord(id, "Admin manual suspension"),
    onSuccess: () => {
      toast.success("Server suspended");
      queryClient.invalidateQueries({ queryKey: ["billing-records"] });
      queryClient.invalidateQueries({ queryKey: ["billing-stats"] });
      setSelectedRecord(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const unsuspendMutation = useMutation({
    mutationFn: (id: number) => billingApi.unsuspendRecord(id),
    onSuccess: () => {
      toast.success("Server unsuspended");
      queryClient.invalidateQueries({ queryKey: ["billing-records"] });
      queryClient.invalidateQueries({ queryKey: ["billing-stats"] });
      setSelectedRecord(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const forceChargeMutation = useMutation({
    mutationFn: (virtfusionServerId: string) => billingApi.forceCharge(virtfusionServerId),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
      queryClient.invalidateQueries({ queryKey: ["billing-records"] });
      queryClient.invalidateQueries({ queryKey: ["billing-stats"] });
      setSelectedRecord(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const endTrialMutation = useMutation({
    mutationFn: (serverId: number) => serversApi.endTrial(serverId),
    onSuccess: () => {
      toast.success("Trial ended - server has been powered off");
      queryClient.invalidateQueries({ queryKey: ["billing-records"] });
      queryClient.invalidateQueries({ queryKey: ["billing-stats"] });
      setSelectedRecord(null);
    },
    onError: (err: any) => toast.error(err.message || "Failed to end trial"),
  });

  const updateRecordMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => billingApi.updateRecord(id, data),
    onSuccess: () => {
      toast.success("Record updated");
      queryClient.invalidateQueries({ queryKey: ["billing-records"] });
      queryClient.invalidateQueries({ queryKey: ["billing-stats"] });
      setShowEditModal(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: "bg-[hsl(160_84%_39%)/20] text-[hsl(160_84%_60%)] border border-[hsl(160_84%_39%)/30]",
      paid: "bg-[hsl(210_100%_50%)/20] text-[hsl(210_100%_70%)] border border-[hsl(210_100%_50%)/30]",
      unpaid: "bg-[hsl(14_100%_60%)/20] text-[hsl(14_100%_70%)] border border-[hsl(14_100%_60%)/30]",
      suspended: "bg-[hsl(0_84%_60%)/20] text-[hsl(0_84%_70%)] border border-[hsl(0_84%_60%)/30]",
      cancelled: "bg-white/10 text-white/50 border border-white/10",
    };
    return colors[status] || "bg-white/10 text-white/50 border border-white/10";
  };

  const handleToggleFree = () => {
    if (!selectedRecord) return;
    updateRecordMutation.mutate({
      id: selectedRecord.billing.id,
      data: { freeServer: !selectedRecord.billing.freeServer },
    });
    setSelectedRecord({
      ...selectedRecord,
      billing: { ...selectedRecord.billing, freeServer: !selectedRecord.billing.freeServer },
    });
  };

  const handleOpenDueDateModal = () => {
    if (!selectedRecord) return;
    setNewDueDate(selectedRecord.billing.nextBillAt?.split("T")[0] || "");
    setShowDueDateModal(true);
  };

  const handleSaveDueDate = () => {
    if (!selectedRecord || !newDueDate) return;
    updateRecordMutation.mutate({
      id: selectedRecord.billing.id,
      data: { nextBillAt: new Date(newDueDate).toISOString() },
    });
    setShowDueDateModal(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Billing</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCleanupConfirm(true)}
            disabled={cleanupMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-[hsl(14_100%_60%)/10] text-[hsl(14_100%_70%)] border border-[hsl(14_100%_60%)/30] rounded-lg hover:bg-[hsl(14_100%_60%)/20] transition-colors text-sm"
          >
            <Trash2 className={`h-4 w-4 ${cleanupMutation.isPending ? "animate-spin" : ""}`} />
            Cleanup Orphaned
          </button>
          <button
            onClick={() => runJobMutation.mutate()}
            disabled={runJobMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-[hsl(210_100%_50%)] text-white rounded-lg hover:bg-[hsl(210_100%_45%)] transition-colors text-sm"
          >
            <RefreshCw className={`h-4 w-4 ${runJobMutation.isPending ? "animate-spin" : ""}`} />
            Run Billing Job
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[hsl(160_84%_39%)/15] rounded-lg">
                <DollarSign className="h-6 w-6 text-[hsl(160_84%_60%)]" />
              </div>
              <div>
                <p className="text-xs text-white/40 uppercase tracking-wide">MRR</p>
                <p className="text-xl font-bold text-white">{formatCurrency(stats.mrr)}</p>
              </div>
            </div>
          </div>
          <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-4">
            <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Active</p>
            <p className="text-xl font-bold text-[hsl(160_84%_60%)]">{stats.statusCounts.active || 0}</p>
          </div>
          <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-4">
            <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Suspended</p>
            <p className="text-xl font-bold text-[hsl(0_84%_70%)]">{stats.statusCounts.suspended || 0}</p>
          </div>
          <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-4">
            <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Due Soon</p>
            <p className="text-xl font-bold text-[hsl(14_100%_70%)]">{stats.dueSoonCount}</p>
          </div>
        </div>
      )}

      {/* Filter and Quick Actions */}
      <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-white/60">Filter by status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-[hsl(210_100%_50%)/40] outline-none text-white text-sm"
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
              <option value="suspended">Suspended</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Quick Actions when a record is selected */}
        {selectedRecord && (
          <div className="mt-4 pt-4 border-t border-white/8">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-white/40">Selected:</span>
                <span className="font-medium text-white text-sm">
                  {selectedRecord.serverName || `Server #${selectedRecord.billing.virtfusionServerId}`}
                </span>
                <span className={`px-2 py-0.5 text-xs rounded ${getStatusColor(selectedRecord.billing.status)}`}>
                  {selectedRecord.billing.status}
                </span>
                {selectedRecord.billing.isTrial ? (
                  <span className="px-2 py-0.5 text-xs bg-[hsl(14_100%_60%)/20] text-[hsl(14_100%_70%)] rounded flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Trial
                  </span>
                ) : selectedRecord.billing.freeServer && (
                  <span className="px-2 py-0.5 text-xs bg-[hsl(160_84%_39%)/20] text-[hsl(160_84%_60%)] rounded">Free</span>
                )}
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="p-1 text-white/40 hover:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleOpenDueDateModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[hsl(210_100%_50%)/10] text-[hsl(210_100%_70%)] border border-[hsl(210_100%_50%)/30] rounded-lg text-sm hover:bg-[hsl(210_100%_50%)/20] transition-colors"
                >
                  <Calendar className="h-4 w-4" />
                  Change Due Date
                </button>
                {!selectedRecord.billing.isTrial && (
                  <button
                    onClick={handleToggleFree}
                    disabled={updateRecordMutation.isPending}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      selectedRecord.billing.freeServer
                        ? "bg-[hsl(14_100%_60%)/10] text-[hsl(14_100%_70%)] border border-[hsl(14_100%_60%)/30] hover:bg-[hsl(14_100%_60%)/20]"
                        : "bg-[hsl(160_84%_39%)/10] text-[hsl(160_84%_60%)] border border-[hsl(160_84%_39%)/30] hover:bg-[hsl(160_84%_39%)/20]"
                    }`}
                  >
                    <Gift className="h-4 w-4" />
                    {selectedRecord.billing.freeServer ? "Remove Free" : "Set Free"}
                  </button>
                )}
                {selectedRecord.billing.isTrial && !selectedRecord.billing.trialEndedAt && (
                  <button
                    onClick={() => setShowEndTrialConfirm(true)}
                    disabled={endTrialMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[hsl(14_100%_60%)/10] text-[hsl(14_100%_70%)] border border-[hsl(14_100%_60%)/30] rounded-lg text-sm hover:bg-[hsl(14_100%_60%)/20] transition-colors"
                  >
                    <Clock className="h-4 w-4" />
                    End Trial
                  </button>
                )}
                {/* Force Charge — bypasses idempotency, clears stale ledger entries */}
                {!selectedRecord.billing.freeServer && !selectedRecord.billing.isTrial && (
                  <button
                    onClick={() => forceChargeMutation.mutate(selectedRecord.billing.virtfusionServerId)}
                    disabled={forceChargeMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[hsl(209_100%_50%)/10] text-[hsl(209_100%_70%)] border border-[hsl(209_100%_50%)/30] rounded-lg text-sm hover:bg-[hsl(209_100%_50%)/20] transition-colors"
                  >
                    {forceChargeMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 animate-spin" />Charging...</>
                    ) : (
                      <><DollarSign className="h-4 w-4" />Force Charge</>
                    )}
                  </button>
                )}
                {selectedRecord.billing.status === "suspended" ? (
                  <button
                    onClick={() => unsuspendMutation.mutate(selectedRecord.billing.id)}
                    disabled={unsuspendMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[hsl(160_84%_39%)/10] text-[hsl(160_84%_60%)] border border-[hsl(160_84%_39%)/30] rounded-lg text-sm hover:bg-[hsl(160_84%_39%)/20] transition-colors"
                  >
                    {unsuspendMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 animate-spin" />Unsuspending...</>
                    ) : (
                      <><Play className="h-4 w-4" />Unsuspend</>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => setShowSuspendConfirm(true)}
                    disabled={suspendMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[hsl(14_100%_60%)/10] text-[hsl(14_100%_70%)] border border-[hsl(14_100%_60%)/30] rounded-lg text-sm hover:bg-[hsl(14_100%_60%)/20] transition-colors"
                  >
                    <Pause className="h-4 w-4" />
                    Suspend Server
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Records Table */}
      <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-white/40" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Server</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Price</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Next Bill</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {records?.records?.map((record: any) => (
                  <tr
                    key={record.billing.id}
                    onClick={() => setSelectedRecord(record)}
                    className={`cursor-pointer transition-colors ${
                      selectedRecord?.billing.id === record.billing.id
                        ? "bg-[hsl(210_100%_50%)/10]"
                        : "hover:bg-white/3"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-white">
                          {record.serverName || `Server #${record.billing.virtfusionServerId}`}
                        </p>
                        {record.serverUuid && (
                          <p className="text-xs text-white/40 font-mono truncate max-w-[180px]" title={record.serverUuid}>
                            {record.serverUuid}
                          </p>
                        )}
                        {!record.serverUuid && (
                          <p className="text-xs text-white/40">
                            ID: {record.billing.virtfusionServerId}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-white">
                          {record.user?.name || record.user?.email?.split('@')[0] || "Unknown"}
                        </p>
                        <p className="text-sm text-white/50">{record.user?.email || "N/A"}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-white">
                          {formatCurrency(record.billing.monthlyPriceCents)}
                        </span>
                        {record.billing.isTrial ? (
                          <span className="px-2 py-0.5 text-xs bg-[hsl(14_100%_60%)/20] text-[hsl(14_100%_70%)] rounded-full flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Trial
                          </span>
                        ) : record.billing.freeServer && (
                          <span className="px-2 py-0.5 text-xs bg-[hsl(160_84%_39%)/20] text-[hsl(160_84%_60%)] rounded-full">Free</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-lg ${getStatusColor(record.billing.status)}`}>
                        {record.billing.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-white/50">
                      {record.billing.nextBillAt
                        ? new Date(record.billing.nextBillAt).toLocaleDateString()
                        : "N/A"}
                    </td>
                  </tr>
                ))}
                {(!records?.records || records.records.length === 0) && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-white/40">
                      No billing records found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cleanup Confirm Dialog */}
      <ConfirmDialog
        open={showCleanupConfirm}
        onOpenChange={setShowCleanupConfirm}
        title="Cleanup Orphaned Records"
        description="This will delete billing records for servers that no longer exist in VirtFusion. Continue?"
        confirmText="Cleanup"
        variant="destructive"
        onConfirm={() => cleanupMutation.mutate()}
        isPending={cleanupMutation.isPending}
      />

      {/* End Trial Confirm Dialog */}
      <ConfirmDialog
        open={showEndTrialConfirm}
        onOpenChange={setShowEndTrialConfirm}
        title="End Trial"
        description="Are you sure you want to end this trial? The server will be powered off."
        confirmText="End Trial"
        variant="destructive"
        onConfirm={() => {
          if (selectedRecord) {
            endTrialMutation.mutate(parseInt(selectedRecord.billing.virtfusionServerId));
          }
        }}
        isPending={endTrialMutation.isPending}
      />

      {/* Suspend Confirm Dialog */}
      <ConfirmDialog
        open={showSuspendConfirm}
        onOpenChange={setShowSuspendConfirm}
        title="Suspend Server"
        description={`Suspend server ${selectedRecord?.billing?.virtfusionServerId}? This will stop the server.`}
        confirmText="Suspend"
        variant="destructive"
        onConfirm={() => {
          if (selectedRecord) {
            suspendMutation.mutate(selectedRecord.billing.id);
          }
        }}
        isPending={suspendMutation.isPending}
      />

      {/* Edit Modal */}
      {showEditModal && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[hsl(215_21%_11%)] border border-white/10 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-white mb-4">Edit Billing Record</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1">Next Bill Date</label>
                <input
                  type="date"
                  defaultValue={selectedRecord.billing.nextBillAt?.split("T")[0]}
                  id="nextBillAt"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:ring-2 focus:ring-[hsl(210_100%_50%)/40] outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="freeServer"
                  defaultChecked={selectedRecord.billing.freeServer}
                  className="rounded"
                />
                <label htmlFor="freeServer" className="text-sm text-white/70 flex items-center gap-2">
                  <Gift className="h-4 w-4 text-[hsl(160_84%_60%)]" />
                  Free Server (Complimentary)
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 text-white/60 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const nextBillAt = (document.getElementById("nextBillAt") as HTMLInputElement).value;
                  const freeServer = (document.getElementById("freeServer") as HTMLInputElement).checked;
                  updateRecordMutation.mutate({
                    id: selectedRecord.billing.id,
                    data: {
                      nextBillAt: nextBillAt ? new Date(nextBillAt).toISOString() : undefined,
                      freeServer,
                    },
                  });
                }}
                className="px-4 py-2 bg-[hsl(210_100%_50%)] text-white rounded-lg hover:bg-[hsl(210_100%_45%)] transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Due Date Modal */}
      {showDueDateModal && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[hsl(215_21%_11%)] border border-white/10 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-white mb-2">Change Due Date</h3>
            <p className="text-sm text-white/50 mb-4">
              Set a new billing due date for {selectedRecord.serverName || `Server #${selectedRecord.billing.virtfusionServerId}`}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1">New Due Date</label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:ring-2 focus:ring-[hsl(210_100%_50%)/40] outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowDueDateModal(false)}
                className="px-4 py-2 text-white/60 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDueDate}
                disabled={!newDueDate || updateRecordMutation.isPending}
                className="px-4 py-2 bg-[hsl(210_100%_50%)] text-white rounded-lg hover:bg-[hsl(210_100%_45%)] transition-colors disabled:opacity-50"
              >
                {updateRecordMutation.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
