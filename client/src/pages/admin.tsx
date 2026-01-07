import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/sidebar";
import { ShieldCheck, Search, Plus, Minus, AlertTriangle, Loader2, DollarSign, History, User, Link, Shield, Eye, EyeOff, Save, ChevronRight, Wallet } from "lucide-react";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

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
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [oldExtRelationId, setOldExtRelationId] = useState("");
  const [recaptchaSiteKey, setRecaptchaSiteKey] = useState("");
  const [recaptchaSecretKey, setRecaptchaSecretKey] = useState("");
  const [recaptchaEnabled, setRecaptchaEnabled] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);

  const { data: userData, isLoading } = useQuery<UserMeResponse>({
    queryKey: ['auth', 'me'],
    queryFn: () => api.getCurrentUser(),
    staleTime: 1000 * 60 * 5,
  });

  const isAdmin = userData?.user?.isAdmin ?? false;

  const { data: recaptchaData, isLoading: recaptchaLoading } = useQuery({
    queryKey: ['admin', 'recaptcha'],
    queryFn: async () => {
      const response = await fetch('/api/admin/security/recaptcha');
      if (!response.ok) throw new Error('Failed to fetch reCAPTCHA settings');
      return response.json();
    },
    enabled: isAdmin,
  });

  useEffect(() => {
    if (recaptchaData) {
      setRecaptchaSiteKey(recaptchaData.siteKey || '');
      setRecaptchaEnabled(recaptchaData.enabled || false);
    }
  }, [recaptchaData]);

  const recaptchaMutation = useMutation({
    mutationFn: async (data: { siteKey: string; secretKey: string; enabled: boolean }) => {
      const response = await fetch('/api/admin/security/recaptcha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save reCAPTCHA settings');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('reCAPTCHA settings saved');
      queryClient.invalidateQueries({ queryKey: ['admin', 'recaptcha'] });
      setRecaptchaSecretKey('');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleSaveRecaptcha = () => {
    recaptchaMutation.mutate({
      siteKey: recaptchaSiteKey,
      secretKey: recaptchaSecretKey,
      enabled: recaptchaEnabled,
    });
  };

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

  const linkMutation = useMutation({
    mutationFn: async (data: { auth0UserId: string; oldExtRelationId: string }) => {
      const response = await fetch('/api/admin/link-virtfusion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Link failed');
      }
      return response.json();
    },
    onSuccess: (data) => {
      setLinkDialogOpen(false);
      setOldExtRelationId("");
      toast.success(data.message || 'VirtFusion account linked successfully');
      if (searchEmail) {
        searchMutation.mutate(searchEmail);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
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

  const handleLinkSubmit = () => {
    if (!selectedUser || !oldExtRelationId.trim()) return;
    linkMutation.mutate({
      auth0UserId: selectedUser.auth0UserId,
      oldExtRelationId: oldExtRelationId.trim(),
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
        <div className="p-4 sm:p-6 lg:p-8 max-w-4xl space-y-8">
          {/* Header */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-display font-bold text-white">
                  Admin Panel
                </h1>
                <p className="text-muted-foreground text-sm">
                  Manage users, wallets, and system settings
                </p>
              </div>
            </div>
          </div>

          {/* User Lookup */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Search className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-white">User Lookup</h2>
                <p className="text-sm text-muted-foreground">Find users by email</p>
              </div>
            </div>
            
            <form onSubmit={handleSearch} className="flex gap-3">
              <Input
                data-testid="input-admin-search"
                type="email"
                placeholder="Enter user email address..."
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                className="flex-1 bg-black/20 border-white/10"
              />
              <Button
                data-testid="button-admin-search"
                type="submit"
                disabled={searchEmail.length < 3 || searchMutation.isPending}
              >
                {searchMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Search"
                )}
              </Button>
            </form>
          </div>

          {/* Selected User Card */}
          {selectedUser && (
            <div className="rounded-xl bg-white/[0.02] ring-1 ring-amber-500/20 overflow-hidden">
              <div className="p-5 border-b border-white/5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                      <User className="h-6 w-6 text-amber-400" />
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
                  <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-green-500/10">
                    <Wallet className="h-4 w-4 text-green-500" />
                    <span className="text-lg font-bold text-green-400" data-testid="text-user-balance">
                      ${((selectedUser.wallet?.balanceCents || 0) / 100).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Auth0 ID</p>
                  <p className="font-mono text-xs text-white/80 truncate">{selectedUser.auth0UserId}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">VirtFusion ID</p>
                  <p className="font-mono text-white/80">
                    {selectedUser.virtFusionUserId || <span className="text-yellow-500">Not linked</span>}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Email Verified</p>
                  <p className="text-white/80">{selectedUser.emailVerified ? "Yes" : "No"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Stripe Customer</p>
                  <p className="font-mono text-xs text-white/80 truncate">
                    {selectedUser.wallet?.stripeCustomerId || "None"}
                  </p>
                </div>
              </div>

              <div className="p-5 border-t border-white/5 flex flex-wrap gap-2">
                <Button
                  data-testid="button-add-credits"
                  onClick={() => handleOpenAdjust("add")}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Credits
                </Button>
                <Button
                  data-testid="button-remove-credits"
                  onClick={() => handleOpenAdjust("remove")}
                  variant="destructive"
                  size="sm"
                >
                  <Minus className="h-4 w-4 mr-1" />
                  Remove Credits
                </Button>
                <Button
                  data-testid="button-view-transactions"
                  onClick={() => setTransactionsDialogOpen(true)}
                  variant="outline"
                  size="sm"
                  className="border-white/10"
                >
                  <History className="h-4 w-4 mr-1" />
                  Transactions
                </Button>
                {!selectedUser.virtFusionUserId && (
                  <Button
                    data-testid="button-link-virtfusion"
                    onClick={() => setLinkDialogOpen(true)}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Link className="h-4 w-4 mr-1" />
                    Link VirtFusion
                  </Button>
                )}
              </div>
            </div>
          )}

          {searchMutation.isSuccess && !selectedUser && (
            <div className="rounded-xl bg-yellow-500/5 ring-1 ring-yellow-500/20 p-5 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0" />
              <p className="text-yellow-400">No user found with that email address.</p>
            </div>
          )}

          {/* Security Settings */}
          <div className="pt-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <h2 className="font-semibold text-white">Security Settings</h2>
                <p className="text-sm text-muted-foreground">Configure login protection</p>
              </div>
            </div>

            {/* reCAPTCHA Settings */}
            <div className="rounded-xl bg-white/[0.02] ring-1 ring-white/5 p-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="font-medium text-white">reCAPTCHA Protection</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Protect login forms from bots with Google reCAPTCHA v2
                  </p>
                </div>
                <Switch
                  data-testid="switch-recaptcha-enabled"
                  checked={recaptchaEnabled}
                  onCheckedChange={setRecaptchaEnabled}
                  disabled={recaptchaLoading}
                />
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="recaptcha-site-key" className="text-sm">Site Key</Label>
                  <Input
                    data-testid="input-recaptcha-site-key"
                    id="recaptcha-site-key"
                    placeholder="6Lc..."
                    value={recaptchaSiteKey}
                    onChange={(e) => setRecaptchaSiteKey(e.target.value)}
                    className="font-mono text-sm bg-black/20 border-white/10"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="recaptcha-secret-key" className="text-sm">Secret Key</Label>
                  <div className="relative">
                    <Input
                      data-testid="input-recaptcha-secret-key"
                      id="recaptcha-secret-key"
                      type={showSecretKey ? "text" : "password"}
                      placeholder={recaptchaData?.hasSecretKey ? "••••••••••••••••" : "Enter secret key"}
                      value={recaptchaSecretKey}
                      onChange={(e) => setRecaptchaSecretKey(e.target.value)}
                      className="font-mono text-sm pr-10 bg-black/20 border-white/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecretKey(!showSecretKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors"
                    >
                      {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {recaptchaData?.hasSecretKey && !recaptchaSecretKey && (
                    <p className="text-xs text-muted-foreground">
                      Secret key is already configured. Enter a new key only if you want to change it.
                    </p>
                  )}
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    data-testid="button-save-recaptcha"
                    onClick={handleSaveRecaptcha}
                    disabled={recaptchaMutation.isPending || (recaptchaEnabled && !recaptchaSiteKey)}
                    className="gap-2"
                  >
                    {recaptchaMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save Settings
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Adjust Dialog */}
      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent className="bg-zinc-900 border-white/10">
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
                className="bg-black/20 border-white/10"
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
                className="bg-black/20 border-white/10"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialogOpen(false)} className="border-white/10">
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

      {/* Transactions Dialog */}
      <Dialog open={transactionsDialogOpen} onOpenChange={setTransactionsDialogOpen}>
        <DialogContent className="bg-zinc-900 border-white/10 max-w-2xl max-h-[80vh] overflow-y-auto">
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
                    className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] ring-1 ring-white/5"
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

      {/* Link VirtFusion Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="bg-zinc-900 border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Link className="h-5 w-5 text-blue-400" />
              Link VirtFusion Account
            </DialogTitle>
            <DialogDescription>
              Link an existing VirtFusion user to this account by providing their current extRelationId 
              from the VirtFusion admin panel.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>User</Label>
              <p className="text-sm text-white">{selectedUser?.email}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="extRelationId">Current extRelationId</Label>
              <Input
                data-testid="input-ext-relation-id"
                id="extRelationId"
                type="text"
                placeholder="Enter VirtFusion extRelationId..."
                value={oldExtRelationId}
                onChange={(e) => setOldExtRelationId(e.target.value)}
                className="bg-black/20 border-white/10"
              />
              <p className="text-xs text-muted-foreground">
                Find this in VirtFusion admin → Users → click the user → look for "Ext Relation ID" field.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)} className="border-white/10">
              Cancel
            </Button>
            <Button
              data-testid="button-confirm-link"
              onClick={handleLinkSubmit}
              disabled={!oldExtRelationId.trim() || linkMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {linkMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Link Account
            </Button>
          </DialogFooter>
          {linkMutation.isError && (
            <p className="text-red-400 text-sm mt-2">
              {(linkMutation.error as Error).message}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
