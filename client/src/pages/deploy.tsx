import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Wallet
} from "lucide-react";
import { api } from "@/lib/api";
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

  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [selectedLocationCode, setSelectedLocationCode] = useState<string>("BNE");
  const [selectedOsId, setSelectedOsId] = useState<number | null>(null);
  const [hostname, setHostname] = useState("");
  const [hostnameError, setHostnameError] = useState("");

  // Check email verification status
  const { data: authData, isLoading: authLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.getMe(),
  });

  // Resend verification email mutation
  const resendMutation = useMutation({
    mutationFn: async () => {
      const csrfToken = localStorage.getItem('csrfToken') ||
        document.cookie.split('; ').find(c => c.startsWith('ozvps_csrf='))?.split('=')[1] || '';

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

  const deployMutation = useMutation({
    mutationFn: (data: { planId: number; osId: number; hostname: string; locationCode: string }) =>
      api.deployServer(data),
    onSuccess: (data: { orderId: number; serverId: number }) => {
      toast({
        title: "Server deployed!",
        description: "Your new VPS is being provisioned.",
      });
      // Set setupMode flag so server-detail page shows provisioning view
      try {
        sessionStorage.setItem(`setupMode:${data.serverId}`, 'true');
      } catch {
        // Ignore storage errors
      }
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      setLocation(`/servers/${data.serverId}`);
    },
    onError: (error: any) => {
      toast({
        title: "Deployment failed",
        description: error.message || "Failed to deploy server",
        variant: "destructive",
      });
    },
  });

  const plans = (plansData?.plans || []).filter(p => p.active);
  const locations = locationsData?.locations || [];
  const wallet = walletData?.wallet;
  const selectedPlan = plans.find(p => p.id === selectedPlanId);
  const selectedLocation = locations.find(l => l.code === selectedLocationCode);
  const templates = templatesData || [];
  const canAfford = wallet && selectedPlan && wallet.balanceCents >= selectedPlan.priceMonthly;

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
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {plans.map((plan) => {
                    const isSelected = selectedPlanId === plan.id;
                    const isPopular = plan.popular;

                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setSelectedPlanId(plan.id)}
                        className={cn(
                          "relative p-4 rounded-lg border text-left transition-all",
                          isSelected
                            ? "bg-primary/5 border-primary shadow-sm"
                            : "bg-card border-border hover:border-primary/50"
                        )}
                        data-testid={`card-plan-${plan.code}`}
                      >
                        {isPopular && (
                          <div className="mb-2">
                            <span className="inline-block px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-primary text-primary-foreground rounded">
                              Popular
                            </span>
                          </div>
                        )}

                        {isSelected && (
                          <div className="absolute top-3 right-3">
                            <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                              <Check className="h-3 w-3 text-primary-foreground" />
                            </div>
                          </div>
                        )}

                        <div className="mb-3">
                          <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
                          <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-3xl font-bold text-foreground tracking-tight">
                              ${(plan.priceMonthly / 100).toFixed(0)}
                            </span>
                            <span className="text-sm text-muted-foreground">/mo</span>
                          </div>
                        </div>

                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">vCPU</span>
                            <span className="text-foreground font-medium">{plan.vcpu}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">RAM</span>
                            <span className="text-foreground font-medium">{formatRAM(plan.ramMb)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Storage</span>
                            <span className="text-foreground font-medium">{plan.storageGb} GB</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Transfer</span>
                            <span className="text-foreground font-medium">{formatTransfer(plan.transferGb)}</span>
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
                      placeholder="my-server"
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
                        <div>{formatRAM(selectedPlan.ramMb)}</div>
                        <div>{selectedPlan.storageGb} GB NVMe</div>
                        <div>{formatTransfer(selectedPlan.transferGb)}</div>
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

                  {/* Pricing */}
                  <div className="border-t border-border pt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Monthly price</span>
                      <span className="font-mono font-medium text-foreground">
                        {selectedPlan ? formatCurrency(selectedPlan.priceMonthly) : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Balance</span>
                      <span className={cn(
                        "font-mono font-medium",
                        canAfford ? "text-success" : "text-foreground"
                      )}>
                        {loadingWallet ? "..." : formatCurrency(wallet?.balanceCents || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-border">
                      <span className="font-medium text-foreground">Due now</span>
                      <span className="font-mono font-bold text-xl text-primary">
                        {selectedPlan ? formatCurrency(selectedPlan.priceMonthly) : "—"}
                      </span>
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
                                You need {selectedPlan ? formatCurrency(selectedPlan.priceMonthly - (wallet?.balanceCents || 0)) : '—'} more to deploy this server.
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
    </AppShell>
  );
}
