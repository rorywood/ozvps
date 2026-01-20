import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "../lib/api";
import { toast } from "sonner";
import { Search, User, Wallet, Ban, Shield, RefreshCw, Mail, Key, LogOut } from "lucide-react";

export default function Users() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const queryClient = useQueryClient();

  // List all users from Auth0
  const { data: allUsers, isLoading: loadingUsers, error: usersError, refetch: refetchUsers, isFetching } = useQuery({
    queryKey: ["users-list"],
    queryFn: () => usersApi.list(1, 100),
    retry: 1,
  });

  // Search only when query is entered
  const { data: searchResults, isLoading: searching } = useQuery({
    queryKey: ["users-search", searchQuery],
    queryFn: () => usersApi.search(searchQuery),
    enabled: searchQuery.length >= 2,
  });

  // Use search results if searching, otherwise show all users
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
    onSuccess: () => {
      toast.success("User updated");
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

  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Users</h1>
        <button
          onClick={() => refetchUsers()}
          disabled={isFetching}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User List Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-4">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by email or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-500/40 outline-none text-gray-900 dark:text-white placeholder-gray-500"
              />
            </div>

            {usersError && (
              <div className="p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                Error loading users: {(usersError as any)?.message || "Unknown error"}
              </div>
            )}

            {isLoadingList ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {displayUsers?.map((user: any) => (
                  <button
                    key={user.auth0UserId}
                    onClick={() => setSelectedUser(user)}
                    className={`w-full text-left p-3 rounded-lg transition-all ${
                      selectedUser?.auth0UserId === user.auth0UserId
                        ? "bg-blue-500/10 border border-blue-500/30 dark:bg-blue-500/20"
                        : "bg-gray-50 dark:bg-gray-800/30 hover:bg-gray-100 dark:hover:bg-gray-800/50 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gray-200 dark:bg-gray-700 rounded-full">
                        <User className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                          {user.name || "No name"}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                      </div>
                      {user.blocked && (
                        <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded-full border border-red-500/30">
                          Blocked
                        </span>
                      )}
                    </div>
                  </button>
                ))}
                {(!displayUsers || displayUsers.length === 0) && (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                    {searchQuery.length >= 2 ? "No users found" : "No users yet"}
                  </p>
                )}
              </div>
            )}

            {allUsers?.pagination && !searchQuery && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 text-center">
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
              <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-500/10 rounded-xl">
                      <User className="h-6 w-6 text-blue-500" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {selectedUser.name || "No name"}
                      </h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{selectedUser.email}</p>
                    </div>
                  </div>
                  {selectedUser.blocked && (
                    <span className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm font-medium border border-red-500/30">
                      Blocked
                    </span>
                  )}
                </div>

                {loadingUser ? (
                  <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                  </div>
                ) : userDetails?.user && (
                  <div className="space-y-6">
                    {/* Info Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <Mail className="h-4 w-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Account</span>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-gray-400">Email</span>
                            <span className="font-medium text-gray-900 dark:text-white truncate ml-2">{userDetails.user.email}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-gray-400">VirtFusion ID</span>
                            <span className="font-mono text-gray-900 dark:text-white">{userDetails.user.virtFusionUserId || "Not linked"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <Key className="h-4 w-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Security</span>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-gray-400">2FA Status</span>
                            <span className={`font-medium ${userDetails.user.twoFactorEnabled ? "text-green-500" : "text-gray-400"}`}>
                              {userDetails.user.twoFactorEnabled ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-gray-400">Active Sessions</span>
                            <span className="font-medium text-gray-900 dark:text-white">{userDetails.user.activeSessions}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Actions</h3>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            const reason = userDetails.user.blocked
                              ? undefined
                              : prompt("Enter block reason:");
                            if (!userDetails.user.blocked && !reason) return;
                            blockMutation.mutate({
                              auth0UserId: userDetails.user.auth0UserId,
                              blocked: !userDetails.user.blocked,
                              reason,
                            });
                          }}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                            userDetails.user.blocked
                              ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30 hover:bg-green-500/20"
                              : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/20"
                          }`}
                        >
                          <Ban className="h-4 w-4" />
                          {userDetails.user.blocked ? "Unblock" : "Block"}
                        </button>
                        <button
                          onClick={() => usersApi.verifyEmail(userDetails.user.auth0UserId).then(() => {
                            toast.success("Email verified");
                            queryClient.invalidateQueries({ queryKey: ["user", selectedUser?.auth0UserId] });
                          })}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/20 transition-colors"
                        >
                          <Shield className="h-4 w-4" />
                          Verify Email
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("Revoke all sessions for this user?")) {
                              fetch(`/api/users/${encodeURIComponent(userDetails.user.auth0UserId)}/revoke-sessions`, {
                                method: "POST",
                                credentials: "include",
                              }).then(() => {
                                toast.success("Sessions revoked");
                                queryClient.invalidateQueries({ queryKey: ["user", selectedUser?.auth0UserId] });
                              });
                            }
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30 rounded-lg hover:bg-orange-500/20 transition-colors"
                        >
                          <LogOut className="h-4 w-4" />
                          Revoke Sessions
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Wallet */}
              <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Wallet</h2>
                {userDetails?.user?.wallet && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-500/10 rounded-lg">
                          <Wallet className="h-6 w-6 text-green-500" />
                        </div>
                        <div>
                          <p className="text-sm text-gray-500 dark:text-gray-400">Balance</p>
                          <p className="text-2xl font-bold text-gray-900 dark:text-white">
                            {formatCurrency(userDetails.user.wallet.balanceCents)}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const amount = prompt("Enter amount in dollars (negative to debit):");
                          if (!amount) return;
                          const cents = Math.round(parseFloat(amount) * 100);
                          if (isNaN(cents)) return toast.error("Invalid amount");
                          const description = prompt("Enter description:");
                          if (!description) return;
                          adjustWalletMutation.mutate({
                            auth0UserId: userDetails.user.auth0UserId,
                            amountCents: cents,
                            description,
                          });
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                      >
                        Adjust Balance
                      </button>
                    </div>
                  </div>
                )}
                {!userDetails?.user?.wallet && (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-4">No wallet</p>
                )}
              </div>

              {/* Transactions */}
              <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recent Transactions</h2>
                {transactions?.transactions && transactions.transactions.length > 0 ? (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {transactions.transactions.slice(0, 30).map((tx: any) => (
                      <div key={tx.id} className="p-3 bg-gray-50 dark:bg-gray-800/30 rounded-lg text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-gray-900 dark:text-white capitalize">
                            {tx.type?.replace(/_/g, " ")}
                          </span>
                          <span className={`font-semibold ${tx.amountCents >= 0 ? "text-green-500" : "text-red-500"}`}>
                            {tx.amountCents >= 0 ? "+" : ""}{formatCurrency(tx.amountCents)}
                          </span>
                        </div>
                        {tx.metadata?.description && (
                          <p className="text-gray-600 dark:text-gray-300 text-xs mb-1">
                            {tx.metadata.description}
                          </p>
                        )}
                        {tx.metadata?.serverId && (
                          <p className="text-gray-500 dark:text-gray-400 text-xs">
                            Server ID: {tx.metadata.serverId}
                          </p>
                        )}
                        {tx.metadata?.stripePaymentIntentId && (
                          <p className="text-gray-500 dark:text-gray-400 text-xs font-mono">
                            Stripe: {tx.metadata.stripePaymentIntentId.slice(0, 20)}...
                          </p>
                        )}
                        <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
                          {new Date(tx.createdAt).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-4">No transactions</p>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-12 text-center">
              <div className="inline-flex p-4 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
                <User className="h-8 w-8 text-gray-400" />
              </div>
              <p className="text-gray-500 dark:text-gray-400">Select a user to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
