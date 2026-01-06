import { AppShell } from "@/components/layout/app-shell";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { 
  User, 
  Shield, 
  Key, 
  Loader2,
  Save,
  Eye,
  EyeOff,
  Mail,
  Clock,
  CreditCard,
  Trash2,
  Wallet,
  History,
  Copy
} from "lucide-react";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Account() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showStripeId, setShowStripeId] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['userProfile'],
    queryFn: () => api.getUserProfile(),
  });

  useEffect(() => {
    if (profile) {
      setName(profile.name || "");
      setEmail(profile.email || "");
      setTimezone(profile.timezone || "");
    }
  }, [profile]);

  const updateProfileMutation = useMutation({
    mutationFn: (updates: { name?: string; email?: string; timezone?: string }) => 
      api.updateUserProfile(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      toast({
        title: "Profile Updated",
        description: "Your profile has been updated successfully.",
      });
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update profile.",
        variant: "destructive",
      });
    }
  });

  const changePasswordMutation = useMutation({
    mutationFn: (password: string) => api.changePassword(password),
    onSuccess: () => {
      toast({
        title: "Password Changed",
        description: "Your password has been updated successfully.",
      });
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error: any) => {
      toast({
        title: "Password Change Failed",
        description: error.message || "Failed to change password.",
        variant: "destructive",
      });
    }
  });

  const { data: stripeStatus } = useQuery({
    queryKey: ['stripe-status'],
    queryFn: () => api.getStripeStatus(),
    staleTime: 5 * 60 * 1000,
  });

  const stripeConfigured = stripeStatus?.configured ?? false;

  const { data: paymentMethodsData, isLoading: loadingPaymentMethods } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => api.getPaymentMethods(),
    enabled: stripeConfigured,
  });

  const { data: transactionsData, isLoading: loadingTransactions } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => api.getTransactions(),
    enabled: stripeConfigured,
  });

  const { data: walletData } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.getWallet(),
  });

  const deletePaymentMethodMutation = useMutation({
    mutationFn: (id: string) => api.deletePaymentMethod(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
      toast({
        title: "Payment Method Removed",
        description: "The payment method has been removed from your account.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove payment method.",
        variant: "destructive",
      });
    }
  });

  const formatCardBrand = (brand: string) => {
    const brands: Record<string, string> = {
      visa: 'Visa',
      mastercard: 'Mastercard',
      amex: 'American Express',
      discover: 'Discover',
      diners: 'Diners Club',
      jcb: 'JCB',
      unionpay: 'UnionPay',
    };
    return brands[brand.toLowerCase()] || brand;
  };

  const formatTransactionType = (type: string) => {
    const types: Record<string, string> = {
      credit: 'Top-up',
      debit: 'Payment',
      refund: 'Refund',
    };
    return types[type] || type;
  };

  const formatCurrency = (cents: number) => {
    const isNegative = cents < 0;
    return `${isNegative ? '-' : '+'}$${(Math.abs(cents) / 100).toFixed(2)}`;
  };
  
  const handleSaveProfile = () => {
    updateProfileMutation.mutate({ name, email, timezone });
  };

  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: "Password Mismatch",
        description: "Passwords do not match.",
        variant: "destructive",
      });
      return;
    }
    if (newPassword.length < 8) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 8 characters.",
        variant: "destructive",
      });
      return;
    }
    changePasswordMutation.mutate(newPassword);
  };

  return (
    <AppShell>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-white mb-2" data-testid="text-page-title">Account Settings</h1>
          <p className="text-muted-foreground">Manage your profile and security settings</p>
        </div>

        {isLoading ? (
          <GlassCard className="p-12 flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
            <p className="text-muted-foreground">Loading profile...</p>
          </GlassCard>
        ) : error ? (
          <GlassCard className="p-12 flex flex-col items-center justify-center">
            <div className="h-16 w-16 rounded-full bg-yellow-500/10 flex items-center justify-center mb-4">
              <User className="h-8 w-8 text-yellow-400" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">Unable to Load Profile</h3>
            <p className="text-muted-foreground text-center max-w-md">
              There was an issue loading your profile. Please try again later.
            </p>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <GlassCard className="p-6" data-testid="profile-section">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Profile Information</h3>
                    <p className="text-sm text-muted-foreground">Your personal details</p>
                  </div>
                </div>
                {!isEditing && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="border-white/10 hover:bg-white/5"
                    onClick={() => setIsEditing(true)}
                    data-testid="button-edit-profile"
                  >
                    Edit
                  </Button>
                )}
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-muted-foreground">Name</Label>
                  {isEditing ? (
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="bg-black/20 border-white/10 text-white"
                      data-testid="input-name"
                    />
                  ) : (
                    <div className="flex items-center gap-2 p-2 bg-black/20 rounded-md border border-white/10">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-white" data-testid="text-name">{profile?.name || 'Not set'}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-muted-foreground">Email</Label>
                  {isEditing ? (
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="bg-black/20 border-white/10 text-white"
                      data-testid="input-email"
                    />
                  ) : (
                    <div className="flex items-center gap-2 p-2 bg-black/20 rounded-md border border-white/10">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-white" data-testid="text-email">{profile?.email || 'Not set'}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timezone" className="text-muted-foreground">Timezone</Label>
                  {isEditing ? (
                    <Input
                      id="timezone"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      placeholder="e.g., Australia/Sydney"
                      className="bg-black/20 border-white/10 text-white placeholder:text-muted-foreground/50"
                      data-testid="input-timezone"
                    />
                  ) : (
                    <div className="flex items-center gap-2 p-2 bg-black/20 rounded-md border border-white/10">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-white" data-testid="text-timezone">{profile?.timezone || 'Not set'}</span>
                    </div>
                  )}
                </div>

                {isEditing && (
                  <div className="flex gap-2 pt-4">
                    <Button
                      onClick={handleSaveProfile}
                      disabled={updateProfileMutation.isPending}
                      className="bg-primary hover:bg-primary/90"
                      data-testid="button-save-profile"
                    >
                      {updateProfileMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Save Changes
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsEditing(false);
                        setName(profile?.name || "");
                        setEmail(profile?.email || "");
                        setTimezone(profile?.timezone || "");
                      }}
                      className="border-white/10 hover:bg-white/5"
                      data-testid="button-cancel-edit"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>

            </GlassCard>

            <GlassCard className="p-6" data-testid="security-section">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500 border border-green-500/20">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Security</h3>
                  <p className="text-sm text-muted-foreground">Change your password</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword" className="text-muted-foreground">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="bg-black/20 border-white/10 text-white pr-10 placeholder:text-muted-foreground/50"
                      data-testid="input-new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-muted-foreground">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="bg-black/20 border-white/10 text-white placeholder:text-muted-foreground/50"
                    data-testid="input-confirm-password"
                  />
                </div>

                <Button
                  onClick={handleChangePassword}
                  disabled={changePasswordMutation.isPending || !newPassword || !confirmPassword}
                  className="w-full bg-green-600 hover:bg-green-700"
                  data-testid="button-change-password"
                >
                  {changePasswordMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Key className="h-4 w-4 mr-2" />
                  )}
                  Change Password
                </Button>

                <p className="text-xs text-muted-foreground text-center mt-2">
                  Password must be at least 8 characters long
                </p>
              </div>
            </GlassCard>

            {/* Wallet Balance Section */}
            {stripeConfigured && (
              <GlassCard className="p-6" data-testid="wallet-section">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500 border border-green-500/20">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Wallet Balance</h3>
                    <p className="text-sm text-muted-foreground">Your current account balance</p>
                  </div>
                </div>
                <div className="text-3xl font-bold text-white mb-4">
                  ${((walletData?.wallet?.balanceCents || 0) / 100).toFixed(2)} AUD
                </div>
                
                {walletData?.wallet?.stripeCustomerId && (
                  <div className="pt-3 border-t border-white/10">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Stripe Customer ID</span>
                      <div className="flex items-center gap-2">
                        <code 
                          className="text-xs font-mono text-white/70 bg-black/30 px-2 py-1 rounded"
                          data-testid="text-stripe-customer-id"
                        >
                          {showStripeId 
                            ? walletData.wallet.stripeCustomerId 
                            : '••••••••••••••••••••'}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-white"
                          onClick={() => setShowStripeId(!showStripeId)}
                          data-testid="button-toggle-stripe-id"
                        >
                          {showStripeId ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                        {showStripeId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-white"
                            onClick={() => {
                              navigator.clipboard.writeText(walletData.wallet.stripeCustomerId!);
                              toast({
                                title: "Copied",
                                description: "Stripe Customer ID copied to clipboard",
                              });
                            }}
                            data-testid="button-copy-stripe-id"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </GlassCard>
            )}

            {/* Payment Methods Section */}
            {stripeConfigured && (
              <GlassCard className="p-6" data-testid="payment-methods-section">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Payment Methods</h3>
                    <p className="text-sm text-muted-foreground">Saved cards for wallet top-ups</p>
                  </div>
                </div>

                {loadingPaymentMethods ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : paymentMethodsData?.paymentMethods && paymentMethodsData.paymentMethods.length > 0 ? (
                  <div className="space-y-3">
                    {paymentMethodsData.paymentMethods.map((pm) => (
                      <div 
                        key={pm.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/10"
                        data-testid={`payment-method-${pm.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <CreditCard className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="text-sm font-medium text-white">
                              {formatCardBrand(pm.brand)} •••• {pm.last4}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Expires {pm.expMonth}/{pm.expYear}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                          onClick={() => deletePaymentMethodMutation.mutate(pm.id)}
                          disabled={deletePaymentMethodMutation.isPending}
                          data-testid={`delete-payment-method-${pm.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-2">
                    No saved payment methods. Add a card when you top up your wallet.
                  </p>
                )}
              </GlassCard>
            )}

            {/* Transaction History Section */}
            {stripeConfigured && (
              <GlassCard className="p-6 lg:col-span-2" data-testid="transactions-section">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                    <History className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Transaction History</h3>
                    <p className="text-sm text-muted-foreground">Your wallet transaction history</p>
                  </div>
                </div>

                {loadingTransactions ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : transactionsData?.transactions && transactionsData.transactions.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {transactionsData.transactions.slice(0, 10).map((tx) => (
                      <div 
                        key={tx.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/10"
                        data-testid={`transaction-${tx.id}`}
                      >
                        <div>
                          <div className="text-sm font-medium text-white">
                            {formatTransactionType(tx.type)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(tx.createdAt).toLocaleDateString()} {new Date(tx.createdAt).toLocaleTimeString()}
                          </div>
                        </div>
                        <div className={`text-sm font-medium ${tx.amountCents >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {formatCurrency(tx.amountCents)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-2">
                    No transactions yet. Your wallet activity will appear here.
                  </p>
                )}
              </GlassCard>
            )}
          </div>
        )}

        {profile && (
          <div className="flex justify-center gap-6 text-xs text-muted-foreground mt-8">
            <div>
              <span>VIRTID: </span>
              <span className="font-mono" data-testid="text-vf-id">{profile?.virtFusionUserId || 'Not linked'}</span>
            </div>
            <div>
              <span>Auth0 ID: </span>
              <span className="font-mono" data-testid="text-auth0-id">{profile?.id || 'Unknown'}</span>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
