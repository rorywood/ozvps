import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { billingApi } from "../lib/api";
import { toast } from "sonner";
import { CreditCard, RefreshCw, Play, DollarSign } from "lucide-react";

export default function Billing() {
  const [statusFilter, setStatusFilter] = useState<string>("");
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

  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: "bg-green-100 text-green-800",
      paid: "bg-blue-100 text-blue-800",
      unpaid: "bg-yellow-100 text-yellow-800",
      suspended: "bg-red-100 text-red-800",
      cancelled: "bg-gray-100 text-gray-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
        <button
          onClick={() => runJobMutation.mutate()}
          disabled={runJobMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <RefreshCw className={`h-4 w-4 ${runJobMutation.isPending ? "animate-spin" : ""}`} />
          Run Billing Job
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-3">
              <DollarSign className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-sm text-gray-500">MRR</p>
                <p className="text-xl font-bold">{formatCurrency(stats.mrr)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500">Active</p>
            <p className="text-xl font-bold text-green-600">{stats.statusCounts.active || 0}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500">Suspended</p>
            <p className="text-xl font-bold text-red-600">{stats.statusCounts.suspended || 0}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500">Due Soon</p>
            <p className="text-xl font-bold text-yellow-600">{stats.dueSoonCount}</p>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Filter by status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
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
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Server</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Next Bill</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {records?.records?.map((record: any) => (
                  <tr key={record.billing.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-medium">{record.billing.virtfusionServerId}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">{record.user?.name || "Unknown"}</p>
                        <p className="text-sm text-gray-500">{record.user?.email || "N/A"}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm">{record.plan?.name || "N/A"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">
                        {formatCurrency(record.billing.monthlyPriceCents)}
                      </span>
                      {record.billing.freeServer && (
                        <span className="ml-2 text-xs text-green-600">(Free)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(record.billing.status)}`}>
                        {record.billing.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {record.billing.nextBillAt
                        ? new Date(record.billing.nextBillAt).toLocaleDateString()
                        : "N/A"}
                    </td>
                    <td className="px-4 py-3">
                      {record.billing.status === "suspended" && (
                        <button
                          onClick={() => unsuspendMutation.mutate(record.billing.id)}
                          disabled={unsuspendMutation.isPending}
                          className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200"
                        >
                          <Play className="h-3 w-3" />
                          Unsuspend
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {(!records?.records || records.records.length === 0) && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      No billing records found
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
