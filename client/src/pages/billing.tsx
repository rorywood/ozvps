import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { AppShell } from "@/components/layout/app-shell";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { 
  Wallet,
  CreditCard,
  History,
  Plus,
  Loader2,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";

interface Wallet {
  id: number;
  auth0UserId: string;
  balanceCents: number;
  stripeCustomerId?: string;
}

interface Transaction {
  id: number;
  type: string;
  amountCents: number;
  createdAt: string;
  metadata?: any;
}

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTransactionAmount(cents: number): string {
  const isNegative = cents < 0;
  return `${isNegative ? '-' : '+'}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const TOPUP_AMOUNTS = [1000, 2000, 5000, 10000];

// Card element styling for dark theme
const cardElementOptions = {
  style: {
    base: {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'Inter, system-ui, sans-serif',
      '::placeholder': {
        color: '#6b7280',
      },
      iconColor: '#9ca3af',
    },
    invalid: {
      color: '#ef4444',
      iconColor: '#ef4444',
    },
  },
};

// Add Card Form Component (used inside Stripe Elements)
function AddCardFormInner({ 
  onSuccess, 
  onCancel 
}: { 
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Get SetupIntent client secret from backend
      const { clientSecret } = await api.createSetupIntent();
      
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error('Card element not found');
      }

      // Confirm card setup
      const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: cardElement,
        },
      });

      if (stripeError) {
        throw new Error(stripeError.message || 'Failed to add card');
      }

      if (setupIntent?.status === 'succeeded') {
        toast({
          title: "Card added",
          description: "Your payment method has been saved.",
        });
        onSuccess();
      } else {
        throw new Error('Card setup did not complete');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to add card');
      toast({
        title: "Error",
        description: err.message || "Failed to add card",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-black/30 border border-white/10">
          <CardElement options={cardElementOptions} />
        </div>
        
        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}
        
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="border-white/10"
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!stripe || isProcessing}
            data-testid="button-confirm-add-card"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Adding...
              </>
            ) : (
              'Add Card'
            )}
          </Button>
        </DialogFooter>
      </div>
    </form>
  );
}

export default function BillingPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [showStripeId, setShowStripeId] = useState(false);
  const [topupDialogOpen, setTopupDialogOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [addCardDialogOpen, setAddCardDialogOpen] = useState(false);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);

  // Load Stripe when dialog opens
  useEffect(() => {
    if (addCardDialogOpen && !stripePromise) {
      // Fetch publishable key and load Stripe using API client
      api.getStripePublishableKey()
        .then(data => {
          if (data.publishableKey) {
            setStripePromise(loadStripe(data.publishableKey));
          }
        })
        .catch(err => {
          console.error('Failed to load Stripe:', err);
        });
    }
  }, [addCardDialogOpen, stripePromise]);

  const searchParams = new URLSearchParams(search);
  const topupResult = searchParams.get('topup');

  useEffect(() => {
    if (topupResult === 'success') {
      toast({
        title: "Payment successful",
        description: "Your wallet has been topped up.",
      });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setLocation('/billing', { replace: true });
    } else if (topupResult === 'cancelled') {
      toast({
        title: "Payment cancelled",
        description: "Your payment was cancelled.",
        variant: "destructive",
      });
      setLocation('/billing', { replace: true });
    }
  }, [topupResult, toast, queryClient, setLocation]);

  const { data: walletData, isLoading: loadingWallet } = useQuery<{ wallet: Wallet }>({
    queryKey: ['wallet'],
    queryFn: () => api.getWallet(),
  });

  const { data: stripeStatus } = useQuery({
    queryKey: ['stripe-status'],
    queryFn: () => api.getStripeStatus(),
    staleTime: 5 * 60 * 1000,
  });

  const stripeConfigured = stripeStatus?.configured ?? false;

  const { data: paymentMethodsData, isLoading: loadingPaymentMethods } = useQuery<{ paymentMethods: PaymentMethod[] }>({
    queryKey: ['payment-methods'],
    queryFn: () => api.getPaymentMethods(),
    enabled: stripeConfigured,
  });

  const { data: transactionsData, isLoading: loadingTransactions } = useQuery<{ transactions: Transaction[] }>({
    queryKey: ['transactions'],
    queryFn: () => api.getTransactions(),
    enabled: stripeConfigured,
  });

  const topupMutation = useMutation({
    mutationFn: (amountCents: number) => api.createTopup(amountCents),
    onSuccess: (data: { url: string }) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create checkout session",
        variant: "destructive",
      });
    },
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

  const formatTransactionType = (type: string, metadata?: any) => {
    if (type === 'credit') {
      if (metadata?.source === 'admin') return 'Admin Credit';
      return 'Top-up';
    }
    if (type === 'debit') {
      if (metadata?.deployOrderId) return 'Server Deployment';
      return 'Payment';
    }
    if (type === 'refund') return 'Refund';
    return type;
  };

  const getValidAmount = (): number | null => {
    if (selectedAmount) return selectedAmount;
    if (customAmount) {
      const parsed = parseFloat(customAmount);
      if (!isNaN(parsed) && parsed > 0) {
        return Math.round(parsed * 100);
      }
    }
    return null;
  };

  const handleTopup = () => {
    const amount = getValidAmount();
    if (!amount) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }
    if (amount < 500) {
      toast({
        title: "Invalid Amount",
        description: "Minimum top-up amount is $5.00",
        variant: "destructive",
      });
      return;
    }
    if (amount > 50000) {
      toast({
        title: "Invalid Amount",
        description: "Maximum top-up amount is $500.00",
        variant: "destructive",
      });
      return;
    }
    topupMutation.mutate(amount);
    setTopupDialogOpen(false);
  };

  const handlePresetSelect = (amount: number) => {
    setSelectedAmount(amount);
    setCustomAmount("");
  };

  const handleCustomAmountChange = (value: string) => {
    // Only allow valid numeric input
    const sanitized = value.replace(/[^0-9.]/g, '');
    // Prevent multiple decimal points
    const parts = sanitized.split('.');
    const formatted = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : sanitized;
    setCustomAmount(formatted);
    setSelectedAmount(null);
  };

  const wallet = walletData?.wallet;
  const transactions = transactionsData?.transactions || [];
  const paymentMethods = paymentMethodsData?.paymentMethods || [];

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-white" data-testid="text-page-title">
              Billing
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Manage your wallet and payment methods
            </p>
          </div>
        </div>

        {!stripeConfigured ? (
          <GlassCard className="p-8 text-center">
            <div className="h-16 w-16 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto mb-4">
              <CreditCard className="h-8 w-8 text-yellow-400" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">Payments Not Available</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              The payment system is being configured. Please contact support if you need to add funds to your account.
            </p>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <GlassCard className="p-6" data-testid="wallet-section">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                      <Wallet className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">Wallet Balance</h3>
                      <p className="text-sm text-muted-foreground">Available for deployments</p>
                    </div>
                  </div>
                  <Dialog open={topupDialogOpen} onOpenChange={setTopupDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="gap-2" data-testid="button-topup">
                        <Plus className="h-4 w-4" />
                        Add Funds
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Add Funds to Wallet</DialogTitle>
                        <DialogDescription>
                          Choose an amount to add to your wallet balance. Funds are used for server deployments.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-3">
                          {TOPUP_AMOUNTS.map((amount) => (
                            <Button
                              key={amount}
                              variant={selectedAmount === amount ? "default" : "outline"}
                              className={selectedAmount === amount ? "" : "border-white/10"}
                              onClick={() => handlePresetSelect(amount)}
                              data-testid={`button-amount-${amount}`}
                            >
                              {formatCurrency(amount)}
                            </Button>
                          ))}
                        </div>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="Custom amount"
                            value={customAmount}
                            onChange={(e) => handleCustomAmountChange(e.target.value)}
                            className="pl-8 bg-black/20 border-white/10"
                            data-testid="input-custom-amount"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Minimum $5.00, maximum $500.00 AUD
                        </p>
                      </div>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setTopupDialogOpen(false)}
                          className="border-white/10"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleTopup}
                          disabled={topupMutation.isPending || getValidAmount() === null}
                          data-testid="button-confirm-topup"
                        >
                          {topupMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : null}
                          Continue to Payment
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>

                <div className="flex items-baseline gap-2 mb-4">
                  {loadingWallet ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      <span className="text-4xl font-bold text-white font-mono" data-testid="text-balance">
                        {formatCurrency(wallet?.balanceCents || 0)}
                      </span>
                      <span className="text-muted-foreground">AUD</span>
                    </>
                  )}
                </div>

                {wallet?.stripeCustomerId && (
                  <div className="pt-4 border-t border-white/10">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Stripe Customer ID</span>
                      <div className="flex items-center gap-2">
                        <code 
                          className="text-xs font-mono text-white/70 bg-black/30 px-2 py-1 rounded"
                          data-testid="text-stripe-customer-id"
                        >
                          {showStripeId 
                            ? wallet.stripeCustomerId 
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
                              navigator.clipboard.writeText(wallet.stripeCustomerId!);
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

              <GlassCard className="p-6" data-testid="transactions-section">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                    <History className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Transaction History</h3>
                    <p className="text-sm text-muted-foreground">Your wallet activity</p>
                  </div>
                </div>

                {loadingTransactions ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="h-12 w-12 rounded-full bg-muted/10 flex items-center justify-center mx-auto mb-3">
                      <History className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground">No transactions yet</p>
                    <p className="text-sm text-muted-foreground/70">Add funds to get started</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {transactions.slice(0, 10).map((tx) => (
                      <div 
                        key={tx.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/5"
                        data-testid={`transaction-${tx.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                            tx.amountCents >= 0 
                              ? 'bg-green-500/10 text-green-500' 
                              : 'bg-red-500/10 text-red-500'
                          }`}>
                            {tx.amountCents >= 0 
                              ? <ArrowDownLeft className="h-4 w-4" />
                              : <ArrowUpRight className="h-4 w-4" />
                            }
                          </div>
                          <div>
                            <div className="text-sm font-medium text-white">
                              {formatTransactionType(tx.type, tx.metadata)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDate(tx.createdAt)}
                            </div>
                          </div>
                        </div>
                        <span className={`font-mono font-medium ${
                          tx.amountCents >= 0 ? 'text-green-500' : 'text-red-400'
                        }`}>
                          {formatTransactionAmount(tx.amountCents)}
                        </span>
                      </div>
                    ))}
                    {transactions.length > 10 && (
                      <p className="text-center text-sm text-muted-foreground pt-2">
                        Showing most recent 10 of {transactions.length} transactions
                      </p>
                    )}
                  </div>
                )}
              </GlassCard>
            </div>

            <div className="space-y-6">
              <GlassCard className="p-6" data-testid="payment-methods-section">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">Payment Methods</h3>
                      <p className="text-sm text-muted-foreground">Saved cards</p>
                    </div>
                  </div>
                  <Dialog open={addCardDialogOpen} onOpenChange={setAddCardDialogOpen}>
                    <DialogTrigger asChild>
                      <Button 
                        size="sm" 
                        className="gap-1"
                        data-testid="button-add-card"
                      >
                        <Plus className="h-4 w-4" />
                        Add Card
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md bg-zinc-900 border-white/10">
                      <DialogHeader>
                        <DialogTitle className="text-white">Add Payment Method</DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                          Add a new card to your account for faster top-ups.
                        </DialogDescription>
                      </DialogHeader>
                      {stripePromise ? (
                        <Elements stripe={stripePromise}>
                          <AddCardFormInner
                            onSuccess={() => {
                              setAddCardDialogOpen(false);
                              queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
                            }}
                            onCancel={() => setAddCardDialogOpen(false)}
                          />
                        </Elements>
                      ) : (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                </div>

                {loadingPaymentMethods ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : paymentMethods.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground">No saved payment methods</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Click "Add Card" to save a payment method
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {paymentMethods.map((pm) => (
                      <div 
                        key={pm.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/5"
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
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                          onClick={() => deletePaymentMethodMutation.mutate(pm.id)}
                          disabled={deletePaymentMethodMutation.isPending}
                          data-testid={`delete-payment-method-${pm.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>

              <GlassCard className="p-6">
                <h4 className="font-medium text-white mb-3">Need Help?</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Having issues with payments or your wallet balance? Our support team is here to help.
                </p>
                <Button
                  variant="outline"
                  className="w-full border-white/10 hover:bg-white/5"
                  onClick={() => window.open('mailto:support@ozvps.au', '_blank')}
                  data-testid="button-contact-support"
                >
                  Contact Support
                </Button>
              </GlassCard>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
