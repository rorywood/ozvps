import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { billingApi } from "../lib/api";
import { toast } from "sonner";
import { CreditCard, RefreshCw, Play, DollarSign, Calendar, Gift, AlertTriangle } from "lucide-react";

export default function Billing() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
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

  const unsuspendMutation = useMutation({
    mutationFn: (id: number) => billingApi.unsuspendRecord(id),
    onSuccess: () => {
      toast.success("Server unsuspended");
      queryClient.invalidateQueries({ queryKey: ["billing-records"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateRecordMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => billingApi.updateRecord(id, data),
    onSuccess: () => {
      toast.success("Record updated");
      queryClient.invalidateQueries({ queryKey: ["billing-records"] });
      setSelectedRecord(null);
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Billing</h1>
        <button
          onClick={() => runJobMutation.mutate()}
          disabled={runJobMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${runJobMutation.isPending ? "animate-spin" : ""}`} />
          Run Billing Job
        </button>
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

      {/* Filter */}
      <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-4 mb-6">
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Plan</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Price</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Next Bill</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {records?.records?.map((record: any) => (
                  <tr key={record.billing.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900 dark:text-white">{record.billing.virtfusionServerId}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{record.user?.name || "Unknown"}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{record.user?.email || "N/A"}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-900 dark:text-white">{record.plan?.name || "N/A"}</span>
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
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedRecord(record)}
                          className="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-lg text-sm hover:bg-blue-500/20 transition-colors"
                        >
                          Edit
                        </button>
                        {record.billing.status === "suspended" && (
                          <button
                            onClick={() => unsuspendMutation.mutate(record.billing.id)}
                            disabled={unsuspendMutation.isPending}
                            className="flex items-center gap-1 px-3 py-1 bg-green-500/10 text-green-400 rounded-lg text-sm hover:bg-green-500/20 transition-colors"
                          >
                            <Play className="h-3 w-3" />
                            Unsuspend
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {(!records?.records || records.records.length === 0) && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
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
      {selectedRecord && (
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
                onClick={() => setSelectedRecord(null)}
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
    </div>
  );
}
