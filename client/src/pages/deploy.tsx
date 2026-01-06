import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppShell } from "@/components/layout/app-shell";
import { useToast } from "@/hooks/use-toast";
import { 
  Server, 
  Cpu, 
  HardDrive, 
  Activity, 
  Wallet, 
  Plus, 
  Check,
  Loader2,
  Zap,
  AlertCircle,
  MapPin
} from "lucide-react";
import { api } from "@/lib/api";
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

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatRAM(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB`;
  }
  return `${mb} MB`;
}

export default function DeployPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [selectedLocationCode, setSelectedLocationCode] = useState<string>("BNE");
  const [hostname, setHostname] = useState("");
  const [topupAmount, setTopupAmount] = useState(1000);

  const searchParams = new URLSearchParams(search);
  const topupResult = searchParams.get('topup');

  useEffect(() => {
    if (topupResult === 'success') {
      toast({
        title: "Payment successful",
        description: "Your wallet has been topped up. It may take a moment to reflect.",
      });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    } else if (topupResult === 'cancelled') {
      toast({
        title: "Payment cancelled",
        description: "Your payment was cancelled.",
        variant: "destructive",
      });
    }
  }, [topupResult, toast, queryClient]);

  const { data: plansData, isLoading: loadingPlans } = useQuery<{ plans: Plan[] }>({
    queryKey: ['plans'],
    queryFn: () => api.getPlans(),
  });

  const { data: locationsData } = useQuery<{ locations: Location[] }>({
    queryKey: ['locations'],
    queryFn: () => api.getLocations(),
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

  const deployMutation = useMutation({
    mutationFn: (data: { planId: number; hostname?: string; locationCode?: string }) => api.deployServer(data),
    onSuccess: (data: { orderId: number; serverId: number }) => {
      toast({
        title: "Server deployed!",
        description: "Your new VPS is being provisioned.",
      });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
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

  const plans = plansData?.plans || [];
  const locations = locationsData?.locations || [];
  const wallet = walletData?.wallet;
  const selectedPlan = plans.find(p => p.id === selectedPlanId);
  const selectedLocation = locations.find(l => l.code === selectedLocationCode);
  const canAfford = wallet && selectedPlan && wallet.balanceCents >= selectedPlan.priceMonthly;
  const canDeploy = selectedPlanId && selectedLocationCode && !loadingWallet;

  const handleDeploy = () => {
    if (!selectedPlanId) return;
    deployMutation.mutate({
      planId: selectedPlanId,
      hostname: hostname.trim() || undefined,
      locationCode: selectedLocationCode,
    });
  };

  const handleTopupAndDeploy = () => {
    if (!selectedPlan || !wallet) return;
    const shortfall = selectedPlan.priceMonthly - wallet.balanceCents;
    const topupNeeded = Math.max(shortfall, 500);
    topupMutation.mutate(topupNeeded);
  };

  const handleTopup = () => {
    topupMutation.mutate(topupAmount);
  };

  return (
    <AppShell>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-white" data-testid="text-page-title">
            Deploy New VPS
          </h1>
          <p className="text-muted-foreground mt-1">
            Select your configuration and deploy in seconds
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Column 1: Type (fixed) */}
          <div className="lg:col-span-2 space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Type
            </h2>
            <GlassCard className="p-4 ring-2 ring-primary border-primary" data-testid="card-type-shared">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 rounded-lg p-2 border border-primary/20">
                  <Cpu className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-white">Shared CPU</p>
                  <p className="text-xs text-muted-foreground">Best value</p>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Column 2: Location + Plan Selection */}
          <div className="lg:col-span-6 space-y-6">
            {/* Location Selector */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Location
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {locations.map((location) => (
                  <GlassCard
                    key={location.code}
                    className={`p-4 transition-all ${
                      !location.enabled 
                        ? 'opacity-50 cursor-not-allowed' 
                        : selectedLocationCode === location.code 
                          ? 'ring-2 ring-primary border-primary cursor-pointer' 
                          : 'hover:border-primary/50 cursor-pointer'
                    }`}
                    onClick={() => location.enabled && setSelectedLocationCode(location.code)}
                    data-testid={`card-location-${location.code.toLowerCase()}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img 
                          src={flagAU} 
                          alt={location.countryCode} 
                          className="h-6 w-8 object-cover rounded-sm shadow-sm"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className={`font-medium ${location.enabled ? 'text-white' : 'text-muted-foreground'}`}>
                              {location.name}
                            </p>
                            {!location.enabled && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">
                                Coming soon
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{location.code}</p>
                        </div>
                      </div>
                      {location.enabled && selectedLocationCode === location.code && (
                        <div className="bg-primary rounded-full p-1">
                          <Check className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>

            {/* Plan Selection Table */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Server className="h-4 w-4" />
                Plan
              </h2>
              
              {loadingPlans ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <GlassCard className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/5">
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Plan</th>
                          <th className="text-center px-4 py-3 font-medium text-muted-foreground">vCPU</th>
                          <th className="text-center px-4 py-3 font-medium text-muted-foreground">RAM</th>
                          <th className="text-center px-4 py-3 font-medium text-muted-foreground">NVMe</th>
                          <th className="text-center px-4 py-3 font-medium text-muted-foreground">Transfer</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">Monthly</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plans.map((plan) => (
                          <tr
                            key={plan.id}
                            onClick={() => setSelectedPlanId(plan.id)}
                            className={`cursor-pointer transition-all border-b border-white/5 last:border-0 ${
                              selectedPlanId === plan.id
                                ? 'bg-primary/10'
                                : 'hover:bg-white/5'
                            }`}
                            data-testid={`row-plan-${plan.code}`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {selectedPlanId === plan.id && (
                                  <div className="bg-primary rounded-full p-0.5">
                                    <Check className="h-3 w-3 text-primary-foreground" />
                                  </div>
                                )}
                                <span className="font-medium text-white">{plan.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center text-muted-foreground">{plan.vcpu}</td>
                            <td className="px-4 py-3 text-center text-muted-foreground">{formatRAM(plan.ramMb)}</td>
                            <td className="px-4 py-3 text-center text-muted-foreground">{plan.storageGb} GB</td>
                            <td className="px-4 py-3 text-center text-muted-foreground">{(plan.transferGb / 1000).toFixed(0)} TB</td>
                            <td className="px-4 py-3 text-right font-mono font-medium text-primary">{formatCurrency(plan.priceMonthly)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </GlassCard>
              )}
            </div>
          </div>

          {/* Column 3: Deploy Summary */}
          <div className="lg:col-span-4 space-y-4">
            <GlassCard className="p-5">
              <h2 className="text-lg font-semibold text-white mb-4">Deploy Summary</h2>
              
              <div className="space-y-4">
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <span className="text-white">Shared CPU</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Location</span>
                    <span className="text-white flex items-center gap-1.5">
                      {selectedLocation && (
                        <img src={flagAU} alt="AU" className="h-3.5 w-5 object-cover rounded-sm" />
                      )}
                      {selectedLocation?.name || 'Select location'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Plan</span>
                    <span className="text-white">{selectedPlan?.name || 'Select plan'}</span>
                  </div>
                  {selectedPlan && (
                    <>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Specs</span>
                        <span>{selectedPlan.vcpu} vCPU, {formatRAM(selectedPlan.ramMb)}, {selectedPlan.storageGb} GB</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Quantity</span>
                    <span className="text-white">1</span>
                  </div>
                </div>

                <div className="border-t border-white/10 pt-4 space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="hostname" className="text-xs text-muted-foreground">
                      Hostname (optional)
                    </Label>
                    <Input
                      id="hostname"
                      placeholder="my-server"
                      value={hostname}
                      onChange={(e) => setHostname(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      className="h-9"
                      data-testid="input-hostname"
                    />
                  </div>
                </div>

                <div className="border-t border-white/10 pt-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Due now (first month)</span>
                    <span className="font-mono font-semibold text-white">
                      {selectedPlan ? formatCurrency(selectedPlan.priceMonthly) : '$0.00'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Account balance</span>
                    <span className={`font-mono font-medium ${canAfford ? 'text-green-500' : 'text-muted-foreground'}`}>
                      {loadingWallet ? "..." : formatCurrency(wallet?.balanceCents || 0)}
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  {canAfford ? (
                    <Button 
                      className="w-full gap-2 h-11" 
                      onClick={handleDeploy}
                      disabled={!canDeploy || deployMutation.isPending}
                      data-testid="button-deploy"
                    >
                      {deployMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Zap className="h-4 w-4" />
                          Deploy
                        </>
                      )}
                    </Button>
                  ) : selectedPlan ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-yellow-500 text-sm">
                        <AlertCircle className="h-4 w-4" />
                        <span>Insufficient balance</span>
                      </div>
                      {stripeConfigured ? (
                        <Button 
                          className="w-full gap-2 h-11" 
                          onClick={handleTopupAndDeploy}
                          disabled={topupMutation.isPending}
                          data-testid="button-topup-deploy"
                        >
                          {topupMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Plus className="h-4 w-4" />
                              Top Up & Deploy
                            </>
                          )}
                        </Button>
                      ) : (
                        <div className="text-xs text-muted-foreground text-center py-2" data-testid="text-topup-disabled">
                          Top-ups disabled - billing not configured
                        </div>
                      )}
                    </div>
                  ) : (
                    <Button className="w-full h-11" disabled data-testid="button-deploy-disabled">
                      Select a plan to continue
                    </Button>
                  )}
                </div>
              </div>
            </GlassCard>

            {/* Quick Top-up - only show if Stripe is configured */}
            {stripeConfigured && (
              <GlassCard className="p-5" data-testid="card-add-funds">
                <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  Add Funds
                </h2>
                
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {[500, 1000, 2000, 5000, 10000, 20000].map((amount) => (
                      <Button
                        key={amount}
                        variant={topupAmount === amount ? "default" : "outline"}
                        size="sm"
                        onClick={() => setTopupAmount(amount)}
                        className="font-mono text-xs"
                        data-testid={`button-topup-${amount}`}
                      >
                        ${amount / 100}
                      </Button>
                    ))}
                  </div>
                  
                  <Button 
                    className="w-full gap-2" 
                    variant="secondary"
                    size="sm"
                    onClick={handleTopup}
                    disabled={topupMutation.isPending}
                    data-testid="button-topup-submit"
                  >
                    {topupMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="h-4 w-4" />
                        Add {formatCurrency(topupAmount)}
                      </>
                    )}
                  </Button>
                </div>
              </GlassCard>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
