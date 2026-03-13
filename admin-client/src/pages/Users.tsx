import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "../lib/api";
import { toast } from "sonner";
import { Search, User, Wallet, Ban, RefreshCw, Mail, Key, LogOut, CheckCircle, Send, Lock, ShieldOff, Trash2, AlertTriangle, XCircle } from "lucide-react";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { PromptDialog } from "../components/ui/prompt-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export default function Users() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [purgeConfirmText, setPurgeConfirmText] = useState("");
  const [purgeResults, setPurgeResults] = useState<any>(null);
  const [showPurgeResults, setShowPurgeResults] = useState(false);

  // Dialog states replacing native dialogs
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
      toast.success(variables.blocked ? "Account blocked (cannot log in)" : "Account unblocked");
      queryClient.invalidateQueries({ queryKey: ["user", selectedUser?.auth0UserId] });
      queryClient.invalidateQueries({ queryKey: ["users-list"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const suspendMutation = useMutation({
    mutationFn: ({ auth0UserId, suspended, reason }: { auth0UserId: string; suspended: boolean; reason?: string }) =>
      usersApi.suspendUser(auth0UserId, suspended, reason),
    onSuccess: (_, variables) => {
      toast.success(variables.suspended ? "Account suspended (can log in but restricted)" : "Account unsuspended");
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
      if (data.success) {
        toast.success("User purged successfully");
      } else {
        toast.warning("Purge completed with some errors");
      }
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
    if (isNaN(cents)) {
      toast.error("Invalid amount");
      return;
    }
    if (!walletDescription.trim()) {
      toast.error("Description is required");
      return;
    }
    adjustWalletMutation.mutate({
      auth0UserId: userDetails.user.auth0UserId,
      amountCents: cents,
      description: walletDescription.trim(),
    });
    setShowAdjustWalletDialog(false);
    setWalletAmount("");
    setWalletDescription("");
  };

  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <button
          onClick={() => refetchUsers()}
          disabled={isFetching}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white/70 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User List Panel */}
        <div className="lg:col-span-1">
          <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-4">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
              <input
                type="text"
                placeholder="Search by email or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-[hsl(210_100%_50%)/40] outline-none text-white placeholder-white/30 transition-colors"
              />
            </div>

            {usersError && (
              <div className="p-3 mb-4 bg-[hsl(0_84%_60%)/10] border border-[hsl(0_84%_60%)/30] rounded-lg text-[hsl(0_84%_70%)] text-sm">
                Error loading users: {(usersError as any)?.message || "Unknown error"}
              </div>
            )}

            {isLoadingList ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-white/40" />
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
                {displayUsers?.map((user: any) => (
                  <button
                    key={user.auth0UserId}
                    onClick={() => setSelectedUser(user)}
                    className={`w-full text-left p-3 rounded-lg transition-all ${
                      selectedUser?.auth0UserId === user.auth0UserId
                        ? "bg-[hsl(210_100%_50%)/10] border border-[hsl(210_100%_50%)/30]"
                        : "bg-white/3 hover:bg-white/5 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-white/8 rounded-full">
                        <User className="h-4 w-4 text-white/50" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-white truncate">
                          {user.name || "No name"}
                        </p>
                        <p className="text-sm text-white/50 truncate">{user.email}</p>
                      </div>
                      {user.blocked && (
                        <span className="px-2 py-0.5 bg-[hsl(0_84%_60%)/20] text-[hsl(0_84%_70%)] text-xs rounded-full border border-[hsl(0_84%_60%)/30]">
                          Blocked
                        </span>
                      )}
                      {user.suspended && !user.blocked && (
                        <span className="px-2 py-0.5 bg-[hsl(14_100%_60%)/20] text-[hsl(14_100%_70%)] text-xs rounded-full border border-[hsl(14_100%_60%)/30]">
                          Suspended
                        </span>
                      )}
                    </div>
                  </button>
                ))}
                {(!displayUsers || displayUsers.length === 0) && (
                  <p className="text-center text-white/40 py-8">
                    {searchQuery.length >= 2 ? "No users found" : "No users yet"}
                  </p>
                )}
              </div>
            )}

            {allUsers?.pagination && !searchQuery && (
              <div className="mt-4 pt-4 border-t border-white/8 text-sm text-white/40 text-center">
                {allUsers.pagination.total} user{allUsers.pagination.total !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>

        {/* User Details */}
        <div className="lg:col-span-2">
          {selectedUser ? (
            <div className="space-y-6">
              {/* User Info */}
              <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-[hsl(210_100%_50%)/10] rounded-xl">
                      <User className="h-6 w-6 text-[hsl(210_100%_60%)]" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">
                        {selectedUser.name || "No name"}
                      </h2>
                      <p className="text-sm text-white/50">{selectedUser.email}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {selectedUser.blocked && (
                      <span className="px-3 py-1.5 bg-[hsl(0_84%_60%)/20] text-[hsl(0_84%_70%)] rounded-lg text-sm font-medium border border-[hsl(0_84%_60%)/30]">
                        Blocked
                      </span>
                    )}
                    {selectedUser.suspended && (
                      <span className="px-3 py-1.5 bg-[hsl(14_100%_60%)/20] text-[hsl(14_100%_70%)] rounded-lg text-sm font-medium border border-[hsl(14_100%_60%)/30]">
                        Suspended
                      </span>
                    )}
                  </div>
                </div>

                {loadingUser ? (
                  <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-white/10 rounded w-3/4"></div>
                    <div className="h-4 bg-white/10 rounded w-1/2"></div>
                  </div>
                ) : userDetails?.user && (
                  <div className="space-y-6">
                    {/* Info Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-white/5 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <Mail className="h-4 w-4 text-white/40" />
                          <span className="text-sm font-medium text-white/60">Account</span>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-white/50">Email</span>
                            <span className="font-medium text-white truncate ml-2">{userDetails.user.email}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/50">VirtFusion ID</span>
                            <span className="font-mono text-white">{userDetails.user.virtFusionUserId || "Not linked"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-white/5 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <Key className="h-4 w-4 text-white/40" />
                          <span className="text-sm font-medium text-white/60">Security</span>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-white/50">Email (Auth0)</span>
                            <span className={`font-medium ${userDetails.user.emailVerifiedAuth0 ? "text-[hsl(160_84%_60%)]" : "text-[hsl(0_84%_70%)]"}`}>
                              {userDetails.user.emailVerifiedAuth0 ? "Verified" : "Not Verified"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/50">Email (Override)</span>
                            <span className={`font-medium ${userDetails.user.emailVerifiedOverride ? "text-[hsl(14_100%_70%)]" : "text-white/40"}`}>
                              {userDetails.user.emailVerifiedOverride ? "Yes" : "No"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/50">2FA Status</span>
                            <span className={`font-medium ${userDetails.user.twoFactorEnabled ? "text-[hsl(160_84%_60%)]" : "text-white/40"}`}>
                              {userDetails.user.twoFactorEnabled ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/50">Active Sessions</span>
                            <span className="font-medium text-white">{userDetails.user.activeSessions}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-4 border-t border-white/8">
                      <h3 className="text-sm font-medium text-white/60 mb-3">Actions</h3>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            if (userDetails.user.suspended) {
                              suspendMutation.mutate({
                                auth0UserId: userDetails.user.auth0UserId,
                                suspended: false,
                              });
                            } else {
                              setShowSuspendDialog(true);
                            }
                          }}
                          disabled={suspendMutation.isPending}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                            userDetails.user.suspended
                              ? "bg-[hsl(160_84%_39%)/10] text-[hsl(160_84%_60%)] border border-[hsl(160_84%_39%)/30] hover:bg-[hsl(160_84%_39%)/20]"
                              : "bg-[hsl(14_100%_60%)/10] text-[hsl(14_100%_70%)] border border-[hsl(14_100%_60%)/30] hover:bg-[hsl(14_100%_60%)/20]"
                          }`}
                        >
                          <Lock className="h-4 w-4" />
                          {userDetails.user.suspended ? "Unsuspend Account" : "Suspend Account"}
                        </button>

                        <button
                          onClick={() => {
                            if (userDetails.user.blocked) {
                              blockMutation.mutate({
                                auth0UserId: userDetails.user.auth0UserId,
                                blocked: false,
                              });
                            } else {
                              setShowBlockDialog(true);
                            }
                          }}
                          disabled={blockMutation.isPending}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                            userDetails.user.blocked
                              ? "bg-[hsl(160_84%_39%)/10] text-[hsl(160_84%_60%)] border border-[hsl(160_84%_39%)/30] hover:bg-[hsl(160_84%_39%)/20]"
                              : "bg-[hsl(0_84%_60%)/10] text-[hsl(0_84%_70%)] border border-[hsl(0_84%_60%)/30] hover:bg-[hsl(0_84%_60%)/20]"
                          }`}
                        >
                          <Ban className="h-4 w-4" />
                          {userDetails.user.blocked ? "Unblock Account" : "Block Account"}
                        </button>

                        {userDetails.user.emailVerifiedAuth0 ? (
                          <div className="flex items-center gap-2 px-4 py-2 bg-[hsl(160_84%_39%)/10] text-[hsl(160_84%_60%)] border border-[hsl(160_84%_39%)/30] rounded-lg text-sm">
                            <CheckCircle className="h-4 w-4" />
                            Email Verified
                          </div>
                        ) : userDetails.user.emailVerifiedOverride ? (
                          <div className="flex items-center gap-2 px-4 py-2 bg-[hsl(14_100%_60%)/10] text-[hsl(14_100%_70%)] border border-[hsl(14_100%_60%)/30] rounded-lg text-sm">
                            <CheckCircle className="h-4 w-4" />
                            Manually Verified
                          </div>
                        ) : (
                          <button
                            onClick={() => usersApi.resendVerification(userDetails.user.auth0UserId).then(() => {
                              toast.success("Verification email sent");
                            }).catch((err: any) => {
                              toast.error(err.message || "Failed to send verification email");
                            })}
                            className="flex items-center gap-2 px-4 py-2 bg-[hsl(270_70%_60%)/10] text-[hsl(270_70%_70%)] border border-[hsl(270_70%_60%)/30] rounded-lg hover:bg-[hsl(270_70%_60%)/20] transition-colors text-sm"
                          >
                            <Send className="h-4 w-4" />
                            Resend Verification Email
                          </button>
                        )}

                        <button
                          onClick={() => setShowRevokeDialog(true)}
                          className="flex items-center gap-2 px-4 py-2 bg-[hsl(14_100%_60%)/10] text-[hsl(14_100%_70%)] border border-[hsl(14_100%_60%)/30] rounded-lg hover:bg-[hsl(14_100%_60%)/20] transition-colors text-sm"
                        >
                          <LogOut className="h-4 w-4" />
                          Revoke Sessions
                        </button>

                        <button
                          onClick={() => setShowPurgeConfirm(true)}
                          className="flex items-center gap-2 px-4 py-2 bg-[hsl(0_84%_60%)/10] text-[hsl(0_84%_70%)] border border-[hsl(0_84%_60%)/30] rounded-lg hover:bg-[hsl(0_84%_60%)/20] transition-colors text-sm"
                        >
                          <Trash2 className="h-4 w-4" />
                          Purge User
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Wallet */}
              <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-6">
                <h2 className="text-base font-semibold text-white mb-4">Wallet</h2>
                {userDetails?.user?.wallet && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-[hsl(160_84%_39%)/15] rounded-lg">
                          <Wallet className="h-6 w-6 text-[hsl(160_84%_60%)]" />
                        </div>
                        <div>
                          <p className="text-sm text-white/50">Balance</p>
                          <p className="text-2xl font-bold text-white">
                            {formatCurrency(userDetails.user.wallet.balanceCents)}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowAdjustWalletDialog(true)}
                        className="px-4 py-2 bg-[hsl(210_100%_50%)] text-white rounded-lg font-medium hover:bg-[hsl(210_100%_45%)] transition-colors text-sm"
                      >
                        Adjust Balance
                      </button>
                    </div>
                  </div>
                )}
                {!userDetails?.user?.wallet && (
                  <p className="text-white/40 text-center py-4">No wallet</p>
                )}
              </div>

              {/* Transactions */}
              <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-6">
                <h2 className="text-base font-semibold text-white mb-4">Recent Transactions</h2>
                {transactions?.transactions && transactions.transactions.length > 0 ? (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {transactions.transactions.slice(0, 30).map((tx: any) => (
                      <div key={tx.id} className="p-3 bg-white/5 rounded-lg text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-white capitalize">
                            {tx.type?.replace(/_/g, " ")}
                          </span>
                          <span className={`font-semibold ${tx.amountCents >= 0 ? "text-[hsl(160_84%_60%)]" : "text-[hsl(0_84%_70%)]"}`}>
                            {tx.amountCents >= 0 ? "+" : ""}{formatCurrency(tx.amountCents)}
                          </span>
                        </div>
                        {tx.metadata?.description && (
                          <p className="text-white/60 text-xs mb-1">
                            {tx.metadata.description}
                          </p>
                        )}
                        {tx.metadata?.serverId && (
                          <p className="text-white/40 text-xs">
                            Server ID: {tx.metadata.serverId}
                          </p>
                        )}
                        {tx.metadata?.stripePaymentIntentId && (
                          <p className="text-white/40 text-xs font-mono">
                            Stripe: {tx.metadata.stripePaymentIntentId.slice(0, 20)}...
                          </p>
                        )}
                        <p className="text-white/30 text-xs mt-1">
                          {new Date(tx.createdAt).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-white/40 text-center py-4">No transactions</p>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-12 text-center">
              <div className="inline-flex p-4 bg-white/5 rounded-full mb-4">
                <User className="h-8 w-8 text-white/30" />
              </div>
              <p className="text-white/40">Select a user to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Suspend Dialog */}
      <PromptDialog
        open={showSuspendDialog}
        onOpenChange={setShowSuspendDialog}
        title="Suspend Account"
        description="Enter a reason for suspending this account. The user can still log in but will be restricted."
        placeholder="e.g., Terms of Service violation"
        label="Suspension Reason"
        confirmText="Suspend"
        onConfirm={(reason) => {
          if (userDetails?.user) {
            suspendMutation.mutate({
              auth0UserId: userDetails.user.auth0UserId,
              suspended: true,
              reason,
            });
          }
        }}
        isPending={suspendMutation.isPending}
      />

      {/* Block Dialog */}
      <PromptDialog
        open={showBlockDialog}
        onOpenChange={setShowBlockDialog}
        title="Block Account"
        description="Enter a reason for blocking this account. The user will not be able to log in."
        placeholder="e.g., Fraudulent activity"
        label="Block Reason"
        confirmText="Block"
        onConfirm={(reason) => {
          if (userDetails?.user) {
            blockMutation.mutate({
              auth0UserId: userDetails.user.auth0UserId,
              blocked: true,
              reason,
            });
          }
        }}
        isPending={blockMutation.isPending}
      />

      {/* Revoke Sessions Dialog */}
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

      {/* Adjust Wallet Dialog */}
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
                placeholder="e.g., Manual credit adjustment"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setShowAdjustWalletDialog(false);
                setWalletAmount("");
                setWalletDescription("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAdjustWallet}
              disabled={!walletAmount || !walletDescription || adjustWalletMutation.isPending}
            >
              {adjustWalletMutation.isPending ? "Adjusting..." : "Adjust Balance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purge Confirmation Modal */}
      {showPurgeConfirm && userDetails?.user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[hsl(215_21%_11%)] border border-white/10 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-[hsl(0_84%_60%)/10] rounded-lg">
                <AlertTriangle className="h-6 w-6 text-[hsl(0_84%_70%)]" />
              </div>
              <h3 className="text-lg font-bold text-white">Purge User</h3>
            </div>

            <div className="mb-4 p-3 bg-[hsl(0_84%_60%)/10] border border-[hsl(0_84%_60%)/30] rounded-lg">
              <p className="text-[hsl(0_84%_70%)] text-sm font-medium">
                This action is IRREVERSIBLE and will permanently delete:
              </p>
              <ul className="mt-2 text-sm text-[hsl(0_84%_70%)] list-disc list-inside space-y-1">
                <li>All servers in VirtFusion</li>
                <li>VirtFusion user account</li>
                <li>Stripe customer & payment methods</li>
                <li>Auth0 account</li>
                <li>All local database records (wallet, billing, tickets, etc.)</li>
              </ul>
            </div>

            <div className="mb-4">
              <p className="text-sm text-white/70 mb-2">
                User: <span className="font-semibold text-white">{userDetails.user.email}</span>
              </p>
              <p className="text-sm text-white/50 mb-3">
                Type <span className="font-mono font-bold text-[hsl(0_84%_70%)]">PURGE</span> to confirm:
              </p>
              <input
                type="text"
                value={purgeConfirmText}
                onChange={(e) => setPurgeConfirmText(e.target.value)}
                placeholder="Type PURGE to confirm"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:ring-2 focus:ring-[hsl(0_84%_60%)/50] outline-none font-mono"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowPurgeConfirm(false);
                  setPurgeConfirmText("");
                }}
                className="px-4 py-2 text-white/60 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => purgeMutation.mutate(userDetails.user.auth0UserId)}
                disabled={purgeConfirmText !== "PURGE" || purgeMutation.isPending}
                className="px-4 py-2 bg-[hsl(0_84%_60%)] text-white rounded-lg font-medium hover:bg-[hsl(0_84%_55%)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {purgeMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Purging...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Purge User Forever
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Purge Results Modal */}
      {showPurgeResults && purgeResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[hsl(215_21%_11%)] border border-white/10 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-lg ${purgeResults.success ? 'bg-[hsl(160_84%_39%)/10]' : 'bg-[hsl(0_84%_60%)/10]'}`}>
                {purgeResults.success ? (
                  <CheckCircle className="h-6 w-6 text-[hsl(160_84%_60%)]" />
                ) : (
                  <XCircle className="h-6 w-6 text-[hsl(0_84%_70%)]" />
                )}
              </div>
              <h3 className="text-lg font-bold text-white">
                {purgeResults.success ? 'Purge Successful' : 'Purge Completed with Errors'}
              </h3>
            </div>

            {purgeResults.error ? (
              <div className="mb-4 p-3 bg-[hsl(0_84%_60%)/10] border border-[hsl(0_84%_60%)/30] rounded-lg">
                <p className="text-[hsl(0_84%_70%)] text-sm">{purgeResults.error}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    {purgeResults.results?.auth0Deleted ? (
                      <CheckCircle className="h-4 w-4 text-[hsl(160_84%_60%)]" />
                    ) : (
                      <XCircle className="h-4 w-4 text-[hsl(0_84%_70%)]" />
                    )}
                    <span className="text-white/70">Auth0 Account</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {purgeResults.results?.virtfusionUserDeleted ? (
                      <CheckCircle className="h-4 w-4 text-[hsl(160_84%_60%)]" />
                    ) : (
                      <XCircle className="h-4 w-4 text-[hsl(0_84%_70%)]" />
                    )}
                    <span className="text-white/70">VirtFusion User</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {purgeResults.results?.stripeCustomerDeleted ? (
                      <CheckCircle className="h-4 w-4 text-[hsl(160_84%_60%)]" />
                    ) : (
                      <XCircle className="h-4 w-4 text-[hsl(0_84%_70%)]" />
                    )}
                    <span className="text-white/70">Stripe Customer</span>
                  </div>
                </div>

                {purgeResults.results?.localRecordsDeleted && (
                  <div className="mt-3 p-3 bg-white/5 rounded-lg">
                    <p className="text-xs font-medium text-white/40 mb-2">Local Records Deleted:</p>
                    <div className="grid grid-cols-2 gap-1 text-xs text-white/60">
                      {Object.entries(purgeResults.results.localRecordsDeleted).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span>{key}:</span>
                          <span className="font-mono">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {purgeResults.results?.errors?.length > 0 && (
                  <div className="mt-3 p-3 bg-[hsl(0_84%_60%)/10] border border-[hsl(0_84%_60%)/30] rounded-lg">
                    <p className="text-xs font-medium text-[hsl(0_84%_70%)] mb-2">Errors:</p>
                    <ul className="text-xs text-[hsl(0_84%_70%)] list-disc list-inside space-y-1">
                      {purgeResults.results.errors.map((err: string, i: number) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end mt-4">
              <button
                onClick={() => {
                  setShowPurgeResults(false);
                  setPurgeResults(null);
                }}
                className="px-4 py-2 bg-white/8 text-white/70 rounded-lg hover:bg-white/12 hover:text-white transition-colors"
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
