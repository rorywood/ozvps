import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch, Link } from "wouter";
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
  Settings,
  Shield,
  Gift,
  Power
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
import { useTheme } from "@/components/theme-provider";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
  description?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface Invoice {
  id: number;
  invoiceNumber: string;
  amountCents: number;
  description: string;
  status: string;
  createdAt: string;
  pdfUrl?: string | null;
}

const TOPUP_AMOUNTS = [1000, 2000, 5000, 10000]; // In cents
const ITEMS_PER_PAGE = 10;
const MAX_TRANSACTION_PAGES = 5;
const MAX_INVOICE_PAGES = 5;

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

function getTransactionIcon(type: string, metadata?: any, amountCents?: number) {
  if (type === 'admin_adjustment' || type === 'adjustment_credit' || type === 'adjustment_debit') {
    return <Shield className="h-4 w-4" />;
  }
  if (type === 'credit') {
    if (metadata?.source === 'auto_topup') return <Zap className="h-4 w-4" />;
    return <ArrowDownLeft className="h-4 w-4" />;
  }
  if (type === 'refund') {
    return <ArrowDownLeft className="h-4 w-4" />;
  }
  return <ArrowUpRight className="h-4 w-4" />;
}

function getTransactionType(type: string, metadata?: any, amountCents?: number): string {
  if (type === 'admin_adjustment') {
    if (metadata?.action === 'admin_deployed_server') {
      return metadata?.freeServer ? 'Admin Deployed Server (Free)' : 'Admin Deployed Server';
    }
    return amountCents !== undefined && amountCents >= 0 ? 'Admin Credit' : 'Admin Debit';
  }
  if (type === 'adjustment_credit') {
    return metadata?.description || 'Credit Added';
  }
  if (type === 'adjustment_debit') {
    return metadata?.description || 'Balance Deducted';
  }
  if (type === 'credit') {
    if (metadata?.auto_topup) return 'Auto Top-Up';
    if (metadata?.source === 'auto_topup') return 'Auto Top-Up';
    return 'Wallet Top-Up';
  }
  if (type === 'debit') {
    if (metadata?.description) return metadata.description;
    return 'Debit';
  }
  if (type === 'refund') return 'Refund';
  if (type === 'auto_topup') return 'Auto Top-Up';
  return type.replace(/_/g, ' ');
}

function getTransactionColor(type: string, amountCents: number): { bg: string; text: string } {
  // Use amount sign to determine color - positive is green, negative is red
  if (amountCents >= 0) {
    return { bg: 'bg-success/10', text: 'text-success' };
  }
  return { bg: 'bg-destructive/10', text: 'text-destructive' };
}

// Card Form Component
function CardForm({ onSuccess, onCancel }: { onSuccess: () => void, onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { theme } = useTheme();

  // Determine if we're in light mode (theme can be 'light', 'dark', or 'system')
  const isLightMode = theme === 'light' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);

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

      // Validate payment method (checks for duplicates)
      const validation = await api.validatePaymentMethod(paymentMethod.id);

      if (!validation.valid) {
        if (validation.duplicate) {
          const cardInfo = validation.existingCard?.last4
            ? ` (****${validation.existingCard.last4})`
            : '';
          throw new Error(`This card${cardInfo} is already saved to your account`);
        }
        throw new Error(validation.error || "Failed to add payment method");
      }

      // If valid, the card is now attached to the customer
      toast({
        title: "Success",
        description: "Payment method added successfully",
      });
      onSuccess();
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
    <div className="space-y-4">
      {/* Card Entry Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-4 rounded-lg bg-card border border-border">
          <CardElement
            options={{
              hidePostalCode: true,
              style: {
                base: {
                  fontSize: '16px',
                  color: isLightMode ? '#1a1f2e' : '#ffffff',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  '::placeholder': {
                    color: isLightMode ? '#6b7280' : '#9ca3af',
                  },
                },
                invalid: {
                  color: '#ef4444',
                },
                complete: {
                  color: '#10b981',
                },
              },
            }}
          />
        </div>
        <div className="flex items-start gap-2 p-3 rounded-md bg-primary/5 border border-primary/20">
          <Shield className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your card information is securely processed and stored by Stripe. We never store your full card details on our servers.
          </p>
        </div>
        {error && (
          <p className="text-sm text-destructive">{error}</p>
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
    </div>
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
    <div className="border border-border rounded-lg p-6 bg-card">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-foreground mb-1">Auto Top-Up</h3>
          <p className="text-sm text-muted-foreground">Automatically add funds when balance is low</p>
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
            <Label htmlFor="threshold">
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
                className="pl-8 bg-card border-border"
                data-testid="input-auto-topup-threshold"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="amount">
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
                className="pl-8 bg-card border-border"
                data-testid="input-auto-topup-amount"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="payment-method">
              Payment method
            </Label>
            <Select
              value={localPaymentMethodId}
              onValueChange={(value) => {
                setLocalPaymentMethodId(value);
                setIsEditing(true);
              }}
            >
              <SelectTrigger className="mt-1.5 bg-card border-border" data-testid="select-auto-topup-payment-method">
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

  // Check for success/cancelled callback from Stripe checkout
  useEffect(() => {
    if (searchParams.includes('topup=success')) {
      // Store initial balance to detect when credit arrives
      let initialBalance: number | null = null;
      let creditDetected = false;

      setPaymentFeedback({
        type: 'success',
        message: 'Payment successful! Your wallet is being credited...',
      });

      // Aggressively refetch wallet data to show updated balance
      // Poll every 500ms for up to 30 seconds to catch the webhook update
      let pollCount = 0;
      const maxPolls = 60; // 30 seconds total
      const pollInterval = setInterval(async () => {
        pollCount++;
        const walletResult = await queryClient.fetchQuery({
          queryKey: ['wallet'],
          staleTime: 0,
        }) as { wallet: { balanceCents: number } } | undefined;

        const currentBalance = walletResult?.wallet?.balanceCents ?? 0;

        // Capture initial balance on first poll
        if (initialBalance === null) {
          initialBalance = currentBalance;
        }

        // Check if balance increased (credit arrived)
        if (currentBalance > initialBalance) {
          creditDetected = true;
          clearInterval(pollInterval);
          await queryClient.refetchQueries({ queryKey: ['transactions'] });
          setPaymentFeedback({
            type: 'success',
            message: 'Payment successful! Your wallet has been credited.',
          });
          setTimeout(() => navigate('/billing', { replace: true }), 2000);
          return;
        }

        if (pollCount >= maxPolls) {
          clearInterval(pollInterval);
          if (!creditDetected) {
            // Balance never increased - something went wrong
            setPaymentFeedback({
              type: 'error',
              message: 'Payment received but wallet credit is delayed. Please contact support if your balance doesn\'t update within a few minutes.',
            });
          }
          setTimeout(() => navigate('/billing', { replace: true }), 3000);
        }
      }, 500);

      return () => clearInterval(pollInterval);
    } else if (searchParams.includes('topup=cancelled')) {
      setPaymentFeedback({
        type: 'error',
        message: 'Payment was cancelled. No charges were made.',
      });
      setTimeout(() => {
        navigate('/billing', { replace: true });
      }, 3000);
    }
  }, [searchParams, navigate, queryClient]);

  const { data: walletData, isLoading: loadingWallet } = useQuery<{ wallet: Wallet }>({
    queryKey: ['wallet'],
    queryFn: () => api.getWallet(),
    refetchInterval: 30000, // 30 second refresh to reduce API load
    refetchOnWindowFocus: true,
    refetchOnMount: true,
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
    refetchInterval: 30000, // 30 second refresh to reduce API load
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const { data: invoicesData, isLoading: loadingInvoices } = useQuery<{ invoices: Invoice[] }>({
    queryKey: ['invoices'],
    queryFn: () => api.getInvoices(),
    enabled: stripeConfigured,
    refetchInterval: 30000, // 30 second refresh to reduce API load
    refetchOnWindowFocus: true,
    refetchOnMount: true,
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
    freeServer?: boolean;
    serverName?: string;
    serverUuid?: string;
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

  // State for reactivating servers
  const [reactivatingServerId, setReactivatingServerId] = useState<string | null>(null);

  const reactivateMutation = useMutation({
    mutationFn: (serverId: string) => api.reactivateServer(serverId),
    onSuccess: async (data) => {
      toast({
        title: "Server Reactivated",
        description: data.message || "Your server has been reactivated successfully!",
      });
      setReactivatingServerId(null);
      await queryClient.refetchQueries({ queryKey: ['wallet'] });
      await queryClient.refetchQueries({ queryKey: ['upcoming-charges'] });
    },
    onError: (error: any) => {
      toast({
        title: "Reactivation Failed",
        description: error.message || "Failed to reactivate server",
        variant: "destructive",
      });
      setReactivatingServerId(null);
    },
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

  const directChargeMutation = useMutation({
    mutationFn: ({ amountCents, paymentMethodId }: { amountCents: number; paymentMethodId: string }) =>
      api.directTopup(amountCents, paymentMethodId),
    onSuccess: async (data) => {
      if (data.success) {
        const chargedAmount = (data.chargedAmountCents || 0) / 100;
        setPaymentFeedback({
          type: 'success',
          message: `Payment Approved - $${chargedAmount.toFixed(2)} has been added to your wallet!`,
          amount: data.chargedAmountCents
        });
        // Immediately refetch to show updated balance
        await queryClient.refetchQueries({ queryKey: ['wallet'] });
        await queryClient.refetchQueries({ queryKey: ['transactions'] });
        await queryClient.refetchQueries({ queryKey: ['invoices'] });
        setTopupDialogOpen(false);
        setSelectedAmount(null);
        setCustomAmount("");
      }
    },
    onError: (error: any) => {
      console.error('[Direct Topup] Error:', error);
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

    // Use the same fallback logic as the Select component - if user hasn't explicitly
    // selected a payment method, default to the first available one
    const effectivePaymentMethodId = selectedPaymentMethodId || paymentMethods[0]?.id;

    if (paymentMethods.length > 0 && effectivePaymentMethodId) {
      directChargeMutation.mutate({ amountCents, paymentMethodId: effectivePaymentMethodId });
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
      <div className="max-w-6xl">
        <div className="mb-10">
          <h1 className="text-3xl font-display font-bold text-foreground tracking-tight" data-testid="text-page-title">
            Billing
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your wallet, payments, and server charges
          </p>
        </div>

        {!stripeConfigured ? (
          <div className="border border-border rounded-lg p-12 text-center bg-card">
            <div className="h-16 w-16 rounded-full bg-warning/10 flex items-center justify-center mx-auto mb-4">
              <CreditCard className="h-8 w-8 text-warning" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Payments Not Available</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              The payment system is being configured. Please contact support if you need to add funds to your account.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Payment Feedback Message */}
            {paymentFeedback && (
              <div
                className={`border rounded-lg p-4 flex items-center justify-between ${
                  paymentFeedback.type === 'success'
                    ? 'bg-success/5 border-success/20'
                    : 'bg-destructive/5 border-destructive/20'
                }`}
                data-testid={`payment-feedback-${paymentFeedback.type}`}
              >
                <div className="flex items-center gap-3">
                  {paymentFeedback.type === 'success' ? (
                    <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                  )}
                  <span className={`text-sm font-medium ${
                    paymentFeedback.type === 'success' ? 'text-success' : 'text-destructive'
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

            {/* Wallet Balance Card - Clean Modern Design */}
            <div className="border border-border rounded-xl p-8 bg-gradient-to-br from-card to-card/80" data-testid="wallet-section">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                <div className="flex items-center gap-5">
                  <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Wallet className="h-7 w-7 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Available Balance</p>
                    {loadingWallet ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : (
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-bold text-foreground tracking-tight" data-testid="text-balance">
                          {formatCurrency(wallet?.balanceCents || 0)}
                        </span>
                        <span className="text-base font-medium text-muted-foreground">AUD</span>
                      </div>
                    )}
                  </div>
                </div>

                <Dialog open={topupDialogOpen} onOpenChange={setTopupDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="lg" className="gap-2" data-testid="button-topup">
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
                          className="pl-8 bg-card border-border"
                          data-testid="input-custom-amount"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Minimum $5.00, maximum $500.00 AUD
                      </p>

                      {/* Payment Method Selection */}
                      {paymentMethods.length > 0 && (
                        <div className="pt-4 border-t border-border">
                          <Label className="mb-2 block">
                            Pay with saved card
                          </Label>
                          <Select
                            value={selectedPaymentMethodId || paymentMethods[0]?.id || ''}
                            onValueChange={(value) => setSelectedPaymentMethodId(value)}
                          >
                            <SelectTrigger className="w-full bg-card border-border" data-testid="select-payment-method">
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
                <div className="pt-8 mt-8 border-t border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase text-muted-foreground tracking-wide">Stripe Customer ID</span>
                    <div className="flex items-center gap-2">
                      <code
                        className="text-xs font-mono text-muted-foreground bg-muted/30 px-2 py-1 rounded"
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

            {/* Low-balance warning — shown when wallet can't cover upcoming chargeable servers */}
            {(() => {
              const chargeable = upcomingChargesData?.upcoming.filter(
                c => !c.freeServer && (c.status === 'active' || c.status === 'paid')
              ) ?? [];
              const totalUpcoming = chargeable.reduce((sum, c) => sum + c.monthlyPriceCents, 0);
              const balance = wallet?.balanceCents ?? 0;
              const shortfall = totalUpcoming - balance;
              if (!wallet || loadingWallet || loadingUpcomingCharges || shortfall <= 0) return null;
              let runningBalance = balance;
              const shortServers = chargeable.filter(c => {
                if (runningBalance >= c.monthlyPriceCents) {
                  runningBalance -= c.monthlyPriceCents;
                  return false;
                }
                return true;
              });
              return (
                <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
                  <AlertCircle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-warning">Insufficient wallet balance</p>
                    <p className="text-xs text-warning/80 mt-0.5">
                      Your balance ({formatCurrency(balance)}) is {formatCurrency(shortfall)} short of your total monthly charges ({formatCurrency(totalUpcoming)}).
                      {shortServers.length > 0 && ` ${shortServers.length} server${shortServers.length > 1 ? 's' : ''} may be suspended when payment is due.`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="flex-shrink-0 h-8 text-xs"
                    onClick={() => setTopupDialogOpen(true)}
                  >
                    Top Up
                  </Button>
                </div>
              );
            })()}

            {/* Tabbed Content - DO Style Underlined Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-4">
              <TabsList className="border-b border-border bg-transparent p-0 h-auto gap-6 justify-start w-full">
                <TabsTrigger
                  value="overview"
                  className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none pb-3 gap-2 text-muted-foreground data-[state=active]:text-foreground data-[state=active]:font-medium"
                >
                  <Wallet className="h-4 w-4" />
                  <span className="hidden sm:inline">Overview</span>
                </TabsTrigger>
                <TabsTrigger
                  value="servers"
                  className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none pb-3 gap-2 text-muted-foreground data-[state=active]:text-foreground data-[state=active]:font-medium"
                >
                  <Server className="h-4 w-4" />
                  <span className="hidden sm:inline">Servers</span>
                </TabsTrigger>
                <TabsTrigger
                  value="transactions"
                  className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none pb-3 gap-2 text-muted-foreground data-[state=active]:text-foreground data-[state=active]:font-medium"
                >
                  <History className="h-4 w-4" />
                  <span className="hidden sm:inline">Transactions</span>
                </TabsTrigger>
                <TabsTrigger
                  value="invoices"
                  className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none pb-3 gap-2 text-muted-foreground data-[state=active]:text-foreground data-[state=active]:font-medium"
                >
                  <Receipt className="h-4 w-4" />
                  <span className="hidden sm:inline">Invoices</span>
                </TabsTrigger>
                <TabsTrigger
                  value="settings"
                  className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none pb-3 gap-2 text-muted-foreground data-[state=active]:text-foreground data-[state=active]:font-medium"
                >
                  <Settings className="h-4 w-4" />
                  <span className="hidden sm:inline">Settings</span>
                </TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6 mt-8">
                <div>
                  <h2 className="text-lg font-semibold text-foreground mb-4">Payment Methods</h2>

                  <div data-testid="payment-methods-section">
                    {loadingPaymentMethods ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : paymentMethods.length === 0 ? (
                      <div className="border border-border rounded-lg p-8 text-center bg-card">
                        <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground mb-4">No payment methods saved</p>
                        <Dialog open={addCardDialogOpen} onOpenChange={setAddCardDialogOpen}>
                          <DialogTrigger asChild>
                            <Button variant="outline" className="gap-2 border-border">
                              <Plus className="h-4 w-4" />
                              Add Payment Method
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md bg-card border-border">
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
                            <DialogContent className="max-w-md bg-card border-border">
                              <DialogHeader>
                                <DialogTitle className="text-foreground">Add Payment Method</DialogTitle>
                                <DialogDescription className="text-muted-foreground">
                                  Add a new card to your account for faster top-ups.
                                </DialogDescription>
                              </DialogHeader>
                              {stripeLoadError ? (
                                <div className="py-8 text-center">
                                  <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-3" />
                                  <p className="text-destructive mb-4">{stripeLoadError}</p>
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
                        {/* Horizontal payment method rows like server list */}
                        <div className="border border-border rounded-lg overflow-hidden bg-card">
                          {paymentMethods.map((pm, index) => (
                            <div
                              key={pm.id}
                              className={cn(
                                "flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors",
                                index !== 0 && "border-t border-border"
                              )}
                              data-testid={`card-${pm.id}`}
                            >
                              <div className="flex items-center gap-3">
                                <CreditCard className="h-4 w-4 text-muted-foreground" />
                                <div>
                                  <div className="font-medium text-foreground text-sm">
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
                                onClick={() => deletePaymentMethodMutation.mutate(pm.id)}
                                className="text-muted-foreground hover:text-destructive h-8"
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
              <TabsContent value="servers" className="space-y-6 mt-8">
                {loadingUpcomingCharges ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : upcomingChargesData && upcomingChargesData.upcoming.length > 0 ? (
                  <div data-testid="upcoming-charges-section">
                    <h2 className="text-lg font-semibold text-foreground mb-2">Upcoming Server Charges</h2>
                    <p className="text-sm text-muted-foreground mb-4">
                      Monthly billing for your servers. Charges are automatically deducted from your wallet at 6pm AEST on the due date.
                    </p>

                    {/* Horizontal server charge rows */}
                    <div className="border border-border rounded-lg overflow-hidden bg-card">
                      {upcomingChargesData.upcoming.map((charge, index) => {
                          const nextBillDate = new Date(charge.nextBillAt);
                          const now = new Date();
                          // Use UTC for consistent day calculation (avoids DST/timezone issues)
                          const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
                          const billDateUTC = Date.UTC(nextBillDate.getFullYear(), nextBillDate.getMonth(), nextBillDate.getDate());
                          const daysUntilBill = Math.round((billDateUTC - todayUTC) / (1000 * 60 * 60 * 24));
                          const suspendDate = charge.suspendAt ? new Date(charge.suspendAt) : null;
                          const suspendDateUTC = suspendDate ? Date.UTC(suspendDate.getFullYear(), suspendDate.getMonth(), suspendDate.getDate()) : null;
                          const daysUntilSuspension = suspendDateUTC ? Math.round((suspendDateUTC - todayUTC) / (1000 * 60 * 60 * 24)) : null;

                          return (
                            <Link
                              key={charge.id}
                              href={`/servers/${charge.virtfusionServerId}`}
                              className={cn(
                                "flex items-center justify-between px-4 py-4 hover:bg-muted/30 transition-colors cursor-pointer",
                                index !== 0 && "border-t border-border"
                              )}
                              data-testid={`upcoming-charge-${charge.id}`}
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <Server className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="font-semibold text-foreground text-sm truncate">
                                      {charge.serverName || `Server #${charge.virtfusionServerId}`}
                                    </span>
                                    {charge.freeServer && (
                                      <Badge className="text-[10px] px-1.5 py-0 bg-purple-500/20 text-purple-500 border-purple-500/30">
                                        <Gift className="h-2.5 w-2.5 mr-1" />
                                        COMPLIMENTARY
                                      </Badge>
                                    )}
                                    {charge.status === 'suspended' && (
                                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                        SUSPENDED
                                      </Badge>
                                    )}
                                    {charge.status === 'unpaid' && !charge.freeServer && (
                                      <Badge variant="warning" className="text-[10px] px-1.5 py-0">
                                        UNPAID
                                      </Badge>
                                    )}
                                    {charge.status === 'active' && !charge.freeServer && (
                                      <Badge variant="success" className="text-[10px] px-1.5 py-0">
                                        ACTIVE
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {charge.freeServer ? (
                                      <span className="text-blue-400">
                                        Complimentary hosting - No payment required
                                      </span>
                                    ) : charge.status === 'unpaid' && daysUntilSuspension !== null ? (
                                      <span className="text-warning">
                                        Suspends in {daysUntilSuspension} day{daysUntilSuspension !== 1 ? 's' : ''} - {formatCurrency(charge.monthlyPriceCents)} required
                                      </span>
                                    ) : charge.status === 'suspended' ? (
                                      <span className="text-destructive">
                                        Suspended - {formatCurrency(charge.monthlyPriceCents)} required to reactivate
                                      </span>
                                    ) : daysUntilBill < 0 ? (
                                      <span className="text-red-400 font-medium">
                                        Overdue ({Math.abs(daysUntilBill)} day{Math.abs(daysUntilBill) !== 1 ? 's' : ''}) - Payment required immediately
                                      </span>
                                    ) : daysUntilBill === 0 ? (
                                      <span className="text-amber-500 font-medium">
                                        Due today - Wallet charged at 6pm AEST
                                      </span>
                                    ) : daysUntilBill === 1 ? (
                                      <span className="text-amber-500">
                                        Due tomorrow - Ensure your wallet has sufficient funds
                                      </span>
                                    ) : (
                                      <>
                                        Next: {formatDate(charge.nextBillAt)} ({daysUntilBill} days)
                                      </>
                                    )}
                                  </div>
                                  {charge.serverUuid && (
                                    <div className="text-[10px] text-muted-foreground/70 font-mono mt-0.5 truncate" title={charge.serverUuid}>
                                      UUID: {charge.serverUuid}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0 ml-4">
                                {charge.freeServer ? (
                                  <>
                                    <div className="font-mono text-base font-bold text-purple-400">
                                      Free
                                    </div>
                                    <div className="text-[10px] text-purple-400/70 uppercase tracking-wide">forever</div>
                                  </>
                                ) : (
                                  <>
                                    <div className="font-mono text-base font-bold text-foreground">
                                      {formatCurrency(charge.monthlyPriceCents)}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">per month</div>
                                  </>
                                )}
                              </div>
                              {/* Show reactivate button for suspended/unpaid servers */}
                              {(charge.status === 'suspended' || charge.status === 'unpaid') && !charge.freeServer ? (
                                <Button
                                  size="sm"
                                  variant={charge.status === 'suspended' ? 'destructive' : 'outline'}
                                  className={cn("ml-2 flex-shrink-0", charge.status === 'unpaid' && "border-warning text-warning hover:bg-warning/10")}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setReactivatingServerId(charge.virtfusionServerId);
                                    reactivateMutation.mutate(charge.virtfusionServerId);
                                  }}
                                  disabled={reactivateMutation.isPending && reactivatingServerId === charge.virtfusionServerId}
                                >
                                  {reactivateMutation.isPending && reactivatingServerId === charge.virtfusionServerId ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                  ) : (
                                    <Power className="h-4 w-4 mr-1" />
                                  )}
                                  {charge.status === 'suspended' ? 'Reactivate' : 'Pay Now'}
                                </Button>
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground ml-2 flex-shrink-0" />
                              )}
                            </Link>
                          );
                        })}
                    </div>
                  </div>
                ) : (
                  <div className="border border-border rounded-lg p-12 text-center bg-card">
                    <Server className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">No Active Servers</h3>
                    <p className="text-sm text-muted-foreground">
                      You don't have any active servers with recurring charges.
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* Transactions Tab */}
              <TabsContent value="transactions" className="space-y-6 mt-8">
                <div data-testid="transactions-section">
                  <h2 className="text-lg font-semibold text-foreground mb-4">Transaction History</h2>

                  {loadingTransactions ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : transactions.length === 0 ? (
                    <div className="border border-border rounded-lg p-12 text-center bg-card">
                      <History className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">No transactions yet</p>
                    </div>
                  ) : (
                    <>
                      {/* Horizontal transaction rows */}
                      <div className="border border-border rounded-lg overflow-hidden bg-card">
                        {paginatedTransactions.map((tx, index) => {
                          const colors = getTransactionColor(tx.type, tx.amountCents);
                          return (
                            <div
                              key={tx.id}
                              className={cn(
                                "flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors",
                                index !== 0 && "border-t border-border"
                              )}
                              data-testid={`transaction-${tx.id}`}
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${colors.bg}`}>
                                  <div className={colors.text}>
                                    {getTransactionIcon(tx.type, tx.metadata, tx.amountCents)}
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-foreground text-base">
                                    {getTransactionType(tx.type, tx.metadata, tx.amountCents)}
                                    {/* Show server name for debits */}
                                    {tx.type === 'debit' && tx.metadata && (tx.metadata as Record<string, string>).serverName && (
                                      <span className="text-muted-foreground font-normal"> · {(tx.metadata as Record<string, string>).serverName}</span>
                                    )}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {formatDate(tx.createdAt)}
                                    {tx.description && <> · {tx.description}</>}
                                    {/* Show reason for debits if available */}
                                    {tx.type === 'debit' && tx.metadata && (tx.metadata as Record<string, string>).reason && (
                                      <> · {(tx.metadata as Record<string, string>).reason}</>
                                    )}
                                    {/* Show details for credits - card info or reason */}
                                    {tx.type === 'credit' && tx.metadata && (
                                      <>
                                        {(tx.metadata as Record<string, string>).cardBrand && (tx.metadata as Record<string, string>).cardLast4 && (
                                          <> · {(tx.metadata as Record<string, string>).cardBrand} ****{(tx.metadata as Record<string, string>).cardLast4}</>
                                        )}
                                        {(tx.metadata as Record<string, string>).reason && (
                                          <> · {(tx.metadata as Record<string, string>).reason}</>
                                        )}
                                      </>
                                    )}
                                    {/* Show details for refunds */}
                                    {tx.type === 'refund' && tx.metadata && (tx.metadata as Record<string, string>).reason && (
                                      <> · {(tx.metadata as Record<string, string>).reason}</>
                                    )}
                                  </div>
                                  {/* Show admin reason for admin adjustments */}
                                  {tx.type === 'admin_adjustment' && tx.metadata && (tx.metadata as Record<string, any>).action === 'admin_deployed_server' ? (
                                    <div className="text-sm text-muted-foreground mt-0.5">
                                      <span className="text-primary">Server:</span> {(tx.metadata as Record<string, any>).hostname}
                                      {(tx.metadata as Record<string, any>).planName && (
                                        <> · {(tx.metadata as Record<string, any>).planName}</>
                                      )}
                                    </div>
                                  ) : tx.type === 'admin_adjustment' && tx.metadata && (tx.metadata as Record<string, string>).reason ? (
                                    <div className="text-sm text-muted-foreground mt-0.5">
                                      <span className="text-primary">Reason:</span> {(tx.metadata as Record<string, string>).reason}
                                    </div>
                                  ) : (tx.type === 'adjustment_credit' || tx.type === 'adjustment_debit') && tx.metadata ? (
                                    <div className="text-sm text-muted-foreground mt-0.5">
                                      {(tx.metadata as Record<string, string>).reason && (
                                        <span><span className="text-primary">Note:</span> {(tx.metadata as Record<string, string>).reason} · </span>
                                      )}
                                      <span className="text-primary">By:</span> OzVPS Admin
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                              <span className={`font-mono text-base font-semibold flex-shrink-0 ml-4 ${colors.text}`}>
                                {tx.amountCents >= 0 ? '+' : ''}{formatCurrency(tx.amountCents)}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {transactionsTotalPages > 1 && (
                        <div className="flex items-center justify-between pt-4">
                          <p className="text-sm text-muted-foreground">
                            Page {transactionsPage} of {transactionsTotalPages}
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

                      {/* Show support message when there's more data than displayed */}
                      {transactions.length > MAX_TRANSACTION_PAGES * ITEMS_PER_PAGE && (
                        <p className="text-xs text-muted-foreground text-center pt-4">
                          Showing recent transactions only. Contact <Link href="/support" className="text-primary hover:underline">support</Link> for older records.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </TabsContent>

              {/* Invoices Tab */}
              <TabsContent value="invoices" className="space-y-6 mt-8">
                <div data-testid="invoices-section">
                  <h2 className="text-lg font-semibold text-foreground mb-4">Invoices</h2>

                  {loadingInvoices ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : invoices.length === 0 ? (
                    <div className="border border-border rounded-lg p-12 text-center bg-card">
                      <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">No invoices yet</p>
                    </div>
                  ) : (
                    <>
                      {/* Horizontal invoice rows */}
                      <div className="border border-border rounded-lg overflow-hidden bg-card">
                        {paginatedInvoices.map((invoice, index) => (
                          <div
                            key={invoice.id}
                            className={cn(
                              "flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors",
                              index !== 0 && "border-t border-border"
                            )}
                            data-testid={`invoice-${invoice.id}`}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-foreground text-sm">{invoice.invoiceNumber}</div>
                                <div className="text-xs text-muted-foreground">
                                  {formatDate(invoice.createdAt)} · {invoice.description}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                              <span className="font-mono text-base font-semibold text-success">
                                ${(invoice.amountCents / 100).toFixed(2)}
                              </span>
                              {invoice.pdfUrl && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                  onClick={() => window.open(invoice.pdfUrl!, '_blank')}
                                  data-testid={`button-download-invoice-${invoice.id}`}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {invoicesTotalPages > 1 && (
                        <div className="flex items-center justify-between pt-4">
                          <p className="text-sm text-muted-foreground">
                            Page {invoicesPage} of {invoicesTotalPages}
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

                      {/* Show support message when there's more data than displayed */}
                      {invoices.length > MAX_INVOICE_PAGES * ITEMS_PER_PAGE && (
                        <p className="text-xs text-muted-foreground text-center pt-4">
                          Showing recent invoices only. Contact <Link href="/support" className="text-primary hover:underline">support</Link> for older records.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </TabsContent>

              {/* Settings Tab */}
              <TabsContent value="settings" className="space-y-6 mt-8">
                <div>
                  <h2 className="text-xl font-semibold text-foreground mb-4">Billing Settings</h2>
                  <AutoTopupSection paymentMethods={paymentMethods} />
                </div>
              </TabsContent>
            </Tabs>

            {/* Support Banner */}
            <div className="border border-border rounded-lg p-6 bg-card mt-4">
              <div className="flex items-start gap-4">
                <AlertCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground mb-1">Need help with billing?</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    If you have any questions about your wallet, transactions, or need assistance, our support team is here to help.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 border-border"
                    onClick={() => navigate('/support')}
                    data-testid="button-contact-support"
                  >
                    Contact Support
                    <ChevronRight className="h-4 w-4" />
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
