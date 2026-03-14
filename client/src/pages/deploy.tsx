import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AppShell } from "@/components/layout/app-shell";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useToast } from "@/hooks/use-toast";
import {
  Check,
  Loader2,
  Zap,
  Server,
  MapPin,
  HardDrive,
  ChevronRight,
  AlertCircle,
  Mail,
  Wallet,
  HelpCircle,
  Tag,
  X
} from "lucide-react";
import { api } from "@/lib/api";
import { useProvisionTracker } from "@/contexts/provision-tracker";
import { getOsLogoUrl, FALLBACK_LOGO } from "@/lib/os-logos";
import { cn } from "@/lib/utils";
import flagAU from "@/assets/flag-au.png";

interface Plan {
  id: number;
  code: string;
  name: string;
  vcpu: number;
  ramMb: number;
  storageGb: number;
  transferGb: number;
  priceMonthly: number;
  active: boolean;
  popular?: boolean;
}

interface Location {
  code: string;
  name: string;
  country: string;
  countryCode: string;
  enabled: boolean;
}

interface Wallet {
  id: number;
  auth0UserId: string;
  balanceCents: number;
}

interface OsTemplate {
  id: number;
  name: string;
  version?: string;
  description?: string;
}

interface TemplateGroup {
  name: string;
  templates: OsTemplate[];
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatRAM(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB`;
  }
  return `${mb} MB`;
}

function formatTransfer(gb: number): string {
  if (gb >= 1000) {
    return `${(gb / 1000).toFixed(0)} TB`;
  }
  return `${gb} GB`;
}

export default function DeployPage() {
  useDocumentTitle('Deploy Server');
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { startProvision } = useProvisionTracker();

  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [selectedLocationCode, setSelectedLocationCode] = useState<string>("");
  const [selectedOsId, setSelectedOsId] = useState<number | null>(null);
  const [hostname, setHostname] = useState("");
  const [hostnameError, setHostnameError] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [promoValidation, setPromoValidation] = useState<{
    valid: boolean;
    error?: string;
    code?: string;
    discountType?: 'percentage' | 'fixed';
    discountValue?: number;
    discountCents?: number;
    originalPriceCents?: number;
    finalPriceCents?: number;
  } | null>(null);
  const [validatingPromo, setValidatingPromo] = useState(false);

  // Check email verification status
  const { data: authData, isLoading: authLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.getMe(),
  });

  // Resend verification email mutation
  const resendMutation = useMutation({
    mutationFn: async () => {
      const csrfToken = document.cookie.split('; ').find(c => c.startsWith('ozvps_csrf='))?.split('=')[1] || '';

      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send verification email');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Verification email sent!', description: 'Please check your inbox and spam folder.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const { data: plansData, isLoading: loadingPlans } = useQuery<{ plans: Plan[] }>({
    queryKey: ['plans'],
    queryFn: () => api.getPlans(),
    refetchInterval: 30000, // Auto-refresh every 30 seconds to catch plan availability changes
  });

  const { data: locationsData } = useQuery<{ locations: Location[] }>({
    queryKey: ['locations'],
    queryFn: () => api.getLocations(),
  });

  const { data: templatesData, isLoading: loadingTemplates } = useQuery<TemplateGroup[]>({
    queryKey: ['plan-templates', selectedPlanId],
    queryFn: () => api.getPlanTemplates(selectedPlanId!),
    enabled: !!selectedPlanId && selectedPlanId > 0,
  });

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

  // Clear promo validation when plan changes — discount was calculated for the previous plan's price
  useEffect(() => {
    setPromoCode("");
    setPromoValidation(null);
  }, [selectedPlanId]);

  const handleApplyPromoCode = async () => {
    if (!promoCodeInput.trim() || !selectedPlanId) return;

    setValidatingPromo(true);
    try {
      const result = await api.validatePromoCode(promoCodeInput.trim().toUpperCase(), selectedPlanId);
      setPromoValidation(result);
      if (result.valid) {
        setPromoCode(promoCodeInput.trim().toUpperCase());
        toast({
          title: "Promo code applied!",
          description: `You save ${formatCurrency(result.discountCents || 0)}`,
        });
      } else {
        toast({
          title: "Invalid promo code",
          description: result.error || "This promo code cannot be applied",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to validate promo code. Please try again.",
        variant: "destructive",
      });
    } finally {
      setValidatingPromo(false);
    }
  };

  const handleRemovePromoCode = () => {
    setPromoCode("");
    setPromoCodeInput("");
    setPromoValidation(null);
  };

  const deployMutation = useMutation({
    mutationFn: (data: { planId: number; osId: number; hostname: string; locationCode: string; promoCode?: string }) =>
      api.deployServer(data),
    onSuccess: (data: { orderId: number; serverId: number }, variables) => {
      toast({
        title: "Server deployed!",
        description: "Your new VPS is being provisioned.",
      });
      // Start global provision tracker so progress persists across navigation
      startProvision(data.serverId, variables.hostname);
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      setLocation(`/servers/${data.serverId}`);
    },
    onError: (error: any) => {
      const errorMessage = error.message || "Unable to deploy server. Please try again.";
      toast({
        title: "Deployment Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const plans = plansData?.plans || [];
  const locations = locationsData?.locations || [];
  const wallet = walletData?.wallet;
  const selectedPlan = plans.find(p => p.id === selectedPlanId);
  const selectedLocation = locations.find(l => l.code === selectedLocationCode);
  const templates = templatesData || [];
  const finalPrice = promoValidation?.valid && promoValidation.finalPriceCents !== undefined
    ? promoValidation.finalPriceCents
    : (selectedPlan?.priceMonthly || 0);
  const canAfford = wallet && selectedPlan && wallet.balanceCents >= finalPrice;

  // Check if all plans are out of stock (using strict equality for reliability)
  const allPlansOutOfStock = plans.length > 0 && plans.every(p => p.active === false);

  const validateHostname = (value: string): boolean => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length === 0) {
      setHostnameError("Hostname is required");
      return false;
    }
    if (trimmed.length > 253) {
      setHostnameError("Hostname must be 253 characters or less");
      return false;
    }
    const labels = trimmed.split('.');
    for (const label of labels) {
      if (label.length === 0) {
        setHostnameError("Hostname cannot have empty labels");
        return false;
      }
      if (label.length > 63) {
        setHostnameError("Each part must be 63 characters or less");
        return false;
      }
      if (label.length === 1 && !/^[a-zA-Z0-9]$/.test(label)) {
        setHostnameError("Single character parts must be a letter or number");
        return false;
      }
      if (label.length > 1 && !/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label)) {
        setHostnameError("Each part must start and end with a letter or number");
        return false;
      }
    }
    setHostnameError("");
    return true;
  };

  const handleHostnameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setHostname(value);
    if (value.trim()) {
      validateHostname(value);
    } else {
      setHostnameError("");
    }
  };

  const handleDeploy = () => {
    if (!selectedPlan || !selectedOsId || !selectedLocationCode) return;
    if (!validateHostname(hostname)) return;

    deployMutation.mutate({
      planId: selectedPlan.id,
      osId: selectedOsId,
      hostname: hostname.trim().toLowerCase(),
      locationCode: selectedLocationCode,
      promoCode: promoCode || undefined,
    });
  };

  // Determine current step for progress indicator
  // Order: Plan → Region → Hostname → OS
  const currentStep = !selectedPlanId ? 1 : !selectedLocationCode ? 2 : !hostname ? 3 : !selectedOsId ? 4 : 5;
  const selectedOs = templates.flatMap(g => g.templates).find(t => t.id === selectedOsId);

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  // Check if account is suspended - show suspension message instead of deploy UI
  const isAccountSuspended = authData?.accountSuspended || authData?.user?.accountSuspended;
  const suspendedReason = authData?.accountSuspendedReason || authData?.user?.accountSuspendedReason;

  if (authData && isAccountSuspended) {
    return (
      <AppShell>
        <div className="max-w-3xl mx-auto py-12">
          <div className="bg-destructive/10 border-l-4 border-l-destructive rounded-lg p-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="h-6 w-6 text-destructive flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h2 className="text-xl font-bold text-foreground mb-2">
                  Account Suspended
                </h2>
                <p className="text-muted-foreground mb-4">
                  Your account has been suspended and you cannot deploy new servers at this time.
                </p>
                {suspendedReason && (
                  <div className="bg-destructive/10 rounded p-3 mb-4">
                    <p className="text-xs uppercase text-muted-foreground mb-1">Reason:</p>
                    <p className="text-sm text-foreground">{suspendedReason}</p>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  Please contact support if you believe this is an error or to discuss reactivating your account.
                </p>
                <div className="mt-6">
                  <Button variant="outline" asChild>
                    <Link href="/support">Contact Support</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // If email is not verified, show only the verification message
  // Handle both data structures: { emailVerified, email } or { user: { emailVerified, email } }
  const isEmailVerified = authData?.emailVerified || authData?.user?.emailVerified;
  const userEmail = authData?.email || authData?.user?.email;

  if (authData && !isEmailVerified) {
    return (
      <AppShell>
        <div className="max-w-3xl mx-auto py-12">
          <div className="bg-warning/10 border-l-4 border-l-warning rounded-lg p-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="h-6 w-6 text-warning flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h2 className="text-xl font-bold text-foreground mb-2">
                  Email Verification Required
                </h2>
                <p className="text-muted-foreground mb-4">
                  You need to verify your email address before you can deploy servers.
                  We've sent a verification link to <span className="font-medium text-foreground">{userEmail}</span>.
                </p>
                <p className="text-sm text-muted-foreground mb-6">
                  Please check your inbox and spam folder for the verification email. If you haven't received it, you can request a new one.
                </p>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={() => resendMutation.mutate()}
                    disabled={resendMutation.isPending || resendMutation.isSuccess}
                    className="border-warning/50 text-warning hover:bg-warning/20"
                  >
                    {resendMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : resendMutation.isSuccess ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Email Sent
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4 mr-2" />
                        Resend Verification Email
                      </>
                    )}
                  </Button>
                  <Button asChild variant="ghost">
                    <Link href="/dashboard">
                      Go to Dashboard
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <TooltipProvider>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">
            Deploy New Server
          </h1>
          <p className="text-muted-foreground mt-1">
            Choose your configuration and deploy in seconds
          </p>
        </div>

        {/* Step Progress */}
        <div className="mb-8 flex items-center gap-2">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
            currentStep >= 1 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          )}>
            <div className={cn(
              "flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold",
              selectedPlanId ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"
            )}>
              {selectedPlanId ? <Check className="h-3 w-3" /> : "1"}
            </div>
            <span>Plan</span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
            currentStep >= 2 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          )}>
            <div className={cn(
              "flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold",
              selectedLocationCode ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"
            )}>
              {selectedLocationCode ? <Check className="h-3 w-3" /> : "2"}
            </div>
            <span>Region</span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
            currentStep >= 3 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          )}>
            <div className={cn(
              "flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold",
              hostname ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"
            )}>
              {hostname ? <Check className="h-3 w-3" /> : "3"}
            </div>
            <span>Hostname</span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
            currentStep >= 4 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          )}>
            <div className={cn(
              "flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold",
              selectedOsId ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"
            )}>
              {selectedOsId ? <Check className="h-3 w-3" /> : "4"}
            </div>
            <span>OS</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">

            {/* Step 1: Choose Plan */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Server className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Choose a Plan</h2>
              </div>

              {loadingPlans ? (
                <div className="flex items-center justify-center py-12 border border-border rounded-lg bg-card">
                  <Loader2 className="h-6 w-6 text-primary animate-spin" />
                </div>
              ) : allPlansOutOfStock ? (
                <div className="border border-border rounded-lg p-6 bg-card">
                  <div className="flex items-start gap-4">
                    <AlertCircle className="h-6 w-6 text-warning flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-foreground mb-3">
                        Service Plans Unavailable
                      </h3>
                      <p className="text-muted-foreground mb-4 leading-relaxed">
                        New service plans are temporarily unavailable as we expand capacity to meet demand. Existing deployments remain fully operational and unaffected. We appreciate your patience and will update this page when availability resumes.
                      </p>
                      <Link href="/support">
                        <Button variant="outline" className="border-warning/50 text-warning hover:bg-warning/20">
                          Open a Support Ticket
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {plans.map((plan) => {
                    const isSelected = selectedPlanId === plan.id;
                    const isPopular = plan.popular;
                    const isOutOfStock = !plan.active;

                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => !isOutOfStock && setSelectedPlanId(plan.id)}
                        disabled={isOutOfStock}
                        className={cn(
                          "relative p-4 rounded-lg border text-left transition-all",
                          isOutOfStock
                            ? "opacity-60 cursor-not-allowed bg-muted/30 border-border"
                            : isSelected
                              ? "bg-primary/5 border-primary shadow-sm"
                              : "bg-card border-border hover:border-primary/50"
                        )}
                        data-testid={`card-plan-${plan.code}`}
                      >
                        {isPopular && !isOutOfStock && (
                          <div className="mb-2">
                            <span className="inline-block px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-primary text-primary-foreground rounded">
                              Popular
                            </span>
                          </div>
                        )}

                        {isOutOfStock && (
                          <div className="mb-2">
                            <span className="inline-block px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-muted-foreground/20 text-muted-foreground rounded">
                              Out of Stock
                            </span>
                          </div>
                        )}

                        {isSelected && !isOutOfStock && (
                          <div className="absolute top-3 right-3">
                            <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                              <Check className="h-3 w-3 text-primary-foreground" />
                            </div>
                          </div>
                        )}

                        <div className="mb-3">
                          <h3 className={cn("text-base font-semibold", isOutOfStock ? "text-muted-foreground" : "text-foreground")}>{plan.name}</h3>
                          <div className="flex items-baseline gap-1 mt-1">
                            <span className={cn("text-3xl font-bold tracking-tight", isOutOfStock ? "text-muted-foreground" : "text-foreground")}>
                              ${(plan.priceMonthly / 100).toFixed(0)}
                            </span>
                            <span className="text-sm text-muted-foreground">/mo</span>
                          </div>
                        </div>

                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-muted-foreground flex items-center gap-1">
                                  vCPU <HelpCircle className="h-3 w-3" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Virtual CPU cores for processing power</p>
                              </TooltipContent>
                            </Tooltip>
                            <span className={cn("font-medium", isOutOfStock ? "text-muted-foreground" : "text-foreground")}>{plan.vcpu}</span>
                          </div>
                          <div className="flex justify-between">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-muted-foreground flex items-center gap-1">
                                  RAM <HelpCircle className="h-3 w-3" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Memory for running applications and processes</p>
                              </TooltipContent>
                            </Tooltip>
                            <span className={cn("font-medium", isOutOfStock ? "text-muted-foreground" : "text-foreground")}>{formatRAM(plan.ramMb)}</span>
                          </div>
                          <div className="flex justify-between">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-muted-foreground flex items-center gap-1">
                                  Storage <HelpCircle className="h-3 w-3" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Fast disk space for your files and databases</p>
                              </TooltipContent>
                            </Tooltip>
                            <span className={cn("font-medium", isOutOfStock ? "text-muted-foreground" : "text-foreground")}>{plan.storageGb} GB</span>
                          </div>
                          <div className="flex justify-between">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-muted-foreground flex items-center gap-1">
                                  Transfer <HelpCircle className="h-3 w-3" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Monthly bandwidth allowance for incoming and outgoing traffic</p>
                              </TooltipContent>
                            </Tooltip>
                            <span className={cn("font-medium", isOutOfStock ? "text-muted-foreground" : "text-foreground")}>{formatTransfer(plan.transferGb)}</span>
                          </div>
                          <div className="flex justify-between">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-muted-foreground flex items-center gap-1">
                                  Network Speed <HelpCircle className="h-3 w-3" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Maximum inbound and outbound network speed</p>
                              </TooltipContent>
                            </Tooltip>
                            <span className={cn("font-medium", isOutOfStock ? "text-muted-foreground" : "text-foreground")}>500 Mbps</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Step 2: Choose Region - Only show after plan is selected */}
            {selectedPlanId && (
              <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold text-foreground">Choose a Region</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {locations.map((location) => (
                    <button
                      key={location.code}
                      type="button"
                      disabled={!location.enabled}
                      onClick={() => location.enabled && setSelectedLocationCode(location.code)}
                      className={cn(
                        "flex items-center gap-3 p-4 rounded-lg border transition-all",
                        !location.enabled
                          ? "opacity-50 cursor-not-allowed bg-muted/30 border-border"
                          : selectedLocationCode === location.code
                            ? "bg-primary/5 border-primary shadow-sm"
                            : "bg-card border-border hover:border-primary/50"
                      )}
                      data-testid={`radio-location-${location.code.toLowerCase()}`}
                    >
                      <img
                        src={flagAU}
                        alt={location.countryCode}
                        className="h-8 w-12 object-cover rounded"
                      />
                      <div className="flex-1 text-left">
                        <div className="font-medium text-foreground">{location.name}</div>
                        <div className="text-xs text-muted-foreground">{location.country}</div>
                      </div>
                      {selectedLocationCode === location.code && (
                        <Check className="h-4 w-4 text-primary flex-shrink-0" />
                      )}
                      {!location.enabled && (
                        <span className="text-xs text-muted-foreground">Soon</span>
                      )}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Step 3: Set Hostname - Only show after region is selected */}
            {selectedPlanId && selectedLocationCode && (
              <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-4">
                  <Server className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold text-foreground">Set Hostname</h2>
                </div>
                <div className="border border-border rounded-lg p-6 bg-card">
                  <div className="space-y-2">
                    <Label htmlFor="hostname">Server Hostname</Label>
                    <Input
                      id="hostname"
                      placeholder="example.yourhostname.com"
                      value={hostname}
                      onChange={handleHostnameChange}
                      className={hostnameError ? "border-destructive" : ""}
                      data-testid="input-hostname"
                    />
                    {hostnameError ? (
                      <p className="text-xs text-destructive">{hostnameError}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Enter a hostname (e.g., server01) or full domain (e.g., server01.example.com)
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Step 4: Choose OS - Only show after hostname is entered */}
            {selectedPlanId && selectedLocationCode && hostname && (
              <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-4">
                  <HardDrive className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold text-foreground">Choose Operating System</h2>
                </div>

                {loadingTemplates ? (
                  <div className="flex items-center justify-center py-12 border border-border rounded-lg bg-card">
                    <Loader2 className="h-6 w-6 text-primary animate-spin" />
                  </div>
                ) : templates.length === 0 ? (
                  <div className="text-center py-8 border border-border rounded-lg bg-card">
                    <p className="text-sm text-muted-foreground">
                      No operating systems available for this plan.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {templates.map((group, groupIndex) => (
                      <div key={groupIndex}>
                        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
                          {group.name}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {group.templates.map((template) => (
                            <button
                              key={template.id}
                              type="button"
                              onClick={() => setSelectedOsId(template.id)}
                              className={cn(
                                "relative flex items-center gap-3 p-4 rounded-lg border transition-all text-left",
                                selectedOsId === template.id
                                  ? "bg-primary/5 border-primary shadow-sm"
                                  : "bg-card border-border hover:border-primary/50"
                              )}
                              data-testid={`radio-os-${template.id}`}
                            >
                              <img
                                src={getOsLogoUrl({ id: template.id, name: template.name, group: group.name })}
                                alt={template.name}
                                className="h-10 w-10 object-contain flex-shrink-0"
                                onError={(e) => { e.currentTarget.src = FALLBACK_LOGO; }}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-foreground truncate">
                                  {template.name}
                                </div>
                                {template.version && (
                                  <div className="text-xs text-muted-foreground">{template.version}</div>
                                )}
                              </div>
                              {selectedOsId === template.id && (
                                <Check className="h-4 w-4 text-primary flex-shrink-0" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>

          {/* Summary Sidebar */}
          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-6">
              <div className="border border-border rounded-lg p-6 bg-card">
                <h2 className="text-lg font-semibold text-foreground mb-4">Summary</h2>

                <div className="space-y-4">
                  {/* Plan */}
                  <div>
                    <div className="text-xs uppercase text-muted-foreground tracking-wide mb-1">Plan</div>
                    <div className="text-sm font-medium text-foreground">
                      {selectedPlan ? selectedPlan.name : <span className="text-muted-foreground italic">Not selected</span>}
                    </div>
                    {selectedPlan && (
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div>{selectedPlan.vcpu} vCPU</div>
                        <div>{formatRAM(selectedPlan.ramMb)} RAM</div>
                        <div>{selectedPlan.storageGb} GB Storage</div>
                        <div>{formatTransfer(selectedPlan.transferGb)} Bandwidth</div>
                      </div>
                    )}
                  </div>

                  {/* Region */}
                  <div className="border-t border-border pt-4">
                    <div className="text-xs uppercase text-muted-foreground tracking-wide mb-1">Region</div>
                    <div className="text-sm font-medium text-foreground">
                      {selectedLocation ? selectedLocation.name : <span className="text-muted-foreground italic">Not selected</span>}
                    </div>
                  </div>

                  {/* OS */}
                  <div className="border-t border-border pt-4">
                    <div className="text-xs uppercase text-muted-foreground tracking-wide mb-1">Operating System</div>
                    <div className="text-sm font-medium text-foreground">
                      {selectedOs ? selectedOs.name : <span className="text-muted-foreground italic">Not selected</span>}
                    </div>
                  </div>

                  {/* Hostname */}
                  <div className="border-t border-border pt-4">
                    <div className="text-xs uppercase text-muted-foreground tracking-wide mb-1">Hostname</div>
                    <div className="text-sm font-mono text-foreground">
                      {hostname || <span className="text-muted-foreground italic">Not set</span>}
                    </div>
                  </div>

                  {/* Promo Code */}
                  {selectedPlanId && (
                    <div className="border-t border-border pt-4">
                      <div className="text-xs uppercase text-muted-foreground tracking-wide mb-2 flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        Promo Code
                      </div>
                      {promoCode && promoValidation?.valid ? (
                        <div className="flex items-center justify-between bg-success/10 border border-success/20 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Check className="h-4 w-4 text-success" />
                            <span className="font-mono text-sm font-medium text-success">{promoCode}</span>
                          </div>
                          <button
                            type="button"
                            onClick={handleRemovePromoCode}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Input
                            placeholder="Enter code"
                            value={promoCodeInput}
                            onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                            className="flex-1 font-mono text-sm h-9"
                            maxLength={20}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleApplyPromoCode}
                            disabled={validatingPromo || !promoCodeInput.trim()}
                            className="h-9 px-3"
                          >
                            {validatingPromo ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Apply"
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Pricing */}
                  <div className="border-t border-border pt-4">
                    <div className="rounded-xl bg-background border border-border overflow-hidden">
                      <div className="divide-y divide-border">
                        <div className="flex justify-between items-center px-4 py-3">
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">Monthly</span>
                          <span className={cn(
                            "text-sm font-semibold font-mono",
                            promoValidation?.valid ? "text-muted-foreground line-through" : "text-foreground"
                          )}>
                            {selectedPlan ? formatCurrency(selectedPlan.priceMonthly) : "—"}
                          </span>
                        </div>
                        {promoValidation?.valid && promoValidation.discountCents && (
                          <div className="flex justify-between items-center px-4 py-3">
                            <span className="text-xs text-success uppercase tracking-wide">
                              Discount {promoValidation.discountType === 'percentage' ? `(${promoValidation.discountValue}%)` : ''}
                            </span>
                            <span className="text-sm font-semibold font-mono text-success">
                              -{formatCurrency(promoValidation.discountCents)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center px-4 py-3">
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">Wallet balance</span>
                          <span className={cn(
                            "text-sm font-semibold font-mono",
                            canAfford ? "text-success" : "text-destructive"
                          )}>
                            {loadingWallet ? (
                              <span className="inline-flex items-center gap-1 text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Loading...
                              </span>
                            ) : formatCurrency(wallet?.balanceCents || 0)}
                          </span>
                        </div>
                      </div>
                      <div className={cn(
                        "flex justify-between items-center px-4 py-3.5",
                        canAfford ? "bg-primary/10 border-t border-primary/20" : "bg-destructive/10 border-t border-destructive/20"
                      )}>
                        <span className="text-sm font-semibold text-foreground">Due now</span>
                        <span className={cn(
                          "text-xl font-bold font-mono",
                          canAfford ? "text-primary" : "text-destructive"
                        )}>
                          {selectedPlan ? formatCurrency(finalPrice) : "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Deploy Button */}
                  <div className="pt-2">
                    {!selectedPlanId || !hostname || !selectedOsId ? (
                      <Button
                        className="w-full h-11"
                        disabled
                        data-testid="button-deploy-disabled"
                      >
                        {!selectedPlanId ? 'Select plan' : !hostname ? 'Enter hostname' : 'Select OS'}
                      </Button>
                    ) : canAfford ? (
                      <Button
                        className="w-full h-11 gap-2"
                        onClick={handleDeploy}
                        disabled={deployMutation.isPending || loadingWallet}
                        data-testid="button-deploy"
                      >
                        {deployMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Zap className="h-4 w-4" />
                            Deploy Server
                          </>
                        )}
                      </Button>
                    ) : (
                      <div className="space-y-3">
                        <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <Wallet className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground mb-1">
                                Insufficient Balance
                              </p>
                              <p className="text-xs text-muted-foreground">
                                You need {selectedPlan ? formatCurrency(finalPrice - (wallet?.balanceCents || 0)) : '—'} more to deploy this server.
                              </p>
                            </div>
                          </div>
                        </div>
                        <Button
                          asChild
                          className="w-full h-11"
                          variant="outline"
                        >
                          <Link href="/billing">
                            Go to Billing
                          </Link>
                        </Button>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground text-center">
                    Charges deduct from wallet balance
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </TooltipProvider>
    </AppShell>
  );
}
