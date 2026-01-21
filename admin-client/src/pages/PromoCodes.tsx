import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { promoCodesApi, type PromoCode, type PromoCodeUsage, type CreatePromoCodeInput } from "../lib/api";
import { toast } from "sonner";
import { Tag, Plus, RefreshCw, Trash2, Edit2, Eye, Power, X, Percent, DollarSign, Users, Clock } from "lucide-react";

export default function PromoCodes() {
  const [selectedPromo, setSelectedPromo] = useState<PromoCode | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [usageData, setUsageData] = useState<PromoCodeUsage[]>([]);
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Promo Codes</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Code
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Tag className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Codes</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.totalCodes}</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Active</p>
            <p className="text-xl font-bold text-green-500">{stats.activeCodes}</p>
          </div>
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Inactive</p>
            <p className="text-xl font-bold text-gray-500">{stats.inactiveCodes}</p>
          </div>
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Total Uses</p>
            <p className="text-xl font-bold text-purple-500">{stats.totalUsage}</p>
          </div>
        </div>
      )}

      {/* Promo Codes Table */}
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Discount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Usage</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Validity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {promoCodes?.promoCodes?.map((promo) => (
                  <tr key={promo.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded font-mono text-sm text-gray-900 dark:text-white">
                          {promo.code}
                        </code>
                        {promo.appliesTo === "specific" && (
                          <span className="px-1.5 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded">Specific Plans</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {promo.discountType === "percentage" ? (
                          <Percent className="h-4 w-4 text-blue-500" />
                        ) : (
                          <DollarSign className="h-4 w-4 text-green-500" />
                        )}
                        <span className="font-medium text-gray-900 dark:text-white">{formatDiscount(promo)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-900 dark:text-white">
                          {promo.currentUses}
                          {promo.maxUsesTotal !== null && <span className="text-gray-500"> / {promo.maxUsesTotal}</span>}
                        </span>
                        {promo.maxUsesPerUser !== null && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            ({promo.maxUsesPerUser}/user)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-gray-400" />
                        {promo.validUntil ? (
                          <span className={`text-sm ${isExpired(promo) ? "text-red-500" : "text-gray-600 dark:text-gray-300"}`}>
                            {isExpired(promo) ? "Expired" : `Until ${new Date(promo.validUntil).toLocaleDateString()}`}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-500">No expiry</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {promo.active && !isExpired(promo) && !isMaxedOut(promo) ? (
                        <span className="px-2 py-1 text-xs bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg">
                          Active
                        </span>
                      ) : isMaxedOut(promo) ? (
                        <span className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-lg">
                          Maxed Out
                        </span>
                      ) : isExpired(promo) ? (
                        <span className="px-2 py-1 text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg">
                          Expired
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs bg-gray-500/20 text-gray-400 border border-gray-500/30 rounded-lg">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleViewUsage(promo)}
                          className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                          title="View Usage"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedPromo(promo);
                            setShowEditModal(true);
                          }}
                          className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-500/10 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => toggleMutation.mutate(promo.id)}
                          disabled={toggleMutation.isPending}
                          className={`p-1.5 rounded-lg transition-colors ${
                            promo.active
                              ? "text-yellow-500 hover:text-yellow-700 hover:bg-yellow-500/10"
                              : "text-green-500 hover:text-green-700 hover:bg-green-500/10"
                          }`}
                          title={promo.active ? "Deactivate" : "Activate"}
                        >
                          <Power className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete promo code "${promo.code}"? This cannot be undone.`)) {
                              deleteMutation.mutate(promo.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-500/10 rounded-lg transition-colors"
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
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      No promo codes found. Create your first one!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Usage History: <code className="text-blue-500">{selectedPromo.code}</code>
              </h3>
              <button
                onClick={() => {
                  setShowUsageModal(false);
                  setSelectedPromo(null);
                  setUsageData([]);
                }}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-auto flex-1">
              {usageData.length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400 py-8">No usage recorded yet</p>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">User</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Original</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Discount</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Final</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {usageData.map((usage) => (
                      <tr key={usage.id}>
                        <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">
                          {usage.userEmail || usage.auth0UserId.substring(0, 16) + "..."}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-500">{formatCurrency(usage.originalPriceCents)}</td>
                        <td className="px-4 py-2 text-sm text-green-500">-{formatCurrency(usage.discountAppliedCents)}</td>
                        <td className="px-4 py-2 text-sm font-medium text-gray-900 dark:text-white">{formatCurrency(usage.finalPriceCents)}</td>
                        <td className="px-4 py-2 text-sm text-gray-500">
                          {new Date(usage.usedAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex justify-end mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => {
                  setShowUsageModal(false);
                  setSelectedPromo(null);
                  setUsageData([]);
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
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
  // For fixed discounts, convert cents to dollars for display
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

    // For fixed discounts, convert dollars to cents for storage
    const valueToStore = discountType === "fixed"
      ? Math.round(parseFloat(discountValue) * 100) // dollars to cents
      : parseFloat(discountValue); // percentage stays as-is

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {promo ? "Edit Promo Code" : "Create Promo Code"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Code */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Promo Code *
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={!!promo}
              placeholder="e.g., SAVE20"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 font-mono"
              required
              minLength={3}
              maxLength={20}
            />
            {promo && (
              <p className="text-xs text-gray-500 mt-1">Code cannot be changed after creation</p>
            )}
          </div>

          {/* Discount Type & Value */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Discount Type
              </label>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as "percentage" | "fixed")}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed Amount</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {discountType === "percentage" ? "Percentage *" : "Amount (AUD) *"}
              </label>
              <input
                type="number"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === "percentage" ? "e.g., 20" : "e.g., 5.00"}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                required
                min={discountType === "percentage" ? 1 : 0.01}
                max={discountType === "percentage" ? 100 : undefined}
                step={discountType === "percentage" ? 1 : 0.01}
              />
              {discountType === "percentage" && (
                <p className="text-xs text-gray-500 mt-1">1-100</p>
              )}
              {discountType === "fixed" && (
                <p className="text-xs text-gray-500 mt-1">Enter dollar amount (e.g., 5 for $5.00)</p>
              )}
            </div>
          </div>

          {/* Applies To */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Applies To
            </label>
            <select
              value={appliesTo}
              onChange={(e) => setAppliesTo(e.target.value as "all" | "specific")}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="all">All Plans</option>
              <option value="specific">Specific Plans (not yet supported)</option>
            </select>
          </div>

          {/* Usage Limits */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Max Total Uses
              </label>
              <input
                type="number"
                value={maxUsesTotal}
                onChange={(e) => setMaxUsesTotal(e.target.value)}
                placeholder="Unlimited"
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                min={1}
              />
              <p className="text-xs text-gray-500 mt-1">Leave empty for unlimited</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Max Uses Per User
              </label>
              <input
                type="number"
                value={maxUsesPerUser}
                onChange={(e) => setMaxUsesPerUser(e.target.value)}
                placeholder="1"
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                min={1}
              />
            </div>
          </div>

          {/* Valid Until */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Valid Until
            </label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">Leave empty for no expiry</p>
          </div>

          {/* Active */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="active"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="active" className="text-sm text-gray-700 dark:text-gray-300">
              Active (users can use this code)
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isLoading ? "Saving..." : promo ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
