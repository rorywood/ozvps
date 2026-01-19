import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "../lib/api";
import { toast } from "sonner";
import { Search, User, Wallet, Ban, Shield, RefreshCw } from "lucide-react";

export default function Users() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const queryClient = useQueryClient();

  const { data: searchResults, isLoading: searching } = useQuery({
    queryKey: ["users-search", searchQuery],
    queryFn: () => usersApi.search(searchQuery),
    enabled: searchQuery.length >= 2,
  });

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
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Users</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Search Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by email or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>

            {searching && (
              <div className="flex justify-center py-4">
                <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            )}

            {searchResults?.users && (
              <div className="space-y-2">
                {searchResults.users.map((user: any) => (
                  <button
                    key={user.auth0UserId}
                    onClick={() => setSelectedUser(user)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedUser?.auth0UserId === user.auth0UserId
                        ? "bg-blue-50 border border-blue-200"
                        : "bg-gray-50 hover:bg-gray-100"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <User className="h-8 w-8 text-gray-400" />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{user.name || "No name"}</p>
                        <p className="text-sm text-gray-500 truncate">{user.email}</p>
                      </div>
                    </div>
                    {user.blocked && (
                      <span className="mt-2 inline-block px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
                        Blocked
                      </span>
                    )}
                  </button>
                ))}
                {searchResults.users.length === 0 && (
                  <p className="text-center text-gray-500 py-4">No users found</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* User Details */}
        <div className="lg:col-span-2">
          {selectedUser ? (
            <div className="space-y-6">
              {/* User Info */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">User Details</h2>
                {loadingUser ? (
                  <div className="animate-pulse space-y-3">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  </div>
                ) : userDetails?.user && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Name</p>
                        <p className="font-medium">{userDetails.user.name || "Not set"}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Email</p>
                        <p className="font-medium">{userDetails.user.email}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">VirtFusion ID</p>
                        <p className="font-medium">{userDetails.user.virtFusionUserId}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">2FA Status</p>
                        <p className="font-medium">
                          {userDetails.user.twoFactorEnabled ? (
                            <span className="text-green-600">Enabled</span>
                          ) : (
                            <span className="text-gray-400">Disabled</span>
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Active Sessions</p>
                        <p className="font-medium">{userDetails.user.activeSessions}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Blocked</p>
                        <p className="font-medium">
                          {userDetails.user.blocked ? (
                            <span className="text-red-600">Yes - {userDetails.user.blockedReason}</span>
                          ) : (
                            <span className="text-green-600">No</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-4 border-t">
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
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
                          userDetails.user.blocked
                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                            : "bg-red-100 text-red-700 hover:bg-red-200"
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
                        className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg font-medium hover:bg-blue-200"
                      >
                        <Shield className="h-4 w-4" />
                        Verify Email
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Wallet */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Wallet</h2>
                {userDetails?.user?.wallet && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Wallet className="h-8 w-8 text-green-600" />
                        <div>
                          <p className="text-sm text-gray-500">Balance</p>
                          <p className="text-2xl font-bold text-gray-900">
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
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
                      >
                        Adjust Balance
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Transactions */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Transactions</h2>
                {transactions?.transactions && transactions.transactions.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {transactions.transactions.slice(0, 20).map((tx: any) => (
                      <div key={tx.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                        <div>
                          <p className="font-medium text-gray-900">{tx.type}</p>
                          <p className="text-gray-500 text-xs">
                            {new Date(tx.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <span className={tx.amountCents >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                          {tx.amountCents >= 0 ? "+" : ""}{formatCurrency(tx.amountCents)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">No transactions</p>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center">
              <User className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Search for a user to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
