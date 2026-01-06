import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/sidebar";
import { ShieldCheck, Search, Plus, Minus, AlertTriangle, Loader2, DollarSign, History, User } from "lucide-react";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface UserMeResponse {
  user: {
    id: number | string;
    email: string;
    name?: string;
    isAdmin?: boolean;
  };
}

interface AdminUser {
  auth0UserId: string;
  email: string;
  name?: string;
  emailVerified?: boolean;
  virtFusionUserId?: number;
  wallet?: {
    balanceCents: number;
    stripeCustomerId?: string;
  };
}

interface Transaction {
  id: number;
  type: string;
  amountCents: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [searchEmail, setSearchEmail] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [adjustType, setAdjustType] = useState<"add" | "remove">("add");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [transactionsDialogOpen, setTransactionsDialogOpen] = useState(false);

  const { data: userData, isLoading } = useQuery<UserMeResponse>({
    queryKey: ['auth', 'me'],
    queryFn: () => api.getCurrentUser(),
    staleTime: 1000 * 60 * 5,
  });

  const isAdmin = userData?.user?.isAdmin ?? false;

  const searchMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await fetch(`/api/admin/users/search?email=${encodeURIComponent(email)}`);
      if (!response.ok) throw new Error('Search failed');
      return response.json();
    },
    onSuccess: (data) => {
      if (data.users?.length > 0) {
        setSelectedUser(data.users[0]);
      } else {
        setSelectedUser(null);
      }
    },
  });

  const adjustMutation = useMutation({
    mutationFn: async (data: { auth0UserId: string; amountCents: number; reason: string }) => {
      const response = await fetch('/api/admin/wallet/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Adjustment failed');
      }
      return response.json();
    },
    onSuccess: () => {
      setAdjustDialogOpen(false);
      setAdjustAmount("");
      setAdjustReason("");
      if (searchEmail) {
        searchMutation.mutate(searchEmail);
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'wallets'] });
    },
  });

  const { data: transactionsData, isLoading: transactionsLoading } = useQuery({
    queryKey: ['admin', 'transactions', selectedUser?.auth0UserId],
    queryFn: async () => {
      if (!selectedUser?.auth0UserId) return { transactions: [] };
      const response = await fetch(`/api/admin/users/${encodeURIComponent(selectedUser.auth0UserId)}/transactions`);
      if (!response.ok) throw new Error('Failed to fetch transactions');
      return response.json();
    },
    enabled: !!selectedUser?.auth0UserId && transactionsDialogOpen,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchEmail.length >= 3) {
      searchMutation.mutate(searchEmail);
    }
  };

  const handleOpenAdjust = (type: "add" | "remove") => {
    setAdjustType(type);
    setAdjustDialogOpen(true);
  };

  const handleAdjustSubmit = () => {
    if (!selectedUser || !adjustAmount || !adjustReason) return;
    const amountDollars = parseFloat(adjustAmount);
    if (isNaN(amountDollars) || amountDollars <= 0) return;
    const amountCents = Math.round(amountDollars * 100) * (adjustType === "remove" ? -1 : 1);
    adjustMutation.mutate({
      auth0UserId: selectedUser.auth0UserId,
      amountCents,
      reason: adjustReason,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-dark">
        <Sidebar />
        <main className="lg:pl-64 pt-16 lg:pt-0 min-h-screen">
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="animate-pulse">
              <div className="h-8 bg-white/5 rounded w-48 mb-4" />
              <div className="h-4 bg-white/5 rounded w-96 mb-8" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!isAdmin) {
    return <Redirect to="/dashboard" />;
  }

  return (
    <div className="min-h-screen bg-gradient-dark">
      <Sidebar />
      <main className="lg:pl-64 pt-16 lg:pt-0 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <ShieldCheck className="h-8 w-8 text-amber-400" />
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-white">
                Admin Panel
              </h1>
            </div>
            <p className="text-muted-foreground">
              Manage users, wallets, and system settings.
            </p>
          </div>

          <div className="glass-panel rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Search className="h-5 w-5 text-amber-400" />
              User Lookup
            </h2>
            <form onSubmit={handleSearch} className="flex gap-3">
              <Input
                data-testid="input-admin-search"
                type="email"
                placeholder="Enter user email address..."
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                className="flex-1"
              />
              <Button
                data-testid="button-admin-search"
                type="submit"
                disabled={searchEmail.length < 3 || searchMutation.isPending}
                className="bg-amber-500 hover:bg-amber-600 text-black"
              >
                {searchMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Search"
                )}
              </Button>
            </form>
          </div>

          {selectedUser && (
            <div className="glass-panel rounded-xl p-6 mb-6 border border-amber-500/20">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <User className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white" data-testid="text-user-email">
                      {selectedUser.email}
                    </h3>
                    {selectedUser.name && (
                      <p className="text-sm text-muted-foreground">{selectedUser.name}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-white" data-testid="text-user-balance">
                    ${((selectedUser.wallet?.balanceCents || 0) / 100).toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">Wallet Balance</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Auth0 ID</p>
                  <p className="font-mono text-xs text-white/80 truncate">{selectedUser.auth0UserId}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">VirtFusion ID</p>
                  <p className="font-mono text-white/80">
                    {selectedUser.virtFusionUserId || "Not linked"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Email Verified</p>
                  <p className="text-white/80">{selectedUser.emailVerified ? "Yes" : "No"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Stripe Customer</p>
                  <p className="font-mono text-xs text-white/80 truncate">
                    {selectedUser.wallet?.stripeCustomerId || "None"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  data-testid="button-add-credits"
                  onClick={() => handleOpenAdjust("add")}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Credits
                </Button>
                <Button
                  data-testid="button-remove-credits"
                  onClick={() => handleOpenAdjust("remove")}
                  variant="destructive"
                >
                  <Minus className="h-4 w-4 mr-2" />
                  Remove Credits
                </Button>
                <Button
                  data-testid="button-view-transactions"
                  onClick={() => setTransactionsDialogOpen(true)}
                  variant="outline"
                >
                  <History className="h-4 w-4 mr-2" />
                  View Transactions
                </Button>
              </div>
            </div>
          )}

          {searchMutation.isSuccess && !selectedUser && (
            <div className="glass-panel rounded-xl p-6 border border-yellow-500/20 bg-yellow-500/5">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-400" />
                <p className="text-yellow-400">No user found with that email address.</p>
              </div>
            </div>
          )}
        </div>
      </main>

      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent className="bg-[#1a1a2e] border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <DollarSign className="h-5 w-5 text-amber-400" />
              {adjustType === "add" ? "Add Credits" : "Remove Credits"}
            </DialogTitle>
            <DialogDescription>
              {adjustType === "add"
                ? "Add credits to the user's wallet."
                : "Remove credits from the user's wallet."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>User</Label>
              <p className="text-sm text-white">{selectedUser?.email}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (AUD)</Label>
              <Input
                data-testid="input-adjust-amount"
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea
                data-testid="input-adjust-reason"
                id="reason"
                placeholder="Enter reason for adjustment..."
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              data-testid="button-confirm-adjust"
              onClick={handleAdjustSubmit}
              disabled={!adjustAmount || !adjustReason || adjustMutation.isPending}
              className={adjustType === "add" ? "bg-green-600 hover:bg-green-700" : ""}
              variant={adjustType === "remove" ? "destructive" : "default"}
            >
              {adjustMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {adjustType === "add" ? "Add Credits" : "Remove Credits"}
            </Button>
          </DialogFooter>
          {adjustMutation.isError && (
            <p className="text-red-400 text-sm mt-2">
              {(adjustMutation.error as Error).message}
            </p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={transactionsDialogOpen} onOpenChange={setTransactionsDialogOpen}>
        <DialogContent className="bg-[#1a1a2e] border-white/10 max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <History className="h-5 w-5 text-amber-400" />
              Transaction History
            </DialogTitle>
            <DialogDescription>
              {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {transactionsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
              </div>
            ) : (transactionsData?.transactions || []).length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No transactions found</p>
            ) : (
              <div className="space-y-2">
                {(transactionsData?.transactions || []).map((tx: Transaction) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5"
                  >
                    <div>
                      <p className="text-sm font-medium text-white capitalize">
                        {tx.type.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleString()}
                      </p>
                      {tx.metadata && (tx.metadata as any).reason && (
                        <p className="text-xs text-amber-400/70 mt-1">
                          Reason: {(tx.metadata as any).reason}
                        </p>
                      )}
                    </div>
                    <p className={`font-mono font-semibold ${tx.amountCents >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {tx.amountCents >= 0 ? '+' : ''}${(tx.amountCents / 100).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
