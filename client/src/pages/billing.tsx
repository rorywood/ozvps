import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { AppShell } from "@/components/layout/app-shell";
import { useDocumentTitle } from "@/hooks/use-document-title";
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
  Zap,
  ChevronRight,
  ChevronLeft,
  FileText,
  Download,
  CheckCircle2,
  XCircle,
  X,
  AlertCircle
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
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

const cardElementOptions = {
  hidePostalCode: true,
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
  const [cardReady, setCardReady] = useState(false);
  const [cardLoadTimeout, setCardLoadTimeout] = useState(false);
  const { toast } = useToast();
  
  // Check if Stripe/Elements loaded properly
  const stripeReady = !!stripe && !!elements;
  
  // Timeout for card element loading (10 seconds)
  useEffect(() => {
    if (stripeReady && !cardReady) {
      const timeout = setTimeout(() => {
        if (!cardReady) {
          setCardLoadTimeout(true);
        }
      }, 10000);
      return () => clearTimeout(timeout);
    }
  }, [stripeReady, cardReady]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const { clientSecret } = await api.createSetupIntent();
      
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error('Card element not found');
      }

      const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: cardElement,
        },
      });

      if (stripeError) {
        throw new Error(stripeError.message || 'Failed to add card');
      }

      if (setupIntent?.status === 'succeeded') {
        // Validate the card to check for duplicates
        const paymentMethodId = setupIntent.payment_method as string;
        if (paymentMethodId) {
          const validation = await api.validatePaymentMethod(paymentMethodId);
          if (!validation.valid) {
            if (validation.duplicate) {
              throw new Error(`This card is already saved (${validation.existingCard?.brand} ending in ${validation.existingCard?.last4})`);
            }
            throw new Error(validation.error || 'Card validation failed');
          }
        }
        
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
        <div className="relative">
          {!stripeReady ? (
            <div className="p-4 rounded-lg bg-zinc-800/50 border border-yellow-500/50 min-h-[50px] text-center">
              <AlertCircle className="h-6 w-6 mx-auto text-yellow-500 mb-2" />
              <p className="text-sm text-yellow-400 mb-2">Payment system initializing...</p>
              <p className="text-xs text-muted-foreground">If this persists, check browser console for errors or try refreshing.</p>
            </div>
          ) : cardLoadTimeout && !cardReady ? (
            <div className="p-4 rounded-lg bg-zinc-800/50 border border-red-500/50 min-h-[50px] text-center">
              <AlertCircle className="h-6 w-6 mx-auto text-red-500 mb-2" />
              <p className="text-sm text-red-400 mb-2">Card form failed to load</p>
              <p className="text-xs text-muted-foreground mb-3">This may be caused by a browser extension blocking Stripe, or a network issue.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setCardLoadTimeout(false);
                  setCardReady(false);
                }}
              >
                Try Again
              </Button>
            </div>
          ) : (
            <>
              {!cardReady && stripeReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-800/50 rounded-lg border border-border z-10">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading card form...</span>
                  </div>
                </div>
              )}
              <div className={`p-4 rounded-lg bg-zinc-800/50 border border-border min-h-[50px] ${!cardReady ? 'opacity-0' : 'opacity-100'}`}>
                <CardElement
                  options={cardElementOptions}
                  onReady={() => setCardReady(true)}
                />
              </div>
            </>
          )}
        </div>
        
        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}
        
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="border-border"
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

function AutoTopupSection({ paymentMethods }: { paymentMethods: PaymentMethod[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: autoTopupData, isLoading } = useQuery({
    queryKey: ['auto-topup'],
    queryFn: () => api.getAutoTopupSettings(),
  });

  const updateMutation = useMutation({
    mutationFn: (settings: {
      enabled: boolean;
      thresholdCents?: number;
      amountCents?: number;
      paymentMethodId?: string | null;
    }) => api.updateAutoTopupSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-topup'] });
      toast({
        title: "Settings Updated",
        description: "Your auto top-up settings have been saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update settings",
        variant: "destructive",
      });
    },
  });

  const handleToggle = (enabled: boolean) => {
    if (enabled && paymentMethods.length === 0) {
      toast({
        title: "Add a Payment Method",
        description: "Please add a card before enabling auto top-up.",
        variant: "destructive",
      });
      return;
    }

    const pmId = enabled ? (autoTopupData?.paymentMethodId || paymentMethods[0]?.id) : null;
    updateMutation.mutate({
      enabled,
      thresholdCents: autoTopupData?.thresholdCents || 500,
      amountCents: autoTopupData?.amountCents || 2000,
      paymentMethodId: pmId,
    });
  };

  const handleThresholdChange = (value: string) => {
    const cents = parseInt(value) * 100;
    updateMutation.mutate({
      enabled: autoTopupData?.enabled || false,
      thresholdCents: cents,
      amountCents: autoTopupData?.amountCents || 2000,
      paymentMethodId: autoTopupData?.paymentMethodId,
    });
  };

  const handleAmountChange = (value: string) => {
    const cents = parseInt(value) * 100;
    updateMutation.mutate({
      enabled: autoTopupData?.enabled || false,
      thresholdCents: autoTopupData?.thresholdCents || 500,
      amountCents: cents,
      paymentMethodId: autoTopupData?.paymentMethodId,
    });
  };

  const handlePaymentMethodChange = (pmId: string) => {
    updateMutation.mutate({
      enabled: autoTopupData?.enabled || false,
      thresholdCents: autoTopupData?.thresholdCents || 500,
      amountCents: autoTopupData?.amountCents || 2000,
      paymentMethodId: pmId,
    });
  };

  const selectedPm = paymentMethods.find(pm => pm.id === autoTopupData?.paymentMethodId);

  return (
    <div className="rounded-xl bg-muted/10 ring-1 ring-border p-5" data-testid="auto-topup-section">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-medium text-foreground">Auto Top-Up</h3>
            <p className="text-sm text-muted-foreground">Automatically add funds</p>
          </div>
        </div>
        <Switch
          checked={autoTopupData?.enabled ?? false}
          onCheckedChange={handleToggle}
          disabled={isLoading || updateMutation.isPending}
          data-testid="switch-auto-topup"
        />
      </div>

      {autoTopupData?.enabled && (
        <div className="space-y-4 pt-4 mt-4 border-t border-border">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">When balance drops below</Label>
              <Select
                value={String((autoTopupData?.thresholdCents || 500) / 100)}
                onValueChange={handleThresholdChange}
                disabled={updateMutation.isPending}
              >
                <SelectTrigger className="bg-card/30 border-border" data-testid="select-threshold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">$5</SelectItem>
                  <SelectItem value="10">$10</SelectItem>
                  <SelectItem value="20">$20</SelectItem>
                  <SelectItem value="50">$50</SelectItem>
                  <SelectItem value="100">$100</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Top-up amount</Label>
              <Select
                value={String((autoTopupData?.amountCents || 2000) / 100)}
                onValueChange={handleAmountChange}
                disabled={updateMutation.isPending}
              >
                <SelectTrigger className="bg-card/30 border-border" data-testid="select-amount">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">$10</SelectItem>
                  <SelectItem value="20">$20</SelectItem>
                  <SelectItem value="50">$50</SelectItem>
                  <SelectItem value="100">$100</SelectItem>
                  <SelectItem value="200">$200</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Payment method</Label>
            {paymentMethods.length === 0 ? (
              <p className="text-sm text-yellow-500">No payment methods available</p>
            ) : (
              <Select
                value={autoTopupData?.paymentMethodId || paymentMethods[0]?.id}
                onValueChange={handlePaymentMethodChange}
                disabled={updateMutation.isPending}
              >
                <SelectTrigger className="bg-card/30 border-border" data-testid="select-payment-method">
                  <SelectValue>
                    {selectedPm ? `•••• ${selectedPm.last4}` : 'Select card'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map(pm => (
                    <SelectItem key={pm.id} value={pm.id}>
                      {pm.brand} •••• {pm.last4}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  useDocumentTitle('Billing');
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
  const [stripeLoadError, setStripeLoadError] = useState<string | null>(null);
  const [paymentFeedback, setPaymentFeedback] = useState<{ type: 'success' | 'error'; message: string; amount?: number } | null>(null);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [invoicesPage, setInvoicesPage] = useState(1);
  const ITEMS_PER_PAGE = 5;
  const MAX_TRANSACTION_PAGES = 5;
  const MAX_INVOICE_PAGES = 5;

  useEffect(() => {
    if (addCardDialogOpen && !stripePromise && !stripeLoadError) {
      console.log('[Billing] Loading Stripe publishable key...');
      setStripeLoadError(null);
      api.getStripePublishableKey()
        .then(data => {
          console.log('[Billing] Stripe key response:', data);
          if (data.publishableKey) {
            console.log('[Billing] Loading Stripe.js with key:', data.publishableKey.substring(0, 20) + '...');
            const promise = loadStripe(data.publishableKey);
            promise.then(stripe => {
              if (stripe) {
                console.log('[Billing] Stripe.js loaded successfully');
              } else {
                console.error('[Billing] Stripe.js returned null');
                setStripeLoadError('Failed to initialize Stripe. Please check your browser settings.');
              }
            });
            setStripePromise(promise);
          } else {
            console.error('[Billing] No publishable key in response');
            setStripeLoadError('Payment system not configured - missing publishable key');
          }
        })
        .catch(err => {
          console.error('[Billing] Failed to load Stripe:', err);
          setStripeLoadError(`Failed to load payment form: ${err.message || 'Unknown error'}`);
        });
    }
  }, [addCardDialogOpen, stripePromise, stripeLoadError]);
  
  // Reset stripe error when dialog closes
  useEffect(() => {
    if (!addCardDialogOpen) {
      setStripeLoadError(null);
    }
  }, [addCardDialogOpen]);

  const searchParams = new URLSearchParams(search);
  const topupResult = searchParams.get('topup');

  useEffect(() => {
    if (topupResult === 'success') {
      setPaymentFeedback({
        type: 'success',
        message: 'Payment Approved - Your wallet has been topped up successfully!'
      });
      toast({
        title: "Payment successful",
        description: "Your wallet has been topped up.",
      });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setLocation('/billing', { replace: true });
    } else if (topupResult === 'cancelled') {
      setPaymentFeedback({
        type: 'error',
        message: 'Payment Cancelled - Your payment was not completed.'
      });
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

  const { data: invoicesData, isLoading: loadingInvoices } = useQuery<{ invoices: Array<{
    id: string;
    invoiceNumber: string;
    amountCents: number;
    description: string;
    status: string;
    createdAt: string;
    pdfUrl: string | null;
  }> }>({
    queryKey: ['invoices'],
    queryFn: () => api.getInvoices(),
    enabled: stripeConfigured,
  });

  const { data: upcomingChargesData, isLoading: loadingUpcomingCharges } = useQuery<{ upcoming: Array<{
    id: number;
    virtfusionServerId: string;
    planId: number;
    monthlyPriceCents: number;
    status: string;
    nextBillAt: string;
    suspendAt: string | null;
    autoRenew: boolean;
  }> }>({
    queryKey: ['upcoming-charges'],
    queryFn: () => api.getUpcomingCharges(),
    enabled: stripeConfigured,
  });

  // Clamp pagination when data changes to prevent blank pages
  useEffect(() => {
    const txCount = transactionsData?.transactions?.length || 0;
    const txMaxPage = Math.min(MAX_TRANSACTION_PAGES, Math.max(1, Math.ceil(txCount / ITEMS_PER_PAGE)));
    if (transactionsPage > txMaxPage) {
      setTransactionsPage(txMaxPage);
    }
  }, [transactionsData?.transactions?.length, transactionsPage]);

  useEffect(() => {
    const invCount = invoicesData?.invoices?.length || 0;
    const invMaxPage = Math.min(MAX_INVOICE_PAGES, Math.max(1, Math.ceil(invCount / ITEMS_PER_PAGE)));
    if (invoicesPage > invMaxPage) {
      setInvoicesPage(invMaxPage);
    }
  }, [invoicesData?.invoices?.length, invoicesPage]);

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

  const directChargeMutation = useMutation({
    mutationFn: ({ amountCents, paymentMethodId }: { amountCents: number; paymentMethodId: string }) => 
      api.directTopup(amountCents, paymentMethodId),
    onSuccess: (data, variables) => {
      if (data.success) {
        const chargedAmount = (data.chargedAmountCents || 0) / 100;
        setPaymentFeedback({
          type: 'success',
          message: `Payment Approved - $${chargedAmount.toFixed(2)} has been added to your wallet!`,
          amount: data.chargedAmountCents
        });
        queryClient.invalidateQueries({ queryKey: ['wallet'] });
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
        toast({
          title: "Payment Successful",
          description: `$${chargedAmount.toFixed(2)} has been added to your wallet.`,
        });
        setTopupDialogOpen(false);
        setSelectedAmount(null);
        setCustomAmount("");
      } else if (data.requiresAction) {
        // Card requires 3DS - fall back to Stripe Checkout which handles authentication
        // First, close the dialog and reset state to prevent duplicate submissions
        setTopupDialogOpen(false);
        setSelectedAmount(null);
        setCustomAmount("");
        setSelectedPaymentMethodId(null);
        
        toast({
          title: "Redirecting to Secure Payment",
          description: "Your card requires additional verification.",
        });
        // Fall back to checkout session (redirect happens in onSuccess)
        topupMutation.mutate(variables.amountCents);
      } else {
        setPaymentFeedback({
          type: 'error',
          message: data.error || 'Payment Declined - There was an issue processing your card.'
        });
        toast({
          title: "Payment Failed",
          description: data.error || "Failed to process payment",
          variant: "destructive",
        });
        setTopupDialogOpen(false);
      }
    },
    onError: (error: any) => {
      setPaymentFeedback({
        type: 'error',
        message: error.message || 'Payment Declined - There was an issue processing your card.'
      });
      toast({
        title: "Error",
        description: error.message || "Failed to process payment",
        variant: "destructive",
      });
      setTopupDialogOpen(false);
    },
  });

  // State for selected payment method in topup dialog
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(null);

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
      if (metadata?.source === 'auto_topup') return 'Auto Top-Up';
      return 'Top-up';
    }
    if (type === 'debit') {
      if (metadata?.deployOrderId) return 'Server Deployment';
      if (metadata?.serverBilling) return 'Server Billing';
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
    
    // Check if a saved card is available and selected for direct charge
    const pmToUse = selectedPaymentMethodId || (paymentMethods.length > 0 ? paymentMethods[0].id : null);
    
    if (pmToUse) {
      // Use direct charge with saved card
      directChargeMutation.mutate({ amountCents: amount, paymentMethodId: pmToUse });
    } else {
      // Fallback to Stripe checkout if no saved card
      topupMutation.mutate(amount);
      setTopupDialogOpen(false);
    }
  };

  const handlePresetSelect = (amount: number) => {
    setSelectedAmount(amount);
    setCustomAmount("");
  };

  const handleCustomAmountChange = (value: string) => {
    const sanitized = value.replace(/[^0-9.]/g, '');
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
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-page-title">
            Billing
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your wallet and payment methods
          </p>
        </div>

        {!stripeConfigured ? (
          <div className="rounded-2xl bg-muted/10 ring-1 ring-border p-12 text-center">
            <div className="h-16 w-16 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto mb-4">
              <CreditCard className="h-8 w-8 text-yellow-400" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">Payments Not Available</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              The payment system is being configured. Please contact support if you need to add funds to your account.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Payment Feedback Message */}
            {paymentFeedback && (
              <div 
                className={`rounded-xl p-4 flex items-center justify-between ${
                  paymentFeedback.type === 'success' 
                    ? 'bg-green-500/10 ring-1 ring-green-500/30' 
                    : 'bg-red-500/10 ring-1 ring-red-500/30'
                }`}
                data-testid={`payment-feedback-${paymentFeedback.type}`}
              >
                <div className="flex items-center gap-3">
                  {paymentFeedback.type === 'success' ? (
                    <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-500 flex-shrink-0" />
                  )}
                  <span className={`font-medium ${
                    paymentFeedback.type === 'success' ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {paymentFeedback.message}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setPaymentFeedback(null)}
                  data-testid="dismiss-payment-feedback"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Wallet Balance - Hero Card */}
            <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-transparent to-blue-500/10 ring-1 ring-white/10 p-6" data-testid="wallet-section">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-primary/20 flex items-center justify-center text-primary">
                    <Wallet className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Available Balance</p>
                    {loadingWallet ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : (
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-bold text-foreground font-display" data-testid="text-balance">
                          {formatCurrency(wallet?.balanceCents || 0)}
                        </span>
                        <span className="text-muted-foreground">AUD</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <Dialog open={topupDialogOpen} onOpenChange={setTopupDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="lg" className="gap-2 shadow-lg" data-testid="button-topup">
                      <Plus className="h-5 w-5" />
                      Add Funds
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Add Funds to Wallet</DialogTitle>
                      <DialogDescription>
                        Choose an amount to add to your wallet balance.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="grid grid-cols-2 gap-3">
                        {TOPUP_AMOUNTS.map((amount) => (
                          <Button
                            key={amount}
                            variant={selectedAmount === amount ? "default" : "outline"}
                            className={selectedAmount === amount ? "" : "border-border"}
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
                          className="pl-8 bg-card/30 border-border"
                          data-testid="input-custom-amount"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Minimum $5.00, maximum $500.00 AUD
                      </p>
                      
                      {/* Payment Method Selection */}
                      {paymentMethods.length > 0 && (
                        <div className="pt-4 border-t border-border">
                          <label className="text-sm font-medium text-foreground mb-2 block">
                            Pay with saved card
                          </label>
                          <Select
                            value={selectedPaymentMethodId || paymentMethods[0]?.id || ''}
                            onValueChange={(value) => setSelectedPaymentMethodId(value)}
                          >
                            <SelectTrigger className="w-full bg-card/30 border-border" data-testid="select-payment-method">
                              <SelectValue placeholder="Select a card" />
                            </SelectTrigger>
                            <SelectContent>
                              {paymentMethods.map((pm) => (
                                <SelectItem key={pm.id} value={pm.id} data-testid={`option-card-${pm.id}`}>
                                  {formatCardBrand(pm.brand)} •••• {pm.last4} (exp {pm.expMonth}/{pm.expYear})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground mt-2">
                            Your card will be charged instantly
                          </p>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setTopupDialogOpen(false)}
                        className="border-border"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleTopup}
                        disabled={topupMutation.isPending || directChargeMutation.isPending || getValidAmount() === null}
                        data-testid="button-confirm-topup"
                      >
                        {(topupMutation.isPending || directChargeMutation.isPending) ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        {paymentMethods.length > 0 ? 'Pay Now' : 'Continue to Payment'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {wallet?.stripeCustomerId && (
                <div className="pt-4 mt-4 border-t border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Stripe Customer ID</span>
                    <div className="flex items-center gap-2">
                      <code 
                        className="text-xs font-mono text-foreground/70 bg-card/30 px-2 py-1 rounded"
                        data-testid="text-stripe-customer-id"
                      >
                        {showStripeId 
                          ? wallet.stripeCustomerId 
                          : '••••••••••••••••••••'}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowStripeId(!showStripeId)}
                        data-testid="button-toggle-stripe-id"
                      >
                        {showStripeId ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                      {showStripeId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
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
            </div>

            {/* Payment Methods - Horizontal scroll */}
            <div data-testid="payment-methods-section">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-foreground">Payment Methods</h2>
                    <p className="text-sm text-muted-foreground">Saved cards for top-ups</p>
                  </div>
                </div>
                <Dialog open={addCardDialogOpen} onOpenChange={setAddCardDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1 border-border" data-testid="button-add-card">
                      <Plus className="h-4 w-4" />
                      Add Card
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md bg-zinc-900 border-border">
                    <DialogHeader>
                      <DialogTitle className="text-foreground">Add Payment Method</DialogTitle>
                      <DialogDescription className="text-muted-foreground">
                        Add a new card to your account for faster top-ups.
                      </DialogDescription>
                    </DialogHeader>
                    {stripeLoadError ? (
                      <div className="py-8 text-center">
                        <AlertCircle className="h-8 w-8 mx-auto text-red-500 mb-3" />
                        <p className="text-red-400 mb-4">{stripeLoadError}</p>
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            setStripeLoadError(null);
                            setStripePromise(null);
                          }}
                          className="border-border"
                        >
                          Try Again
                        </Button>
                      </div>
                    ) : stripePromise ? (
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
                      <div className="flex flex-col items-center justify-center py-8 gap-2">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Loading payment form...</p>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </div>

              {loadingPaymentMethods ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : paymentMethods.length === 0 ? (
                <div className="rounded-xl bg-muted/10 ring-1 ring-border p-8 text-center">
                  <p className="text-muted-foreground">No saved payment methods</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">Add a card for faster top-ups</p>
                </div>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
                  {paymentMethods.map((pm) => (
                    <div 
                      key={pm.id}
                      className="flex-shrink-0 rounded-xl bg-muted/15 ring-1 ring-border p-4 min-w-[200px]"
                      data-testid={`payment-method-${pm.id}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <CreditCard className="h-5 w-5 text-muted-foreground" />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                          onClick={() => deletePaymentMethodMutation.mutate(pm.id)}
                          disabled={deletePaymentMethodMutation.isPending}
                          data-testid={`delete-payment-method-${pm.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="text-lg font-medium text-foreground mb-1">
                        •••• {pm.last4}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatCardBrand(pm.brand)} · Exp {pm.expMonth}/{pm.expYear}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Auto Top-Up */}
            <AutoTopupSection paymentMethods={paymentMethods} />

            {/* Upcoming Server Charges */}
            {upcomingChargesData && upcomingChargesData.upcoming.length > 0 && (
              <div data-testid="upcoming-charges-section">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                    <History className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-foreground">Upcoming Server Charges</h2>
                    <p className="text-sm text-muted-foreground">Monthly billing for your servers</p>
                  </div>
                </div>

                {loadingUpcomingCharges ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {upcomingChargesData.upcoming.map((charge) => {
                      const nextBillDate = new Date(charge.nextBillAt);
                      const now = new Date();
                      const daysUntilBill = Math.ceil((nextBillDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                      const suspendDate = charge.suspendAt ? new Date(charge.suspendAt) : null;
                      const daysUntilSuspension = suspendDate ? Math.ceil((suspendDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

                      return (
                        <div
                          key={charge.id}
                          className={`p-4 rounded-xl ring-1 transition-colors ${
                            charge.status === 'suspended'
                              ? 'bg-red-500/10 ring-red-500/30'
                              : charge.status === 'unpaid'
                              ? 'bg-yellow-500/10 ring-yellow-500/30'
                              : 'bg-muted/10 ring-border hover:bg-muted/20'
                          }`}
                          data-testid={`upcoming-charge-${charge.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                                charge.status === 'suspended'
                                  ? 'bg-red-500/20 text-red-500'
                                  : charge.status === 'unpaid'
                                  ? 'bg-yellow-500/20 text-yellow-500'
                                  : 'bg-blue-500/20 text-blue-500'
                              }`}>
                                <History className="h-5 w-5" />
                              </div>
                              <div>
                                <div className="font-medium text-foreground">
                                  Server {charge.virtfusionServerId}
                                  {charge.status === 'suspended' && (
                                    <span className="ml-2 text-xs uppercase font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
                                      SUSPENDED
                                    </span>
                                  )}
                                  {charge.status === 'unpaid' && (
                                    <span className="ml-2 text-xs uppercase font-bold px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">
                                      UNPAID
                                    </span>
                                  )}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {charge.status === 'unpaid' && daysUntilSuspension !== null ? (
                                    <span className="text-yellow-400">
                                      Suspends in {daysUntilSuspension} day{daysUntilSuspension !== 1 ? 's' : ''} - Add funds to prevent suspension
                                    </span>
                                  ) : charge.status === 'suspended' ? (
                                    <span className="text-red-400">
                                      Suspended - Add funds to reactivate
                                    </span>
                                  ) : (
                                    <>Next billing: {formatDate(charge.nextBillAt)} ({daysUntilBill} day{daysUntilBill !== 1 ? 's' : ''})</>
                                  )}
                                </div>
                              </div>
                            </div>
                            <span className="font-mono text-lg font-medium text-foreground">
                              {formatCurrency(charge.monthlyPriceCents)}/mo
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Transaction History */}
            <div data-testid="transactions-section">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                  <History className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">Transaction History</h2>
                  <p className="text-sm text-muted-foreground">Your wallet activity</p>
                </div>
              </div>

              {loadingTransactions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : transactions.length === 0 ? (
                <div className="rounded-xl bg-muted/10 ring-1 ring-border p-8 text-center">
                  <div className="h-12 w-12 rounded-full bg-muted/10 flex items-center justify-center mx-auto mb-3">
                    <History className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground">No transactions yet</p>
                  <p className="text-sm text-muted-foreground/70">Add funds to get started</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {transactions
                    .slice(0, MAX_TRANSACTION_PAGES * ITEMS_PER_PAGE)
                    .slice((transactionsPage - 1) * ITEMS_PER_PAGE, transactionsPage * ITEMS_PER_PAGE)
                    .map((tx) => (
                    <div 
                      key={tx.id}
                      className="flex items-center justify-between p-4 rounded-xl bg-muted/10 ring-1 ring-border hover:bg-muted/20 transition-colors"
                      data-testid={`transaction-${tx.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                          tx.amountCents >= 0 
                            ? 'bg-green-500/10 text-green-500' 
                            : 'bg-red-500/10 text-red-500'
                        }`}>
                          {tx.amountCents >= 0 
                            ? <ArrowDownLeft className="h-5 w-5" />
                            : <ArrowUpRight className="h-5 w-5" />
                          }
                        </div>
                        <div>
                          <div className="font-medium text-foreground">
                            {formatTransactionType(tx.type, tx.metadata)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {formatDate(tx.createdAt)}
                          </div>
                        </div>
                      </div>
                      <span className={`font-mono text-lg font-medium ${
                        tx.amountCents >= 0 ? 'text-green-500' : 'text-red-400'
                      }`}>
                        {formatTransactionAmount(tx.amountCents)}
                      </span>
                    </div>
                  ))}
                  {/* Pagination Controls */}
                  {(() => {
                    const totalPages = Math.ceil(transactions.length / ITEMS_PER_PAGE);
                    const displayPages = Math.min(totalPages, MAX_TRANSACTION_PAGES);
                    const hasMorePages = totalPages > MAX_TRANSACTION_PAGES;
                    
                    return transactions.length > ITEMS_PER_PAGE && (
                      <div className="space-y-3 pt-4">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setTransactionsPage(p => Math.max(1, p - 1))}
                            disabled={transactionsPage === 1}
                            data-testid="transactions-prev-page"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          {Array.from({ length: displayPages }, (_, i) => i + 1).map(page => (
                            <Button
                              key={page}
                              variant={transactionsPage === page ? "default" : "outline"}
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setTransactionsPage(page)}
                              data-testid={`transactions-page-${page}`}
                            >
                              {page}
                            </Button>
                          ))}
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setTransactionsPage(p => Math.min(displayPages, p + 1))}
                            disabled={transactionsPage === displayPages}
                            data-testid="transactions-next-page"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                        {hasMorePages && (
                          <p className="text-center text-xs text-muted-foreground">
                            Showing recent transactions. Contact support for older transaction history.
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Invoices */}
            <div data-testid="invoices-section">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">Invoices</h2>
                  <p className="text-sm text-muted-foreground">Download your payment invoices</p>
                </div>
              </div>

              {loadingInvoices ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !invoicesData?.invoices || invoicesData.invoices.length === 0 ? (
                <div className="rounded-xl bg-muted/10 ring-1 ring-border p-8 text-center">
                  <div className="h-12 w-12 rounded-full bg-muted/10 flex items-center justify-center mx-auto mb-3">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground">No invoices yet</p>
                  <p className="text-sm text-muted-foreground/70">Invoices are generated when you add funds</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {invoicesData.invoices
                    .slice(0, MAX_INVOICE_PAGES * ITEMS_PER_PAGE)
                    .slice((invoicesPage - 1) * ITEMS_PER_PAGE, invoicesPage * ITEMS_PER_PAGE)
                    .map((invoice) => (
                    <div 
                      key={invoice.id}
                      className="flex items-center justify-between p-4 rounded-xl bg-muted/10 ring-1 ring-border hover:bg-muted/20 transition-colors"
                      data-testid={`invoice-${invoice.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{invoice.invoiceNumber}</div>
                          <div className="text-sm text-muted-foreground">
                            {formatDate(invoice.createdAt)} · {invoice.description}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-lg font-medium text-green-500">
                          ${(invoice.amountCents / 100).toFixed(2)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-primary hover:text-primary/80"
                          onClick={() => {
                            if (invoice.pdfUrl) {
                              window.open(invoice.pdfUrl, '_blank');
                            } else {
                              toast({
                                title: "Error",
                                description: "Invoice PDF not available",
                                variant: "destructive",
                              });
                            }
                          }}
                          disabled={!invoice.pdfUrl}
                          data-testid={`download-invoice-${invoice.id}`}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </Button>
                      </div>
                    </div>
                  ))}
                  {/* Pagination Controls */}
                  {(() => {
                    const totalPages = Math.ceil(invoicesData.invoices.length / ITEMS_PER_PAGE);
                    const displayPages = Math.min(totalPages, MAX_INVOICE_PAGES);
                    const hasMorePages = totalPages > MAX_INVOICE_PAGES;
                    
                    return invoicesData.invoices.length > ITEMS_PER_PAGE && (
                      <div className="space-y-3 pt-4">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setInvoicesPage(p => Math.max(1, p - 1))}
                            disabled={invoicesPage === 1}
                            data-testid="invoices-prev-page"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          {Array.from({ length: displayPages }, (_, i) => i + 1).map(page => (
                            <Button
                              key={page}
                              variant={invoicesPage === page ? "default" : "outline"}
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setInvoicesPage(page)}
                              data-testid={`invoices-page-${page}`}
                            >
                              {page}
                            </Button>
                          ))}
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setInvoicesPage(p => Math.min(displayPages, p + 1))}
                            disabled={invoicesPage === displayPages}
                            data-testid="invoices-next-page"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                        {hasMorePages && (
                          <p className="text-center text-xs text-muted-foreground">
                            Showing recent invoices. Contact support for older invoice history.
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Support */}
            <div className="rounded-xl bg-muted/10 ring-1 ring-border p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-foreground">Need Help?</h4>
                  <p className="text-sm text-muted-foreground">
                    Having issues with payments or your wallet balance?
                  </p>
                </div>
                <Button
                  variant="ghost"
                  className="text-primary hover:text-primary/80"
                  onClick={() => window.open('mailto:support@ozvps.au', '_blank')}
                  data-testid="button-contact-support"
                >
                  Contact Support
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
