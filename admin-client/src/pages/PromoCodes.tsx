import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { promoCodesApi, type PromoCode, type PromoCodeUsage, type CreatePromoCodeInput } from "../lib/api";
import { toast } from "sonner";
import { Tag, Plus, RefreshCw, Trash2, Edit2, Eye, Power, X, Percent, DollarSign, Users, Clock } from "lucide-react";
import { ConfirmDialog } from "../components/ui/confirm-dialog";

export default function PromoCodes() {
  const [selectedPromo, setSelectedPromo] = useState<PromoCode | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [usageData, setUsageData] = useState<PromoCodeUsage[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeletePromo, setPendingDeletePromo] = useState<PromoCode | null>(null);
  const queryClient = useQueryClient();

  const { data: promoCodes, isLoading } = useQuery({
    queryKey: ["promo-codes"],
    queryFn: promoCodesApi.list,
  });

  const { data: stats } = useQuery({
    queryKey: ["promo-codes-stats"],
    queryFn: promoCodesApi.getStats,
  });

  const createMutation = useMutation({
    mutationFn: promoCodesApi.create,
    onSuccess: () => {
      toast.success("Promo code created");
      queryClient.invalidateQueries({ queryKey: ["promo-codes"] });
      queryClient.invalidateQueries({ queryKey: ["promo-codes-stats"] });
      setShowCreateModal(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => promoCodesApi.update(id, data),
    onSuccess: () => {
      toast.success("Promo code updated");
      queryClient.invalidateQueries({ queryKey: ["promo-codes"] });
      setShowEditModal(false);
      setSelectedPromo(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: promoCodesApi.toggle,
    onSuccess: (data) => {
      toast.success(`Promo code ${data.promoCode.active ? "activated" : "deactivated"}`);
      queryClient.invalidateQueries({ queryKey: ["promo-codes"] });
      queryClient.invalidateQueries({ queryKey: ["promo-codes-stats"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: promoCodesApi.delete,
    onSuccess: () => {
      toast.success("Promo code deleted");
      queryClient.invalidateQueries({ queryKey: ["promo-codes"] });
      queryClient.invalidateQueries({ queryKey: ["promo-codes-stats"] });
      setSelectedPromo(null);
      setPendingDeletePromo(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleViewUsage = async (promo: PromoCode) => {
    try {
      const data = await promoCodesApi.get(promo.id);
      setUsageData(data.usageHistory);
      setSelectedPromo(promo);
      setShowUsageModal(true);
    } catch (err: any) {
      toast.error("Failed to load usage history");
    }
  };

  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);

  const formatDiscount = (promo: PromoCode) => {
    if (promo.discountType === "percentage") {
      return `${promo.discountValue}%`;
    }
    return formatCurrency(promo.discountValue);
  };

  const isExpired = (promo: PromoCode) => {
    if (!promo.validUntil) return false;
    return new Date(promo.validUntil) < new Date();
  };

  const isMaxedOut = (promo: PromoCode) => {
    if (promo.maxUsesTotal === null) return false;
    return promo.currentUses >= promo.maxUsesTotal;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Promo Codes</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[hsl(210_100%_50%)] text-white rounded-lg hover:bg-[hsl(210_100%_45%)] transition-colors text-sm"
        >
          <Plus className="h-4 w-4" />
          Create Code
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[hsl(210_100%_50%)/15] rounded-lg">
                <Tag className="h-6 w-6 text-[hsl(210_100%_60%)]" />
              </div>
              <div>
                <p className="text-xs text-white/40 uppercase tracking-wide">Total Codes</p>
                <p className="text-xl font-bold text-white">{stats.totalCodes}</p>
              </div>
            </div>
          </div>
          <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-4">
            <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Active</p>
            <p className="text-xl font-bold text-[hsl(160_84%_60%)]">{stats.activeCodes}</p>
          </div>
          <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-4">
            <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Inactive</p>
            <p className="text-xl font-bold text-white/50">{stats.inactiveCodes}</p>
          </div>
          <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-4">
            <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Total Uses</p>
            <p className="text-xl font-bold text-[hsl(270_70%_70%)]">{stats.totalUsage}</p>
          </div>
        </div>
      )}

      {/* Promo Codes Table */}
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Discount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Usage</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Validity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-white/40 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {promoCodes?.promoCodes?.map((promo) => (
                  <tr key={promo.id} className="hover:bg-white/3">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="px-2 py-1 bg-white/8 rounded font-mono text-sm text-white">
                          {promo.code}
                        </code>
                        {promo.appliesTo === "specific" && (
                          <span className="px-1.5 py-0.5 text-xs bg-[hsl(270_70%_60%)/20] text-[hsl(270_70%_70%)] rounded">Specific Plans</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {promo.discountType === "percentage" ? (
                          <Percent className="h-4 w-4 text-[hsl(210_100%_60%)]" />
                        ) : (
                          <DollarSign className="h-4 w-4 text-[hsl(160_84%_60%)]" />
                        )}
                        <span className="font-medium text-white">{formatDiscount(promo)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-white/40" />
                        <span className="text-white">
                          {promo.currentUses}
                          {promo.maxUsesTotal !== null && <span className="text-white/50"> / {promo.maxUsesTotal}</span>}
                        </span>
                        {promo.maxUsesPerUser !== null && (
                          <span className="text-xs text-white/40">
                            ({promo.maxUsesPerUser}/user)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-white/40" />
                        {promo.validUntil ? (
                          <span className={`text-sm ${isExpired(promo) ? "text-[hsl(0_84%_70%)]" : "text-white/70"}`}>
                            {isExpired(promo) ? "Expired" : `Until ${new Date(promo.validUntil).toLocaleDateString()}`}
                          </span>
                        ) : (
                          <span className="text-sm text-white/40">No expiry</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {promo.active && !isExpired(promo) && !isMaxedOut(promo) ? (
                        <span className="px-2 py-1 text-xs bg-[hsl(160_84%_39%)/20] text-[hsl(160_84%_60%)] border border-[hsl(160_84%_39%)/30] rounded-lg">
                          Active
                        </span>
                      ) : isMaxedOut(promo) ? (
                        <span className="px-2 py-1 text-xs bg-[hsl(14_100%_60%)/20] text-[hsl(14_100%_70%)] border border-[hsl(14_100%_60%)/30] rounded-lg">
                          Maxed Out
                        </span>
                      ) : isExpired(promo) ? (
                        <span className="px-2 py-1 text-xs bg-[hsl(0_84%_60%)/20] text-[hsl(0_84%_70%)] border border-[hsl(0_84%_60%)/30] rounded-lg">
                          Expired
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs bg-white/10 text-white/50 border border-white/10 rounded-lg">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleViewUsage(promo)}
                          className="p-1.5 text-white/40 hover:text-white hover:bg-white/8 rounded-lg transition-colors"
                          title="View Usage"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedPromo(promo);
                            setShowEditModal(true);
                          }}
                          className="p-1.5 text-[hsl(210_100%_60%)] hover:bg-[hsl(210_100%_50%)/10] rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => toggleMutation.mutate(promo.id)}
                          disabled={toggleMutation.isPending}
                          className={`p-1.5 rounded-lg transition-colors ${
                            promo.active
                              ? "text-[hsl(14_100%_70%)] hover:bg-[hsl(14_100%_60%)/10]"
                              : "text-[hsl(160_84%_60%)] hover:bg-[hsl(160_84%_39%)/10]"
                          }`}
                          title={promo.active ? "Deactivate" : "Activate"}
                        >
                          <Power className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setPendingDeletePromo(promo);
                            setShowDeleteConfirm(true);
                          }}
                          disabled={deleteMutation.isPending}
                          className="p-1.5 text-[hsl(0_84%_70%)] hover:bg-[hsl(0_84%_60%)/10] rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!promoCodes?.promoCodes || promoCodes.promoCodes.length === 0) && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-white/40">
                      No promo codes found. Create your first one!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          setShowDeleteConfirm(open);
          if (!open) setPendingDeletePromo(null);
        }}
        title="Delete Promo Code"
        description={`Delete promo code "${pendingDeletePromo?.code}"? This cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={() => {
          if (pendingDeletePromo) {
            deleteMutation.mutate(pendingDeletePromo.id);
          }
        }}
        isPending={deleteMutation.isPending}
      />

      {/* Create Modal */}
      {showCreateModal && (
        <PromoCodeModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
        />
      )}

      {/* Edit Modal */}
      {showEditModal && selectedPromo && (
        <PromoCodeModal
          promo={selectedPromo}
          onClose={() => {
            setShowEditModal(false);
            setSelectedPromo(null);
          }}
          onSubmit={(data) => updateMutation.mutate({ id: selectedPromo.id, data })}
          isLoading={updateMutation.isPending}
        />
      )}

      {/* Usage History Modal */}
      {showUsageModal && selectedPromo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[hsl(215_21%_11%)] border border-white/10 rounded-xl shadow-2xl p-6 w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                Usage History: <code className="text-[hsl(210_100%_70%)]">{selectedPromo.code}</code>
              </h3>
              <button
                onClick={() => {
                  setShowUsageModal(false);
                  setSelectedPromo(null);
                  setUsageData([]);
                }}
                className="p-1 text-white/40 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-auto flex-1">
              {usageData.length === 0 ? (
                <p className="text-center text-white/40 py-8">No usage recorded yet</p>
              ) : (
                <table className="w-full">
                  <thead className="bg-white/5 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase">User</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase">Original</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase">Discount</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase">Final</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {usageData.map((usage) => (
                      <tr key={usage.id}>
                        <td className="px-4 py-2 text-sm text-white">
                          {usage.userEmail || usage.auth0UserId.substring(0, 16) + "..."}
                        </td>
                        <td className="px-4 py-2 text-sm text-white/50">{formatCurrency(usage.originalPriceCents)}</td>
                        <td className="px-4 py-2 text-sm text-[hsl(160_84%_60%)]">-{formatCurrency(usage.discountAppliedCents)}</td>
                        <td className="px-4 py-2 text-sm font-medium text-white">{formatCurrency(usage.finalPriceCents)}</td>
                        <td className="px-4 py-2 text-sm text-white/50">
                          {new Date(usage.usedAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex justify-end mt-4 pt-4 border-t border-white/8">
              <button
                onClick={() => {
                  setShowUsageModal(false);
                  setSelectedPromo(null);
                  setUsageData([]);
                }}
                className="px-4 py-2 text-white/60 hover:text-white transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Promo Code Modal Component
function PromoCodeModal({
  promo,
  onClose,
  onSubmit,
  isLoading,
}: {
  promo?: PromoCode;
  onClose: () => void;
  onSubmit: (data: CreatePromoCodeInput) => void;
  isLoading: boolean;
}) {
  const [code, setCode] = useState(promo?.code || "");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">(promo?.discountType || "percentage");
  const [discountValue, setDiscountValue] = useState(
    promo?.discountValue
      ? (promo.discountType === "fixed" ? (promo.discountValue / 100).toString() : promo.discountValue.toString())
      : ""
  );
  const [appliesTo, setAppliesTo] = useState<"all" | "specific">(promo?.appliesTo || "all");
  const [maxUsesTotal, setMaxUsesTotal] = useState(promo?.maxUsesTotal?.toString() || "");
  const [maxUsesPerUser, setMaxUsesPerUser] = useState(promo?.maxUsesPerUser?.toString() || "1");
  const [validUntil, setValidUntil] = useState(
    promo?.validUntil ? new Date(promo.validUntil).toISOString().split("T")[0] : ""
  );
  const [active, setActive] = useState(promo?.active ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const valueToStore = discountType === "fixed"
      ? Math.round(parseFloat(discountValue) * 100)
      : parseFloat(discountValue);

    const data: CreatePromoCodeInput = {
      code: code.toUpperCase(),
      discountType,
      discountValue: valueToStore,
      appliesTo,
      maxUsesTotal: maxUsesTotal ? parseInt(maxUsesTotal) : null,
      maxUsesPerUser: maxUsesPerUser ? parseInt(maxUsesPerUser) : 1,
      validUntil: validUntil ? new Date(validUntil).toISOString() : null,
      active,
    };

    onSubmit(data);
  };

  const inputClass = "w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:ring-2 focus:ring-[hsl(210_100%_50%)/40] outline-none placeholder-white/30 text-sm disabled:opacity-50";
  const labelClass = "block text-sm font-medium text-white/60 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[hsl(215_21%_11%)] border border-white/10 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-white mb-4">
          {promo ? "Edit Promo Code" : "Create Promo Code"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>Promo Code *</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={!!promo}
              placeholder="e.g., SAVE20"
              className={`${inputClass} font-mono`}
              required
              minLength={3}
              maxLength={20}
            />
            {promo && (
              <p className="text-xs text-white/40 mt-1">Code cannot be changed after creation</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Discount Type</label>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as "percentage" | "fixed")}
                className={inputClass}
              >
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed Amount</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>
                {discountType === "percentage" ? "Percentage *" : "Amount (AUD) *"}
              </label>
              <input
                type="number"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === "percentage" ? "e.g., 20" : "e.g., 5.00"}
                className={inputClass}
                required
                min={discountType === "percentage" ? 1 : 0.01}
                max={discountType === "percentage" ? 100 : undefined}
                step={discountType === "percentage" ? 1 : 0.01}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Applies To</label>
            <select
              value={appliesTo}
              onChange={(e) => setAppliesTo(e.target.value as "all" | "specific")}
              className={inputClass}
            >
              <option value="all">All Plans</option>
              <option value="specific">Specific Plans (not yet supported)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Max Total Uses</label>
              <input
                type="number"
                value={maxUsesTotal}
                onChange={(e) => setMaxUsesTotal(e.target.value)}
                placeholder="Unlimited"
                className={inputClass}
                min={1}
              />
              <p className="text-xs text-white/30 mt-1">Leave empty for unlimited</p>
            </div>
            <div>
              <label className={labelClass}>Max Uses Per User</label>
              <input
                type="number"
                value={maxUsesPerUser}
                onChange={(e) => setMaxUsesPerUser(e.target.value)}
                placeholder="1"
                className={inputClass}
                min={1}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Valid Until</label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className={inputClass}
            />
            <p className="text-xs text-white/30 mt-1">Leave empty for no expiry</p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="active"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="active" className="text-sm text-white/70">
              Active (users can use this code)
            </label>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/8">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-white/60 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-[hsl(210_100%_50%)] text-white rounded-lg hover:bg-[hsl(210_100%_45%)] transition-colors disabled:opacity-50"
            >
              {isLoading ? "Saving..." : promo ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
