import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "../lib/api";
import { toast } from "sonner";
import {
  Search, Wallet, Ban, RefreshCw, Mail, Key, LogOut, CheckCircle,
  Send, Lock, ShieldOff, Trash2, AlertTriangle, XCircle, Loader2,
  ArrowUpRight, ArrowDownLeft, MoreHorizontal, Users as UsersIcon,
} from "lucide-react";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { PromptDialog } from "../components/ui/prompt-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

function UserAvatar({ name, email, size = "md" }: { name?: string; email?: string; size?: "sm" | "md" | "lg" }) {
  const initials = name
    ? name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : (email?.[0] ?? "?").toUpperCase();
  const sizeClass = size === "sm" ? "w-8 h-8 text-xs" : size === "lg" ? "w-12 h-12 text-base" : "w-9 h-9 text-sm";
  return (
    <div className={`${sizeClass} rounded-full bg-[hsl(210_100%_50%)/15] border border-[hsl(210_100%_50%)/25] flex items-center justify-center font-semibold text-[hsl(210_100%_65%)] shrink-0`}>
      {initials}
    </div>
  );
}

function StatusBadge({ blocked, suspended }: { blocked?: boolean; suspended?: boolean }) {
  if (blocked) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[hsl(0_84%_60%)/15] text-[hsl(0_84%_70%)] text-xs font-medium rounded-full border border-[hsl(0_84%_60%)/25]">
      <span className="w-1.5 h-1.5 rounded-full bg-[hsl(0_84%_60%)] inline-block" />
      Blocked
    </span>
  );
  if (suspended) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[hsl(14_100%_60%)/15] text-[hsl(14_100%_70%)] text-xs font-medium rounded-full border border-[hsl(14_100%_60%)/25]">
      <span className="w-1.5 h-1.5 rounded-full bg-[hsl(14_100%_60%)] inline-block" />
      Suspended
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[hsl(160_84%_39%)/15] text-[hsl(160_84%_60%)] text-xs font-medium rounded-full border border-[hsl(160_84%_39%)/25]">
      <span className="w-1.5 h-1.5 rounded-full bg-[hsl(160_84%_39%)] inline-block" />
      Active
    </span>
  );
}

export default function Users() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [purgeConfirmText, setPurgeConfirmText] = useState("");
  const [purgeResults, setPurgeResults] = useState<any>(null);
  const [showPurgeResults, setShowPurgeResults] = useState(false);
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [showAdjustWalletDialog, setShowAdjustWalletDialog] = useState(false);
  const [walletAmount, setWalletAmount] = useState("");
  const [walletDescription, setWalletDescription] = useState("");

  const queryClient = useQueryClient();

  const { data: allUsers, isLoading: loadingUsers, error: usersError, refetch: refetchUsers, isFetching } = useQuery({
    queryKey: ["users-list"],
    queryFn: () => usersApi.list(1, 100),
    retry: 1,
  });

  const { data: searchResults, isLoading: searching } = useQuery({
    queryKey: ["users-search", searchQuery],
    queryFn: () => usersApi.search(searchQuery),
    enabled: searchQuery.length >= 2,
  });

  const displayUsers = searchQuery.length >= 2 ? searchResults?.users : allUsers?.users;
  const isLoadingList = searchQuery.length >= 2 ? searching : loadingUsers;

  const { data: userDetails, isLoading: loadingUser } = useQuery({
    queryKey: ["user", selectedUser?.auth0UserId],
    queryFn: () => usersApi.getUser(selectedUser.auth0UserId),
    enabled: !!selectedUser?.auth0UserId,
  });

  const { data: transactions } = useQuery({
    queryKey: ["user-transactions", selectedUser?.auth0UserId],
    queryFn: () => usersApi.getTransactions(selectedUser.auth0UserId),
    enabled: !!selectedUser?.auth0UserId,
  });

  const blockMutation = useMutation({
    mutationFn: ({ auth0UserId, blocked, reason }: { auth0UserId: string; blocked: boolean; reason?: string }) =>
      usersApi.blockUser(auth0UserId, blocked, reason),
    onSuccess: (_, variables) => {
      toast.success(variables.blocked ? "Account blocked" : "Account unblocked");
      queryClient.invalidateQueries({ queryKey: ["user", selectedUser?.auth0UserId] });
      queryClient.invalidateQueries({ queryKey: ["users-list"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const suspendMutation = useMutation({
    mutationFn: ({ auth0UserId, suspended, reason }: { auth0UserId: string; suspended: boolean; reason?: string }) =>
      usersApi.suspendUser(auth0UserId, suspended, reason),
    onSuccess: (_, variables) => {
      toast.success(variables.suspended ? "Account suspended" : "Account unsuspended");
      queryClient.invalidateQueries({ queryKey: ["user", selectedUser?.auth0UserId] });
      queryClient.invalidateQueries({ queryKey: ["users-list"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const adjustWalletMutation = useMutation({
    mutationFn: ({ auth0UserId, amountCents, description }: { auth0UserId: string; amountCents: number; description: string }) =>
      usersApi.adjustWallet(auth0UserId, amountCents, description),
    onSuccess: () => {
      toast.success("Wallet adjusted");
      queryClient.invalidateQueries({ queryKey: ["user", selectedUser?.auth0UserId] });
      queryClient.invalidateQueries({ queryKey: ["user-transactions", selectedUser?.auth0UserId] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const purgeMutation = useMutation({
    mutationFn: (auth0UserId: string) => usersApi.purgeUser(auth0UserId),
    onSuccess: (data) => {
      setShowPurgeConfirm(false);
      setPurgeConfirmText("");
      setPurgeResults(data);
      setShowPurgeResults(true);
      if (data.success) toast.success("User purged");
      else toast.warning("Purge completed with errors");
      setSelectedUser(null);
      queryClient.invalidateQueries({ queryKey: ["users-list"] });
    },
    onError: (err: any) => {
      setShowPurgeConfirm(false);
      setPurgeConfirmText("");
      setPurgeResults({ success: false, error: err.message || "Failed to purge user" });
      setShowPurgeResults(true);
      toast.error(err.message || "Failed to purge user");
    },
  });

  const handleAdjustWallet = () => {
    if (!userDetails?.user) return;
    const cents = Math.round(parseFloat(walletAmount) * 100);
    if (isNaN(cents)) { toast.error("Invalid amount"); return; }
    if (!walletDescription.trim()) { toast.error("Description is required"); return; }
    adjustWalletMutation.mutate({ auth0UserId: userDetails.user.auth0UserId, amountCents: cents, description: walletDescription.trim() });
    setShowAdjustWalletDialog(false);
    setWalletAmount("");
    setWalletDescription("");
  };

  const fmt = (cents: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);

  const txLabel = (tx: any) => {
    if (tx.type === "adjustment_credit") return tx.metadata?.description || "Credit Added";
    if (tx.type === "adjustment_debit") return tx.metadata?.description || "Balance Deducted";
    if (tx.type === "credit") return "Wallet Top-Up";
    if (tx.type === "debit") return tx.metadata?.description || "Server Charge";
    if (tx.type === "refund") return "Refund";
    return tx.type?.replace(/_/g, " ");
  };

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Users</h1>
          {allUsers?.pagination && (
            <p className="text-sm text-white/40 mt-0.5">{allUsers.pagination.total} total accounts</p>
          )}
        </div>
        <button
          onClick={() => refetchUsers()}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/8 text-white/60 rounded-lg hover:bg-white/8 hover:text-white transition-colors text-sm disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* ── User list ── */}
        <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl flex flex-col overflow-hidden">
          {/* Search */}
          <div className="p-3 border-b border-white/8">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
              <input
                type="text"
                placeholder="Search by email or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/8 rounded-lg focus:ring-1 focus:ring-[hsl(210_100%_50%)/50] outline-none text-white text-sm placeholder-white/25 transition-colors"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {usersError && (
              <div className="m-3 p-3 bg-[hsl(0_84%_60%)/10] border border-[hsl(0_84%_60%)/20] rounded-lg text-[hsl(0_84%_70%)] text-xs">
                Error: {(usersError as any)?.message || "Failed to load users"}
              </div>
            )}

            {isLoadingList ? (
              <div className="flex items-center justify-center py-12 text-white/30">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : displayUsers?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-white/30 gap-2">
                <UsersIcon className="h-8 w-8 opacity-30" />
                <p className="text-sm">{searchQuery.length >= 2 ? "No users found" : "No users yet"}</p>
              </div>
            ) : (
              <div className="p-2 space-y-0.5">
                {displayUsers?.map((user: any) => {
                  const isSelected = selectedUser?.auth0UserId === user.auth0UserId;
                  return (
                    <button
                      key={user.auth0UserId}
                      onClick={() => setSelectedUser(user)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-3 group ${
                        isSelected
                          ? "bg-[hsl(210_100%_50%)/12] border border-[hsl(210_100%_50%)/25]"
                          : "border border-transparent hover:bg-white/4"
                      }`}
                    >
                      <UserAvatar name={user.name} email={user.email} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium truncate leading-tight ${isSelected ? "text-white" : "text-white/80"}`}>
                          {user.name || "No name"}
                        </p>
                        <p className="text-xs text-white/40 truncate mt-0.5">{user.email}</p>
                      </div>
                      {user.blocked && (
                        <span className="shrink-0 w-2 h-2 rounded-full bg-[hsl(0_84%_60%)]" title="Blocked" />
                      )}
                      {user.suspended && !user.blocked && (
                        <span className="shrink-0 w-2 h-2 rounded-full bg-[hsl(14_100%_60%)]" title="Suspended" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── User detail ── */}
        <div className="min-w-0">
          {!selectedUser ? (
            <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl flex flex-col items-center justify-center py-20 text-center">
              <div className="w-14 h-14 rounded-full bg-white/4 flex items-center justify-center mb-3">
                <UsersIcon className="h-6 w-6 text-white/20" />
              </div>
              <p className="text-white/40 text-sm">Select a user to view details</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* ── Profile card ── */}
              <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-6">
                {/* Header */}
                <div className="flex items-start gap-4 mb-6">
                  <UserAvatar name={selectedUser.name} email={selectedUser.email} size="lg" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-semibold text-white leading-tight">
                        {selectedUser.name || "No name"}
                      </h2>
                      <StatusBadge blocked={selectedUser.blocked} suspended={selectedUser.suspended} />
                    </div>
                    <p className="text-sm text-white/50 mt-0.5">{selectedUser.email}</p>
                  </div>
                </div>

                {loadingUser ? (
                  <div className="space-y-2 animate-pulse">
                    <div className="h-3 bg-white/8 rounded w-2/3" />
                    <div className="h-3 bg-white/8 rounded w-1/2" />
                    <div className="h-3 bg-white/8 rounded w-3/4" />
                  </div>
                ) : userDetails?.user && (
                  <>
                    {/* Info grid */}
                    <div className="grid grid-cols-2 gap-3 mb-6">
                      <InfoRow label="VirtFusion ID" value={userDetails.user.virtFusionUserId || "Not linked"} mono />
                      <InfoRow
                        label="Email verification"
                        value={
                          userDetails.user.emailVerifiedAuth0 ? "Verified" :
                          userDetails.user.emailVerifiedOverride ? "Manual override" : "Not verified"
                        }
                        valueColor={
                          userDetails.user.emailVerifiedAuth0 ? "text-[hsl(160_84%_60%)]" :
                          userDetails.user.emailVerifiedOverride ? "text-[hsl(14_100%_70%)]" : "text-[hsl(0_84%_70%)]"
                        }
                      />
                      <InfoRow
                        label="2FA"
                        value={userDetails.user.twoFactorEnabled ? "Enabled" : "Disabled"}
                        valueColor={userDetails.user.twoFactorEnabled ? "text-[hsl(160_84%_60%)]" : "text-white/40"}
                      />
                      <InfoRow
                        label="Active sessions"
                        value={String(userDetails.user.activeSessions)}
                      />
                    </div>

                    {/* Actions */}
                    <div className="pt-5 border-t border-white/6">
                      <p className="text-xs font-medium text-white/30 uppercase tracking-wider mb-3">Actions</p>
                      <div className="flex flex-wrap gap-2">
                        {/* Suspend */}
                        <ActionButton
                          onClick={() => userDetails.user.suspended
                            ? suspendMutation.mutate({ auth0UserId: userDetails.user.auth0UserId, suspended: false })
                            : setShowSuspendDialog(true)
                          }
                          disabled={suspendMutation.isPending}
                          pending={suspendMutation.isPending}
                          variant={userDetails.user.suspended ? "success" : "warning"}
                          icon={<Lock className="h-3.5 w-3.5" />}
                          label={userDetails.user.suspended ? "Unsuspend" : "Suspend"}
                        />

                        {/* Block */}
                        <ActionButton
                          onClick={() => userDetails.user.blocked
                            ? blockMutation.mutate({ auth0UserId: userDetails.user.auth0UserId, blocked: false })
                            : setShowBlockDialog(true)
                          }
                          disabled={blockMutation.isPending}
                          pending={blockMutation.isPending}
                          variant={userDetails.user.blocked ? "success" : "danger"}
                          icon={<Ban className="h-3.5 w-3.5" />}
                          label={userDetails.user.blocked ? "Unblock" : "Block"}
                        />

                        {/* Email verification */}
                        {userDetails.user.emailVerifiedAuth0 ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[hsl(160_84%_39%)/10] text-[hsl(160_84%_60%)] border border-[hsl(160_84%_39%)/20] rounded-lg text-xs font-medium">
                            <CheckCircle className="h-3.5 w-3.5" />
                            Email Verified
                          </span>
                        ) : !userDetails.user.emailVerifiedOverride && (
                          <ActionButton
                            onClick={() => usersApi.resendVerification(userDetails.user.auth0UserId)
                              .then(() => toast.success("Verification email sent"))
                              .catch((err: any) => toast.error(err.message || "Failed to send"))
                            }
                            variant="neutral"
                            icon={<Send className="h-3.5 w-3.5" />}
                            label="Resend Verification"
                          />
                        )}

                        {/* Revoke sessions */}
                        <ActionButton
                          onClick={() => setShowRevokeDialog(true)}
                          variant="neutral"
                          icon={<LogOut className="h-3.5 w-3.5" />}
                          label="Revoke Sessions"
                        />
                      </div>

                      {/* Danger zone */}
                      <div className="mt-3 pt-3 border-t border-white/4 flex gap-2">
                        <ActionButton
                          onClick={() => setShowPurgeConfirm(true)}
                          variant="danger"
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                          label="Purge User"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* ── Wallet card ── */}
              {userDetails?.user?.wallet && (
                <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-white/30 uppercase tracking-wider">Wallet Balance</p>
                    <button
                      onClick={() => setShowAdjustWalletDialog(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[hsl(210_100%_50%)/10] text-[hsl(210_100%_65%)] border border-[hsl(210_100%_50%)/20] rounded-lg hover:bg-[hsl(210_100%_50%)/20] transition-colors text-xs font-medium"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                      Adjust
                    </button>
                  </div>
                  <p className="text-3xl font-bold text-white mt-1">
                    {fmt(userDetails.user.wallet.balanceCents)}
                  </p>
                  <p className="text-xs text-white/30 mt-1">AUD prepaid credit</p>
                </div>
              )}

              {/* ── Transactions ── */}
              {selectedUser && (
                <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-6">
                  <p className="text-xs font-medium text-white/30 uppercase tracking-wider mb-4">Recent Transactions</p>
                  {transactions?.transactions?.length ? (
                    <div className="space-y-1 max-h-72 overflow-y-auto -mx-1 px-1">
                      {transactions.transactions.slice(0, 30).map((tx: any) => {
                        const isCredit = tx.amountCents >= 0;
                        return (
                          <div key={tx.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-white/3 transition-colors">
                            <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${isCredit ? "bg-[hsl(160_84%_39%)/15]" : "bg-[hsl(0_84%_60%)/10]"}`}>
                              {isCredit
                                ? <ArrowDownLeft className="h-3 w-3 text-[hsl(160_84%_60%)]" />
                                : <ArrowUpRight className="h-3 w-3 text-[hsl(0_84%_70%)]" />
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium text-white/85 truncate">{txLabel(tx)}</p>
                                <p className={`text-sm font-semibold tabular-nums shrink-0 ${isCredit ? "text-[hsl(160_84%_60%)]" : "text-[hsl(0_84%_70%)]"}`}>
                                  {isCredit ? "+" : ""}{fmt(tx.amountCents)}
                                </p>
                              </div>
                              {tx.metadata?.reason && (
                                <p className="text-xs text-white/40 mt-0.5 truncate">Note: {tx.metadata.reason}</p>
                              )}
                              {tx.metadata?.serverName && (
                                <p className="text-xs text-white/30 truncate">Server: {tx.metadata.serverName}</p>
                              )}
                              {tx.metadata?.stripePaymentIntentId && (
                                <p className="text-xs font-mono text-white/25 truncate">{tx.metadata.stripePaymentIntentId.slice(0, 24)}…</p>
                              )}
                              <p className="text-xs text-white/25 mt-0.5">
                                {new Date(tx.createdAt).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" })}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-white/30 text-center py-6">No transactions</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Dialogs ── */}
      <PromptDialog
        open={showSuspendDialog}
        onOpenChange={setShowSuspendDialog}
        title="Suspend Account"
        description="Enter a reason for suspending this account. The user can still log in but will be restricted."
        placeholder="e.g., Terms of Service violation"
        label="Suspension Reason"
        confirmText="Suspend"
        onConfirm={(reason) => {
          if (userDetails?.user) suspendMutation.mutate({ auth0UserId: userDetails.user.auth0UserId, suspended: true, reason });
        }}
        isPending={suspendMutation.isPending}
      />

      <PromptDialog
        open={showBlockDialog}
        onOpenChange={setShowBlockDialog}
        title="Block Account"
        description="Enter a reason for blocking this account. The user will not be able to log in."
        placeholder="e.g., Fraudulent activity"
        label="Block Reason"
        confirmText="Block"
        onConfirm={(reason) => {
          if (userDetails?.user) blockMutation.mutate({ auth0UserId: userDetails.user.auth0UserId, blocked: true, reason });
        }}
        isPending={blockMutation.isPending}
      />

      <ConfirmDialog
        open={showRevokeDialog}
        onOpenChange={setShowRevokeDialog}
        title="Revoke All Sessions"
        description="This will log the user out of all active sessions. They will need to log in again."
        confirmText="Revoke Sessions"
        onConfirm={() => {
          if (userDetails?.user) {
            fetch(`/api/users/${encodeURIComponent(userDetails.user.auth0UserId)}/revoke-sessions`, {
              method: "POST",
              credentials: "include",
            }).then(() => {
              toast.success("Sessions revoked");
              queryClient.invalidateQueries({ queryKey: ["user", selectedUser?.auth0UserId] });
            });
          }
        }}
      />

      <Dialog open={showAdjustWalletDialog} onOpenChange={setShowAdjustWalletDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust Wallet Balance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wallet-amount">Amount in dollars (negative to debit)</Label>
              <Input
                id="wallet-amount"
                type="number"
                step="0.01"
                value={walletAmount}
                onChange={(e) => setWalletAmount(e.target.value)}
                placeholder="e.g., 10.00 or -5.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wallet-desc">Description</Label>
              <Input
                id="wallet-desc"
                type="text"
                value={walletDescription}
                onChange={(e) => setWalletDescription(e.target.value)}
                placeholder="e.g., Courtesy credit adjustment"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowAdjustWalletDialog(false); setWalletAmount(""); setWalletDescription(""); }}>
              Cancel
            </Button>
            <Button onClick={handleAdjustWallet} disabled={!walletAmount || !walletDescription || adjustWalletMutation.isPending}>
              {adjustWalletMutation.isPending ? "Adjusting..." : "Adjust Balance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purge confirm */}
      {showPurgeConfirm && userDetails?.user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[hsl(215_21%_11%)] border border-white/10 rounded-xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-[hsl(0_84%_60%)/12] rounded-lg border border-[hsl(0_84%_60%)/20]">
                <AlertTriangle className="h-5 w-5 text-[hsl(0_84%_70%)]" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Purge User</h3>
                <p className="text-xs text-white/40">{userDetails.user.email}</p>
              </div>
            </div>
            <div className="mb-5 p-3 bg-[hsl(0_84%_60%)/8] border border-[hsl(0_84%_60%)/20] rounded-lg text-xs text-[hsl(0_84%_70%)] space-y-1">
              <p className="font-medium mb-1.5">This permanently deletes:</p>
              {["All servers in VirtFusion", "VirtFusion user account", "Stripe customer & payment methods", "Auth0 account", "All local DB records"].map((item) => (
                <p key={item} className="flex items-center gap-1.5"><span className="opacity-50">•</span>{item}</p>
              ))}
            </div>
            <p className="text-xs text-white/50 mb-2">
              Type <span className="font-mono font-bold text-[hsl(0_84%_70%)]">PURGE</span> to confirm:
            </p>
            <input
              type="text"
              value={purgeConfirmText}
              onChange={(e) => setPurgeConfirmText(e.target.value)}
              placeholder="PURGE"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white font-mono text-sm focus:ring-1 focus:ring-[hsl(0_84%_60%)/50] outline-none mb-5"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowPurgeConfirm(false); setPurgeConfirmText(""); }}
                className="px-4 py-2 text-sm text-white/50 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => purgeMutation.mutate(userDetails.user.auth0UserId)}
                disabled={purgeConfirmText !== "PURGE" || purgeMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-[hsl(0_84%_60%)] text-white rounded-lg text-sm font-medium hover:bg-[hsl(0_84%_55%)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {purgeMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Purging...</> : <><Trash2 className="h-4 w-4" />Purge Forever</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Purge results */}
      {showPurgeResults && purgeResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[hsl(215_21%_11%)] border border-white/10 rounded-xl shadow-2xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-lg border ${purgeResults.success ? "bg-[hsl(160_84%_39%)/12] border-[hsl(160_84%_39%)/20]" : "bg-[hsl(0_84%_60%)/12] border-[hsl(0_84%_60%)/20]"}`}>
                {purgeResults.success
                  ? <CheckCircle className="h-5 w-5 text-[hsl(160_84%_60%)]" />
                  : <XCircle className="h-5 w-5 text-[hsl(0_84%_70%)]" />
                }
              </div>
              <h3 className="text-base font-semibold text-white">
                {purgeResults.success ? "Purge Successful" : "Purge Had Errors"}
              </h3>
            </div>

            {purgeResults.error ? (
              <p className="text-sm text-[hsl(0_84%_70%)] bg-[hsl(0_84%_60%)/10] border border-[hsl(0_84%_60%)/20] rounded-lg p-3">{purgeResults.error}</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-1.5 text-sm">
                  {[
                    { key: "auth0Deleted", label: "Auth0 Account" },
                    { key: "virtfusionUserDeleted", label: "VirtFusion User" },
                    { key: "stripeCustomerDeleted", label: "Stripe Customer" },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2">
                      {purgeResults.results?.[key]
                        ? <CheckCircle className="h-4 w-4 text-[hsl(160_84%_60%)]" />
                        : <XCircle className="h-4 w-4 text-[hsl(0_84%_70%)]" />
                      }
                      <span className="text-white/60">{label}</span>
                    </div>
                  ))}
                </div>
                {purgeResults.results?.localRecordsDeleted && (
                  <div className="p-3 bg-white/4 rounded-lg">
                    <p className="text-xs font-medium text-white/40 mb-2">Local records deleted</p>
                    <div className="grid grid-cols-2 gap-1 text-xs text-white/50">
                      {Object.entries(purgeResults.results.localRecordsDeleted).map(([key, value]) => (
                        <div key={key} className="flex justify-between gap-2">
                          <span>{key}</span>
                          <span className="font-mono text-white/70">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {purgeResults.results?.errors?.length > 0 && (
                  <div className="p-3 bg-[hsl(0_84%_60%)/10] border border-[hsl(0_84%_60%)/20] rounded-lg">
                    <p className="text-xs font-medium text-[hsl(0_84%_70%)] mb-1.5">Errors</p>
                    <ul className="text-xs text-[hsl(0_84%_70%)] space-y-1">
                      {purgeResults.results.errors.map((err: string, i: number) => <li key={i}>• {err}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end mt-5">
              <button
                onClick={() => { setShowPurgeResults(false); setPurgeResults(null); }}
                className="px-4 py-2 bg-white/6 text-white/60 rounded-lg hover:bg-white/10 hover:text-white transition-colors text-sm"
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

// ── Sub-components ──

function InfoRow({ label, value, mono, valueColor }: { label: string; value: string; mono?: boolean; valueColor?: string }) {
  return (
    <div className="p-3 bg-white/3 rounded-lg border border-white/5">
      <p className="text-xs text-white/35 mb-1">{label}</p>
      <p className={`text-sm font-medium truncate ${mono ? "font-mono" : ""} ${valueColor ?? "text-white/85"}`}>{value}</p>
    </div>
  );
}

type ActionVariant = "success" | "warning" | "danger" | "neutral";

function ActionButton({
  onClick,
  disabled,
  pending,
  variant,
  icon,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
  variant: ActionVariant;
  icon: React.ReactNode;
  label: string;
}) {
  const styles: Record<ActionVariant, string> = {
    success: "bg-[hsl(160_84%_39%)/10] text-[hsl(160_84%_60%)] border-[hsl(160_84%_39%)/25] hover:bg-[hsl(160_84%_39%)/18]",
    warning: "bg-[hsl(14_100%_60%)/10] text-[hsl(14_100%_70%)] border-[hsl(14_100%_60%)/25] hover:bg-[hsl(14_100%_60%)/18]",
    danger:  "bg-[hsl(0_84%_60%)/10] text-[hsl(0_84%_70%)] border-[hsl(0_84%_60%)/25] hover:bg-[hsl(0_84%_60%)/18]",
    neutral: "bg-white/5 text-white/60 border-white/10 hover:bg-white/8 hover:text-white/80",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${styles[variant]}`}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}
