import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { billingApi } from "../lib/api";
import { toast } from "sonner";
import { CreditCard, RefreshCw, Play, Pause, DollarSign, Calendar, Gift, X, Trash2 } from "lucide-react";

export default function Billing() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDueDateModal, setShowDueDateModal] = useState(false);
  const [newDueDate, setNewDueDate] = useState("");
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
    onSuccess: () => toast.success("Billing job started"),
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
      active: "bg-green-500/20 text-green-400 border border-green-500/30",
      paid: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
      unpaid: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
      suspended: "bg-red-500/20 text-red-400 border border-red-500/30",
      cancelled: "bg-gray-500/20 text-gray-400 border border-gray-500/30",
    };
    return colors[status] || "bg-gray-500/20 text-gray-400 border border-gray-500/30";
  };

  const handleToggleFree = () => {
    if (!selectedRecord) return;
    updateRecordMutation.mutate({
      id: selectedRecord.billing.id,
      data: { freeServer: !selectedRecord.billing.freeServer },
    });
    // Update local state
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Billing</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (confirm("This will delete billing records for servers that no longer exist in VirtFusion. Continue?")) {
                cleanupMutation.mutate();
              }
            }}
            disabled={cleanupMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500/10 text-orange-400 border border-orange-500/30 rounded-lg hover:bg-orange-500/20 transition-colors"
          >
            <Trash2 className={`h-4 w-4 ${cleanupMutation.isPending ? "animate-spin" : ""}`} />
            Cleanup Orphaned
          </button>
          <button
            onClick={() => runJobMutation.mutate()}
            disabled={runJobMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${runJobMutation.isPending ? "animate-spin" : ""}`} />
            Run Billing Job
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <DollarSign className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">MRR</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(stats.mrr)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Active</p>
            <p className="text-xl font-bold text-green-500">{stats.statusCounts.active || 0}</p>
          </div>
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Suspended</p>
            <p className="text-xl font-bold text-red-500">{stats.statusCounts.suspended || 0}</p>
          </div>
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Due Soon</p>
            <p className="text-xl font-bold text-yellow-500">{stats.dueSoonCount}</p>
          </div>
        </div>
      )}

      {/* Filter and Quick Actions */}
      <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-4 mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter by status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
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
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Selected:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {selectedRecord.serverName || `Server #${selectedRecord.billing.virtfusionServerId}`}
                </span>
                <span className={`px-2 py-0.5 text-xs rounded ${getStatusColor(selectedRecord.billing.status)}`}>
                  {selectedRecord.billing.status}
                </span>
                {selectedRecord.billing.freeServer && (
                  <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded">Free</span>
                )}
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleOpenDueDateModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-lg text-sm hover:bg-blue-500/20 transition-colors"
                >
                  <Calendar className="h-4 w-4" />
                  Change Due Date
                </button>
                <button
                  onClick={handleToggleFree}
                  disabled={updateRecordMutation.isPending}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    selectedRecord.billing.freeServer
                      ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/20"
                      : "bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20"
                  }`}
                >
                  <Gift className="h-4 w-4" />
                  {selectedRecord.billing.freeServer ? "Remove Free" : "Set Free"}
                </button>
                {selectedRecord.billing.status === "suspended" ? (
                  <button
                    onClick={() => unsuspendMutation.mutate(selectedRecord.billing.id)}
                    disabled={unsuspendMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 text-green-400 border border-green-500/30 rounded-lg text-sm hover:bg-green-500/20 transition-colors"
                  >
                    <Play className="h-4 w-4" />
                    Unsuspend
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (confirm(`Suspend server ${selectedRecord.billing.virtfusionServerId}? This will stop the server.`)) {
                        suspendMutation.mutate(selectedRecord.billing.id);
                      }
                    }}
                    disabled={suspendMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 text-orange-400 border border-orange-500/30 rounded-lg text-sm hover:bg-orange-500/20 transition-colors"
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
      <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Server</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Price</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Next Bill</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {records?.records?.map((record: any) => (
                  <tr
                    key={record.billing.id}
                    onClick={() => setSelectedRecord(record)}
                    className={`cursor-pointer transition-colors ${
                      selectedRecord?.billing.id === record.billing.id
                        ? "bg-blue-500/10 dark:bg-blue-500/20"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800/30"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {record.serverName || `Server #${record.billing.virtfusionServerId}`}
                        </p>
                        {record.serverUuid && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate max-w-[180px]" title={record.serverUuid}>
                            {record.serverUuid}
                          </p>
                        )}
                        {!record.serverUuid && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            ID: {record.billing.virtfusionServerId}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{record.user?.name || "Unknown"}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{record.user?.email || "N/A"}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {formatCurrency(record.billing.monthlyPriceCents)}
                      </span>
                      {record.billing.freeServer && (
                        <span className="ml-2 px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded-full">Free</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-lg ${getStatusColor(record.billing.status)}`}>
                        {record.billing.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {record.billing.nextBillAt
                        ? new Date(record.billing.nextBillAt).toLocaleDateString()
                        : "N/A"}
                    </td>
                  </tr>
                ))}
                {(!records?.records || records.records.length === 0) && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      No billing records found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Edit Billing Record</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Next Bill Date</label>
                <input
                  type="date"
                  defaultValue={selectedRecord.billing.nextBillAt?.split("T")[0]}
                  id="nextBillAt"
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="freeServer"
                  defaultChecked={selectedRecord.billing.freeServer}
                  className="rounded"
                />
                <label htmlFor="freeServer" className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <Gift className="h-4 w-4 text-green-500" />
                  Free Server (Complimentary)
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
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
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Due Date Modal */}
      {showDueDateModal && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Change Due Date</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Set a new billing due date for {selectedRecord.serverName || `Server #${selectedRecord.billing.virtfusionServerId}`}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Due Date</label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowDueDateModal(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDueDate}
                disabled={!newDueDate || updateRecordMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
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
