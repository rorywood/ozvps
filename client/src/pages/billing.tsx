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
  AlertCircle,
  Server,
  Receipt,
  Settings
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  stripeCustomerId: string | null;
  autoTopupEnabled: boolean;
  autoTopupThresholdCents: number;
  autoTopupAmountCents: number;
  autoTopupPaymentMethodId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

interface Transaction {
  id: number;
  type: string;
  amountCents: number;
  description: string | null;
  metadata: any;
  createdAt: string;
}

const TOPUP_AMOUNTS = [1000, 2000, 5000, 10000]; // In cents
const ITEMS_PER_PAGE = 10;
const MAX_TRANSACTION_PAGES = 20;
const MAX_INVOICE_PAGES = 20;

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatCardBrand(brand: string): string {
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

function getTransactionIcon(type: string, metadata?: any) {
  if (type === 'credit') {
    if (metadata?.source === 'auto_topup') return <Zap className="h-4 w-4" />;
    return <ArrowDownLeft className="h-4 w-4" />;
  }
  return <ArrowUpRight className="h-4 w-4" />;
}

function getTransactionType(type: string, metadata?: any): string {
  if (type === 'credit') {
    if (metadata?.auto_topup) return 'Auto Top-Up';
    if (metadata?.source === 'auto_topup') return 'Auto Top-Up';
    return 'Credit';
  }
  if (type === 'debit') return 'Debit';
  if (type === 'auto_topup') return 'Auto Top-Up';
  return type;
}

// Card Form Component
function CardForm({ onSuccess, onCancel }: { onSuccess: () => void, onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      setError("Stripe hasn't loaded yet. Please wait a moment and try again.");
      return;
    }

    const cardElement = elements.getElement(CardElement);

    if (!cardElement) {
      setError("Card information is missing.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { error: stripeError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      });

      if (stripeError) {
        throw new Error(stripeError.message);
      }

      if (!paymentMethod) {
        throw new Error("Failed to create payment method");
      }

      const response = await api.addPaymentMethod(paymentMethod.id);

      if (response.success) {
        toast({
          title: "Success",
          description: "Payment method added successfully",
        });
        onSuccess();
      } else {
        throw new Error("Failed to save payment method");
      }
    } catch (err: any) {
      setError(err.message || "Failed to add payment method");
      toast({
        title: "Error",
        description: err.message || "Failed to add payment method",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 rounded-lg bg-card/30 border border-border">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: 'hsl(var(--foreground))',
                '::placeholder': {
                  color: 'hsl(var(--muted-foreground))',
                },
              },
              invalid: {
                color: '#ef4444',
              },
            },
          }}
        />
      </div>
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="border-border"
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!stripe || isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Adding...
            </>
          ) : (
            'Add Card'
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

// Auto Top-Up Section Component
function AutoTopupSection({ paymentMethods }: { paymentMethods: PaymentMethod[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);

  const { data: walletData } = useQuery<{ wallet: Wallet }>({
    queryKey: ['wallet'],
    queryFn: () => api.getWallet(),
  });

  const wallet = walletData?.wallet;

  const [localEnabled, setLocalEnabled] = useState(wallet?.autoTopupEnabled ?? false);
  const [localThreshold, setLocalThreshold] = useState(String((wallet?.autoTopupThresholdCents ?? 0) / 100));
  const [localAmount, setLocalAmount] = useState(String((wallet?.autoTopupAmountCents ?? 0) / 100));
  const [localPaymentMethodId, setLocalPaymentMethodId] = useState(wallet?.autoTopupPaymentMethodId ?? '');

  useEffect(() => {
    if (wallet) {
      setLocalEnabled(wallet.autoTopupEnabled);
      setLocalThreshold(String(wallet.autoTopupThresholdCents / 100));
      setLocalAmount(String(wallet.autoTopupAmountCents / 100));
      setLocalPaymentMethodId(wallet.autoTopupPaymentMethodId || '');
    }
  }, [wallet]);

  const updateAutoTopupMutation = useMutation({
    mutationFn: (config: {
      enabled: boolean;
      thresholdCents: number;
      amountCents: number;
      paymentMethodId: string | null;
    }) => api.updateAutoTopup(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      setIsEditing(false);
      toast({
        title: "Success",
        description: "Auto top-up settings updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update auto top-up settings",
        variant: "destructive",
      });
    },
  });

  const handleToggle = (enabled: boolean) => {
    if (!enabled) {
      updateAutoTopupMutation.mutate({
        enabled: false,
        thresholdCents: wallet?.autoTopupThresholdCents ?? 0,
        amountCents: wallet?.autoTopupAmountCents ?? 0,
        paymentMethodId: wallet?.autoTopupPaymentMethodId ?? null,
      });
    } else {
      setLocalEnabled(true);
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    const thresholdCents = Math.round(parseFloat(localThreshold || '0') * 100);
    const amountCents = Math.round(parseFloat(localAmount || '0') * 100);

    if (localEnabled && (!localPaymentMethodId || thresholdCents <= 0 || amountCents <= 0)) {
      toast({
        title: "Validation Error",
        description: "Please fill in all fields with valid amounts",
        variant: "destructive",
      });
      return;
    }

    updateAutoTopupMutation.mutate({
      enabled: localEnabled,
      thresholdCents,
      amountCents,
      paymentMethodId: localPaymentMethodId || null,
    });
  };

  const handleCancel = () => {
    if (wallet) {
      setLocalEnabled(wallet.autoTopupEnabled);
      setLocalThreshold(String(wallet.autoTopupThresholdCents / 100));
      setLocalAmount(String(wallet.autoTopupAmountCents / 100));
      setLocalPaymentMethodId(wallet.autoTopupPaymentMethodId || '');
    }
    setIsEditing(false);
  };

  return (
    <div className="rounded-xl bg-muted/10 ring-1 ring-border p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-medium text-foreground">Auto Top-Up</h3>
            <p className="text-sm text-muted-foreground">Automatically add funds when balance is low</p>
          </div>
        </div>
        <Switch
          checked={localEnabled}
          onCheckedChange={handleToggle}
          disabled={updateAutoTopupMutation.isPending}
          data-testid="switch-auto-topup"
        />
      </div>

      {localEnabled && (
        <div className="space-y-4 mt-4 pt-4 border-t border-border">
          <div>
            <Label htmlFor="threshold" className="text-foreground">
              Trigger when balance falls below
            </Label>
            <div className="relative mt-1.5">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                id="threshold"
                type="text"
                inputMode="decimal"
                placeholder="10.00"
                value={localThreshold}
                onChange={(e) => {
                  setLocalThreshold(e.target.value);
                  setIsEditing(true);
                }}
                className="pl-8 bg-card/30 border-border"
                data-testid="input-auto-topup-threshold"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="amount" className="text-foreground">
              Amount to add
            </Label>
            <div className="relative mt-1.5">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                id="amount"
                type="text"
                inputMode="decimal"
                placeholder="20.00"
                value={localAmount}
                onChange={(e) => {
                  setLocalAmount(e.target.value);
                  setIsEditing(true);
                }}
                className="pl-8 bg-card/30 border-border"
                data-testid="input-auto-topup-amount"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="payment-method" className="text-foreground">
              Payment method
            </Label>
            <Select
              value={localPaymentMethodId}
              onValueChange={(value) => {
                setLocalPaymentMethodId(value);
                setIsEditing(true);
              }}
            >
              <SelectTrigger className="mt-1.5 bg-card/30 border-border" data-testid="select-auto-topup-payment-method">
                <SelectValue placeholder="Select a card" />
              </SelectTrigger>
              <SelectContent>
                {paymentMethods.map((pm) => (
                  <SelectItem key={pm.id} value={pm.id}>
                    {formatCardBrand(pm.brand)} •••• {pm.last4} (exp {pm.expMonth}/{pm.expYear})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isEditing && (
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                className="border-border"
                data-testid="button-cancel-auto-topup"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateAutoTopupMutation.isPending}
                data-testid="button-save-auto-topup"
              >
                {updateAutoTopupMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  useDocumentTitle("Billing");

  const [, navigate] = useLocation();
  const searchParams = useSearch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [topupDialogOpen, setTopupDialogOpen] = useState(false);
  const [addCardDialogOpen, setAddCardDialogOpen] = useState(false);
  const [showStripeId, setShowStripeId] = useState(false);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [invoicesPage, setInvoicesPage] = useState(1);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [stripeLoadError, setStripeLoadError] = useState<string | null>(null);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(null);
  const [paymentFeedback, setPaymentFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    amount?: number;
  } | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  // Check for success callback
  useEffect(() => {
    if (searchParams.includes('success=true')) {
      setPaymentFeedback({
        type: 'success',
        message: 'Payment successful! Your wallet has been credited.',
      });
      setTimeout(() => {
        navigate('/billing', { replace: true });
      }, 100);
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    }
  }, [searchParams, navigate, queryClient]);

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
    // Server billing is independent of Stripe, so always fetch
  });

  // Auto-select first payment method when payment methods are loaded
  useEffect(() => {
    if (paymentMethodsData?.paymentMethods && paymentMethodsData.paymentMethods.length > 0 && !selectedPaymentMethodId) {
      setSelectedPaymentMethodId(paymentMethodsData.paymentMethods[0].id);
    }
  }, [paymentMethodsData, selectedPaymentMethodId]);

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
        setTopupDialogOpen(false);
        setSelectedAmount(null);
        setCustomAmount("");
      }
    },
    onError: (error: any) => {
      setPaymentFeedback({
        type: 'error',
        message: error.message || "Payment failed. Please try again or contact support.",
      });
    },
  });

  const deletePaymentMethodMutation = useMutation({
    mutationFn: (paymentMethodId: string) => api.deletePaymentMethod(paymentMethodId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
      toast({
        title: "Success",
        description: "Payment method removed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove payment method",
        variant: "destructive",
      });
    },
  });

  // Load Stripe when dialog opens
  useEffect(() => {
    if (addCardDialogOpen && !stripePromise && !stripeLoadError) {
      const initStripe = async () => {
        try {
          const status = await api.getStripeStatus();
          if (!status.configured || !status.publishableKey) {
            throw new Error("Stripe is not configured on the server");
          }
          const promise = loadStripe(status.publishableKey);
          setStripePromise(promise);
        } catch (error: any) {
          setStripeLoadError(error.message || "Failed to load payment form. Please try again later.");
        }
      };
      initStripe();
    }
  }, [addCardDialogOpen, stripePromise, stripeLoadError]);

  const wallet = walletData?.wallet;
  const paymentMethods = paymentMethodsData?.paymentMethods || [];
  const transactions = transactionsData?.transactions || [];
  const invoices = invoicesData?.invoices || [];

  const handlePresetSelect = (amount: number) => {
    setSelectedAmount(amount);
    setCustomAmount("");
  };

  const handleCustomAmountChange = (value: string) => {
    setCustomAmount(value);
    setSelectedAmount(null);
  };

  const getValidAmount = (): number | null => {
    if (selectedAmount !== null) return selectedAmount;
    const parsed = parseFloat(customAmount);
    if (!isNaN(parsed) && parsed >= 5 && parsed <= 500) {
      return Math.round(parsed * 100);
    }
    return null;
  };

  const handleTopup = () => {
    const amountCents = getValidAmount();
    if (amountCents === null) return;

    if (paymentMethods.length > 0 && selectedPaymentMethodId) {
      directChargeMutation.mutate({ amountCents, paymentMethodId: selectedPaymentMethodId });
    } else {
      topupMutation.mutate(amountCents);
    }
  };

  const paginatedTransactions = transactions.slice(
    (transactionsPage - 1) * ITEMS_PER_PAGE,
    transactionsPage * ITEMS_PER_PAGE
  );

  const transactionsTotalPages = Math.min(
    MAX_TRANSACTION_PAGES,
    Math.ceil(transactions.length / ITEMS_PER_PAGE)
  );

  const paginatedInvoices = invoices.slice(
    (invoicesPage - 1) * ITEMS_PER_PAGE,
    invoicesPage * ITEMS_PER_PAGE
  );

  const invoicesTotalPages = Math.min(
    MAX_INVOICE_PAGES,
    Math.ceil(invoices.length / ITEMS_PER_PAGE)
  );

  return (
    <AppShell>
      <div className="space-y-6 max-w-6xl">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-page-title">
            Billing
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your wallet, payments, and server charges
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

            {/* Tabbed Content */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
                <TabsTrigger value="overview" className="gap-2">
                  <Wallet className="h-4 w-4" />
                  <span className="hidden sm:inline">Overview</span>
                </TabsTrigger>
                <TabsTrigger value="servers" className="gap-2">
                  <Server className="h-4 w-4" />
                  <span className="hidden sm:inline">Servers</span>
                </TabsTrigger>
                <TabsTrigger value="transactions" className="gap-2">
                  <History className="h-4 w-4" />
                  <span className="hidden sm:inline">Transactions</span>
                </TabsTrigger>
                <TabsTrigger value="invoices" className="gap-2">
                  <Receipt className="h-4 w-4" />
                  <span className="hidden sm:inline">Invoices</span>
                </TabsTrigger>
                <TabsTrigger value="settings" className="gap-2">
                  <Settings className="h-4 w-4" />
                  <span className="hidden sm:inline">Settings</span>
                </TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6 mt-6">
                <div>
                  <h2 className="text-xl font-semibold text-foreground mb-4">Payment Methods</h2>

                  <div data-testid="payment-methods-section">
                    {loadingPaymentMethods ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : paymentMethods.length === 0 ? (
                      <div className="rounded-xl bg-muted/10 ring-1 ring-border p-8 text-center">
                        <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground mb-4">No payment methods saved</p>
                        <Dialog open={addCardDialogOpen} onOpenChange={setAddCardDialogOpen}>
                          <DialogTrigger asChild>
                            <Button variant="outline" className="gap-2 border-border">
                              <Plus className="h-4 w-4" />
                              Add Payment Method
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
                                <CardForm
                                  onSuccess={() => {
                                    queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
                                    setAddCardDialogOpen(false);
                                    setStripePromise(null);
                                  }}
                                  onCancel={() => {
                                    setAddCardDialogOpen(false);
                                    setStripePromise(null);
                                  }}
                                />
                              </Elements>
                            ) : (
                              <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                              </div>
                            )}
                          </DialogContent>
                        </Dialog>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-end mb-4">
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
                                  <CardForm
                                    onSuccess={() => {
                                      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
                                      setAddCardDialogOpen(false);
                                      setStripePromise(null);
                                    }}
                                    onCancel={() => {
                                      setAddCardDialogOpen(false);
                                      setStripePromise(null);
                                    }}
                                  />
                                </Elements>
                              ) : (
                                <div className="flex items-center justify-center py-8">
                                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                </div>
                              )}
                            </DialogContent>
                          </Dialog>
                        </div>
                        <div className="grid gap-3">
                          {paymentMethods.map((pm) => (
                            <div
                              key={pm.id}
                              className="flex items-center justify-between p-4 rounded-xl bg-muted/10 ring-1 ring-border hover:bg-muted/20 transition-colors"
                              data-testid={`card-${pm.id}`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                                  <CreditCard className="h-5 w-5 text-blue-500" />
                                </div>
                                <div>
                                  <div className="font-medium text-foreground">
                                    {formatCardBrand(pm.brand)} •••• {pm.last4}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    Expires {pm.expMonth}/{pm.expYear}
                                  </div>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deletePaymentMethodMutation.mutate(pm.id)}
                                className="text-muted-foreground hover:text-red-500"
                                data-testid={`button-delete-card-${pm.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* Server Charges Tab */}
              <TabsContent value="servers" className="space-y-6 mt-6">
                {upcomingChargesData && upcomingChargesData.upcoming.length > 0 ? (
                  <div data-testid="upcoming-charges-section">
                    <h2 className="text-xl font-semibold text-foreground mb-4">Upcoming Server Charges</h2>
                    <p className="text-sm text-muted-foreground mb-4">
                      Monthly billing for your servers. Charges are automatically deducted from your wallet balance.
                    </p>

                    {loadingUpcomingCharges ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="space-y-3">
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
                                    <Server className="h-5 w-5" />
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
                ) : (
                  <div className="rounded-xl bg-muted/10 ring-1 ring-border p-12 text-center">
                    <Server className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <h3 className="text-lg font-medium text-foreground mb-2">No Active Servers</h3>
                    <p className="text-muted-foreground">
                      You don't have any active servers with recurring charges.
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* Transactions Tab */}
              <TabsContent value="transactions" className="space-y-6 mt-6">
                <div data-testid="transactions-section">
                  <h2 className="text-xl font-semibold text-foreground mb-4">Transaction History</h2>

                  {loadingTransactions ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : transactions.length === 0 ? (
                    <div className="rounded-xl bg-muted/10 ring-1 ring-border p-12 text-center">
                      <History className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground">No transactions yet</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {paginatedTransactions.map((tx) => (
                          <div
                            key={tx.id}
                            className="p-4 rounded-xl bg-muted/10 ring-1 ring-border hover:bg-muted/20 transition-colors"
                            data-testid={`transaction-${tx.id}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                                  tx.type === 'credit' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'
                                }`}>
                                  {getTransactionIcon(tx.type, tx.metadata)}
                                </div>
                                <div>
                                  <div className="font-medium text-foreground">
                                    {getTransactionType(tx.type, tx.metadata)}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {formatDate(tx.createdAt)}
                                    {tx.description && <> · {tx.description}</>}
                                  </div>
                                </div>
                              </div>
                              <span className={`font-mono text-lg font-medium ${
                                tx.type === 'credit' ? 'text-green-500' : 'text-red-500'
                              }`}>
                                {tx.type === 'credit' ? '+' : '-'}{formatCurrency(Math.abs(tx.amountCents))}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {transactionsTotalPages > 1 && (
                        <div className="flex items-center justify-between pt-4">
                          <p className="text-sm text-muted-foreground">
                            Page {transactionsPage} of {transactionsTotalPages}
                            {transactions.length > MAX_TRANSACTION_PAGES * ITEMS_PER_PAGE && (
                              <span className="text-yellow-400 ml-2">
                                (Showing first {MAX_TRANSACTION_PAGES} pages)
                              </span>
                            )}
                          </p>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setTransactionsPage(p => Math.max(1, p - 1))}
                              disabled={transactionsPage === 1}
                              className="border-border"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setTransactionsPage(p => Math.min(transactionsTotalPages, p + 1))}
                              disabled={transactionsPage >= transactionsTotalPages}
                              className="border-border"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </TabsContent>

              {/* Invoices Tab */}
              <TabsContent value="invoices" className="space-y-6 mt-6">
                <div data-testid="invoices-section">
                  <h2 className="text-xl font-semibold text-foreground mb-4">Invoices</h2>

                  {loadingInvoices ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : invoices.length === 0 ? (
                    <div className="rounded-xl bg-muted/10 ring-1 ring-border p-12 text-center">
                      <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground">No invoices yet</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {paginatedInvoices.map((invoice) => (
                          <div
                            key={invoice.id}
                            className="p-4 rounded-xl bg-muted/10 ring-1 ring-border hover:bg-muted/20 transition-colors"
                            data-testid={`invoice-${invoice.id}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500">
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
                                {invoice.pdfUrl && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="gap-2 text-muted-foreground hover:text-foreground"
                                    onClick={() => window.open(invoice.pdfUrl!, '_blank')}
                                    data-testid={`button-download-invoice-${invoice.id}`}
                                  >
                                    <Download className="h-4 w-4" />
                                    <span className="hidden sm:inline">PDF</span>
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {invoicesTotalPages > 1 && (
                        <div className="flex items-center justify-between pt-4">
                          <p className="text-sm text-muted-foreground">
                            Page {invoicesPage} of {invoicesTotalPages}
                            {invoices.length > MAX_INVOICE_PAGES * ITEMS_PER_PAGE && (
                              <span className="text-yellow-400 ml-2">
                                (Showing first {MAX_INVOICE_PAGES} pages)
                              </span>
                            )}
                          </p>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setInvoicesPage(p => Math.max(1, p - 1))}
                              disabled={invoicesPage === 1}
                              className="border-border"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setInvoicesPage(p => Math.min(invoicesTotalPages, p + 1))}
                              disabled={invoicesPage >= invoicesTotalPages}
                              className="border-border"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </TabsContent>

              {/* Settings Tab */}
              <TabsContent value="settings" className="space-y-6 mt-6">
                <div>
                  <h2 className="text-xl font-semibold text-foreground mb-4">Billing Settings</h2>
                  <AutoTopupSection paymentMethods={paymentMethods} />
                </div>
              </TabsContent>
            </Tabs>

            {/* Support Banner */}
            <div className="rounded-xl bg-muted/10 ring-1 ring-border p-6">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-foreground mb-1">Need help with billing?</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    If you have any questions about your wallet, transactions, or need assistance, our support team is here to help.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 border-border text-primary hover:text-primary/80"
                    onClick={() => window.open('mailto:support@ozvps.au', '_blank')}
                    data-testid="button-contact-support"
                  >
                    Contact Support
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
