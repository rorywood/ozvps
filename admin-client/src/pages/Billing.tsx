import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { billingApi, serversApi } from "../lib/api";
import { toast } from "sonner";
import { CreditCard, RefreshCw, Play, Pause, DollarSign, Calendar, Gift, X, Trash2, Clock, Loader2, AlertTriangle } from "lucide-react";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { AdminPageHeader } from "../components/ui/admin-surfaces";

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

  const { data: attention, isLoading: attentionLoading } = useQuery({
    queryKey: ["billing-attention"],
    queryFn: () => billingApi.getAttention(12),
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
      queryClient.invalidateQueries({ queryKey: ["billing-attention"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const cleanupMutation = useMutation({
    mutationFn: billingApi.cleanupOrphaned,
    onSuccess: (data) => {
      toast.success(`Cleaned up ${data.cleaned} orphaned records`);
      queryClient.invalidateQueries({ queryKey: ["billing-records"] });
      queryClient.invalidateQueries({ queryKey: ["billing-stats"] });
      queryClient.invalidateQueries({ queryKey: ["billing-attention"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const suspendMutation = useMutation({
    mutationFn: (id: number) => billingApi.suspendRecord(id, "Admin manual suspension"),
    onSuccess: () => {
      toast.success("Server suspended");
      queryClient.invalidateQueries({ queryKey: ["billing-records"] });
      queryClient.invalidateQueries({ queryKey: ["billing-stats"] });
      queryClient.invalidateQueries({ queryKey: ["billing-attention"] });
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
      queryClient.invalidateQueries({ queryKey: ["billing-attention"] });
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
      queryClient.invalidateQueries({ queryKey: ["billing-attention"] });
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
      queryClient.invalidateQueries({ queryKey: ["billing-attention"] });
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
      queryClient.invalidateQueries({ queryKey: ["billing-attention"] });
      setShowEditModal(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);

  const formatDateTime = (value?: string | null) => {
    if (!value) return "Not set";
    return new Date(value).toLocaleString("en-AU", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

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

  const visibleRecords = records?.records ?? [];
  const selectedStatusTone =
    selectedRecord?.billing.status === "suspended"
      ? "text-[hsl(0_84%_70%)]"
      : selectedRecord?.billing.status === "unpaid"
        ? "text-[hsl(14_100%_70%)]"
        : "text-white";

  return (
    <div>
      <AdminPageHeader
        title="Billing"
        description="Keep renewals, overdue services, trial conversions, and manual billing actions under control."
        actions={
          <>
          <button
            onClick={() => setShowCleanupConfirm(true)}
            disabled={cleanupMutation.isPending}
            className="flex items-center gap-2 rounded-xl border border-[hsl(14_100%_60%)/30] bg-[hsl(14_100%_60%)/10] px-4 py-2 text-sm text-[hsl(14_100%_70%)] transition-colors hover:bg-[hsl(14_100%_60%)/20]"
          >
            <Trash2 className={`h-4 w-4 ${cleanupMutation.isPending ? "animate-spin" : ""}`} />
            Cleanup Orphaned
          </button>
          <button
            onClick={() => runJobMutation.mutate()}
            disabled={runJobMutation.isPending}
            className="flex items-center gap-2 rounded-xl bg-[hsl(210_100%_50%)] px-4 py-2 text-sm text-white transition-colors hover:bg-[hsl(210_100%_45%)]"
          >
            <RefreshCw className={`h-4 w-4 ${runJobMutation.isPending ? "animate-spin" : ""}`} />
            Run Billing Job
          </button>
          </>
        }
      />

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.96)_0%,rgba(9,14,24,0.98)_100%)] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.2)]">
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
          <div className="rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.96)_0%,rgba(9,14,24,0.98)_100%)] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.2)]">
            <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Active</p>
            <p className="text-xl font-bold text-[hsl(160_84%_60%)]">{stats.statusCounts.active || 0}</p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.96)_0%,rgba(9,14,24,0.98)_100%)] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.2)]">
            <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Suspended</p>
            <p className="text-xl font-bold text-[hsl(0_84%_70%)]">{stats.statusCounts.suspended || 0}</p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.96)_0%,rgba(9,14,24,0.98)_100%)] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.2)]">
            <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Due Soon</p>
            <p className="text-xl font-bold text-[hsl(14_100%_70%)]">{stats.dueSoonCount}</p>
          </div>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="rounded-2xl border border-[hsl(14_100%_60%)/20] bg-[linear-gradient(180deg,rgba(15,23,42,0.96)_0%,rgba(9,14,24,0.98)_100%)] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.2)]">
            <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Overdue</p>
            <p className="text-xl font-bold text-[hsl(14_100%_70%)]">{stats.attentionCounts.overdue}</p>
          </div>
          <div className="rounded-2xl border border-[hsl(45_100%_51%)/20] bg-[linear-gradient(180deg,rgba(15,23,42,0.96)_0%,rgba(9,14,24,0.98)_100%)] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.2)]">
            <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Suspending Soon</p>
            <p className="text-xl font-bold text-[hsl(45_100%_60%)]">{stats.attentionCounts.suspendingSoon}</p>
          </div>
          <div className="rounded-2xl border border-[hsl(0_84%_60%)/20] bg-[linear-gradient(180deg,rgba(15,23,42,0.96)_0%,rgba(9,14,24,0.98)_100%)] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.2)]">
            <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Admin Suspended</p>
            <p className="text-xl font-bold text-[hsl(0_84%_70%)]">{stats.attentionCounts.adminSuspended}</p>
          </div>
          <div className="rounded-2xl border border-[hsl(210_100%_50%)/20] bg-[linear-gradient(180deg,rgba(15,23,42,0.96)_0%,rgba(9,14,24,0.98)_100%)] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.2)]">
            <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Due in 24h</p>
            <p className="text-xl font-bold text-[hsl(210_100%_70%)]">{stats.attentionCounts.dueToday}</p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.96)_0%,rgba(9,14,24,0.98)_100%)] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.2)]">
            <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Active Trials</p>
            <p className="text-xl font-bold text-white">{stats.attentionCounts.trials}</p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.96)_0%,rgba(9,14,24,0.98)_100%)] p-4 mb-6 shadow-[0_18px_48px_rgba(0,0,0,0.2)]">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-[hsl(45_100%_60%)]" />
            <h2 className="text-lg font-semibold text-white">Needs Attention</h2>
          </div>
          <p className="text-sm text-white/40">Overdue, suspended, or approaching suspension</p>
        </div>

        {attentionLoading ? (
          <div className="flex justify-center py-6">
            <RefreshCw className="h-6 w-6 animate-spin text-white/40" />
          </div>
        ) : !attention?.records?.length ? (
          <div className="rounded-lg border border-white/8 bg-white/5 px-4 py-6 text-sm text-white/50">
            No billing records currently need urgent attention.
          </div>
        ) : (
          <div className="space-y-3">
            {attention.records.map((record) => (
              <button
                key={record.billing.id}
                onClick={() => setSelectedRecord(record)}
                className="w-full rounded-lg border border-white/8 bg-white/5 px-4 py-3 text-left hover:bg-white/[0.07] transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white">
                        {record.serverName || `Server #${record.billing.virtfusionServerId}`}
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded ${getStatusColor(record.billing.status)}`}>
                        {record.billing.status}
                      </span>
                      <span className="px-2 py-0.5 text-xs rounded bg-[hsl(45_100%_51%)/15] text-[hsl(45_100%_60%)] border border-[hsl(45_100%_51%)/20]">
                        {record.attentionReason}
                      </span>
                    </div>
                    <p className="text-sm text-white/55 mt-1">
                      {record.user?.email || "Unknown user"}{record.plan?.name ? ` • ${record.plan.name}` : ""}
                    </p>
                  </div>
                  <div className="text-right text-sm text-white/50 shrink-0">
                    <p>Next bill: {formatDateTime(record.billing.nextBillAt)}</p>
                    <p>Suspend at: {formatDateTime(record.billing.suspendAt)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.96)_0%,rgba(9,14,24,0.98)_100%)] overflow-hidden shadow-[0_18px_48px_rgba(0,0,0,0.2)]">
          <div className="border-b border-white/8 px-5 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[hsl(210_100%_65%)]">
                  Billing Queue
                </p>
                <h2 className="mt-2 text-lg font-semibold text-white">Recurring records</h2>
                <p className="mt-1 text-sm text-white/40">
                  Review live billing state, select a record, and apply operational actions without leaving the queue.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">Visible</p>
                  <p className="mt-1 text-sm font-medium text-white">{visibleRecords.length} record{visibleRecords.length !== 1 ? "s" : ""}</p>
                </div>
                <div className="min-w-[180px]">
                  <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-white/30">
                    Status filter
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:ring-2 focus:ring-[hsl(210_100%_50%)/35]"
                  >
                    <option value="">All records</option>
                    <option value="active">Active</option>
                    <option value="paid">Paid</option>
                    <option value="unpaid">Unpaid</option>
                    <option value="suspended">Suspended</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-white/40" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-white/40">Server</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-white/40">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-white/40">Plan</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-white/40">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-white/40">Renewal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {visibleRecords.map((record: any) => (
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
                          <p
                            className="mt-1 max-w-[240px] truncate font-mono text-xs text-white/35"
                            title={record.serverUuid || record.billing.virtfusionServerId}
                          >
                            {record.serverUuid || `VF-${record.billing.virtfusionServerId}`}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-white">
                            {record.user?.name || record.user?.email?.split("@")[0] || "Unknown"}
                          </p>
                          <p className="mt-1 text-sm text-white/45">{record.user?.email || "N/A"}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <p className="font-medium text-white">{formatCurrency(record.billing.monthlyPriceCents)}</p>
                          <div className="flex flex-wrap items-center gap-2">
                            {record.plan?.name ? (
                              <span className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-white/45">
                                {record.plan.name}
                              </span>
                            ) : null}
                            {record.billing.isTrial ? (
                              <span className="flex items-center gap-1 rounded-full bg-[hsl(14_100%_60%)/20] px-2 py-0.5 text-xs text-[hsl(14_100%_70%)]">
                                <Clock className="h-3 w-3" />
                                Trial
                              </span>
                            ) : null}
                            {record.billing.freeServer ? (
                              <span className="rounded-full bg-[hsl(160_84%_39%)/20] px-2 py-0.5 text-xs text-[hsl(160_84%_60%)]">
                                Free
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded-lg ${getStatusColor(record.billing.status)}`}>
                          {record.billing.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-white/55">
                          <p>{record.billing.nextBillAt ? formatDateTime(record.billing.nextBillAt) : "Not scheduled"}</p>
                          <p className="mt-1 text-xs text-white/30">
                            Suspend: {record.billing.suspendAt ? formatDateTime(record.billing.suspendAt) : "Not set"}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {visibleRecords.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-white/40">
                        No billing records found for this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.96)_0%,rgba(9,14,24,0.98)_100%)] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.2)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[hsl(210_100%_65%)]">
                  Operator Rail
                </p>
                <h3 className="mt-2 text-base font-semibold text-white">Controls and selection</h3>
              </div>
              {selectedRecord ? (
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="flex items-center gap-1 rounded-lg border border-white/8 bg-white/5 px-2.5 py-1.5 text-xs text-white/50 transition-colors hover:bg-white/8 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </button>
              ) : null}
            </div>

            {!selectedRecord ? (
              <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center">
                <CreditCard className="mx-auto h-8 w-8 text-white/20" />
                <p className="mt-3 text-sm font-medium text-white/70">Select a billing record</p>
                <p className="mt-2 text-sm leading-6 text-white/35">
                  Pick a row from the queue to inspect renewal timing, free-server status, trial state, and manual actions.
                </p>
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/30">Selected server</p>
                      <h3 className={`mt-2 text-base font-semibold ${selectedStatusTone}`}>
                        {selectedRecord.serverName || `Server #${selectedRecord.billing.virtfusionServerId}`}
                      </h3>
                    </div>
                    <span className={`px-2.5 py-1 text-xs rounded-lg ${getStatusColor(selectedRecord.billing.status)}`}>
                      {selectedRecord.billing.status}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-white/8 bg-black/10 p-3">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-white/30">Customer</p>
                      <p className="mt-2 text-sm font-medium text-white">
                        {selectedRecord.user?.name || "Unknown user"}
                      </p>
                      <p className="mt-1 text-xs text-white/40">{selectedRecord.user?.email || "No email on file"}</p>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-black/10 p-3">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-white/30">Commercial state</p>
                      <p className="mt-2 text-sm font-medium text-white">
                        {formatCurrency(selectedRecord.billing.monthlyPriceCents)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedRecord.plan?.name ? (
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-white/45">
                            {selectedRecord.plan.name}
                          </span>
                        ) : null}
                        {selectedRecord.billing.isTrial ? (
                          <span className="flex items-center gap-1 rounded-full bg-[hsl(14_100%_60%)/20] px-2 py-0.5 text-xs text-[hsl(14_100%_70%)]">
                            <Clock className="h-3 w-3" />
                            Trial
                          </span>
                        ) : null}
                        {selectedRecord.billing.freeServer ? (
                          <span className="rounded-full bg-[hsl(160_84%_39%)/20] px-2 py-0.5 text-xs text-[hsl(160_84%_60%)]">
                            Free
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-black/10 p-3">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-white/30">Next bill</p>
                      <p className="mt-2 text-sm font-medium text-white">{formatDateTime(selectedRecord.billing.nextBillAt)}</p>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-black/10 p-3">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-white/30">Suspend at</p>
                      <p className="mt-2 text-sm font-medium text-white">{formatDateTime(selectedRecord.billing.suspendAt)}</p>
                    </div>
                  </div>
                  {selectedRecord.attentionReason ? (
                    <div className="mt-4 rounded-xl border border-[hsl(45_100%_51%)/18] bg-[hsl(45_100%_51%)/10] p-3 text-sm text-[hsl(45_100%_60%)]">
                      Attention: {selectedRecord.attentionReason}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/30">Actions</p>
                  <div className="mt-4 grid gap-2">
                    <button
                      onClick={handleOpenDueDateModal}
                      className="flex items-center justify-center gap-2 rounded-xl border border-[hsl(210_100%_50%)/30] bg-[hsl(210_100%_50%)/10] px-4 py-2.5 text-sm text-[hsl(210_100%_70%)] transition-colors hover:bg-[hsl(210_100%_50%)/20]"
                    >
                      <Calendar className="h-4 w-4" />
                      Change due date
                    </button>

                    {!selectedRecord.billing.isTrial ? (
                      <button
                        onClick={handleToggleFree}
                        disabled={updateRecordMutation.isPending}
                        className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors ${
                          selectedRecord.billing.freeServer
                            ? "border-[hsl(14_100%_60%)/30] bg-[hsl(14_100%_60%)/10] text-[hsl(14_100%_70%)] hover:bg-[hsl(14_100%_60%)/20]"
                            : "border-[hsl(160_84%_39%)/30] bg-[hsl(160_84%_39%)/10] text-[hsl(160_84%_60%)] hover:bg-[hsl(160_84%_39%)/20]"
                        }`}
                      >
                        <Gift className="h-4 w-4" />
                        {selectedRecord.billing.freeServer ? "Remove free status" : "Mark as free server"}
                      </button>
                    ) : null}

                    {selectedRecord.billing.isTrial && !selectedRecord.billing.trialEndedAt ? (
                      <button
                        onClick={() => setShowEndTrialConfirm(true)}
                        disabled={endTrialMutation.isPending}
                        className="flex items-center justify-center gap-2 rounded-xl border border-[hsl(14_100%_60%)/30] bg-[hsl(14_100%_60%)/10] px-4 py-2.5 text-sm text-[hsl(14_100%_70%)] transition-colors hover:bg-[hsl(14_100%_60%)/20]"
                      >
                        <Clock className="h-4 w-4" />
                        End trial
                      </button>
                    ) : null}

                    {!selectedRecord.billing.freeServer && !selectedRecord.billing.isTrial ? (
                      <button
                        onClick={() => forceChargeMutation.mutate(selectedRecord.billing.virtfusionServerId)}
                        disabled={forceChargeMutation.isPending}
                        className="flex items-center justify-center gap-2 rounded-xl border border-[hsl(209_100%_50%)/30] bg-[hsl(209_100%_50%)/10] px-4 py-2.5 text-sm text-[hsl(209_100%_70%)] transition-colors hover:bg-[hsl(209_100%_50%)/20]"
                      >
                        {forceChargeMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Charging...
                          </>
                        ) : (
                          <>
                            <DollarSign className="h-4 w-4" />
                            Force charge
                          </>
                        )}
                      </button>
                    ) : null}

                    {selectedRecord.billing.status === "suspended" ? (
                      <button
                        onClick={() => unsuspendMutation.mutate(selectedRecord.billing.id)}
                        disabled={unsuspendMutation.isPending}
                        className="flex items-center justify-center gap-2 rounded-xl border border-[hsl(160_84%_39%)/30] bg-[hsl(160_84%_39%)/10] px-4 py-2.5 text-sm text-[hsl(160_84%_60%)] transition-colors hover:bg-[hsl(160_84%_39%)/20]"
                      >
                        {unsuspendMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Unsuspending...
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4" />
                            Unsuspend server
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowSuspendConfirm(true)}
                        disabled={suspendMutation.isPending}
                        className="flex items-center justify-center gap-2 rounded-xl border border-[hsl(14_100%_60%)/30] bg-[hsl(14_100%_60%)/10] px-4 py-2.5 text-sm text-[hsl(14_100%_70%)] transition-colors hover:bg-[hsl(14_100%_60%)/20]"
                      >
                        <Pause className="h-4 w-4" />
                        Suspend server
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
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
