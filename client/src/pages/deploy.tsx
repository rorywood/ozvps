import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/layout/app-shell";
import { useToast } from "@/hooks/use-toast";
import { 
  Check,
  Loader2,
  Zap,
  Plus,
  Cpu,
  MemoryStick,
  HardDrive,
  ArrowUpDown
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

function formatTransfer(gb: number): string {
  if (gb >= 1000) {
    return `${(gb / 1000).toFixed(0)} TB`;
  }
  return `${gb} GB`;
}

export default function DeployPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [selectedLocationCode, setSelectedLocationCode] = useState<string>("BNE");

  const searchParams = new URLSearchParams(search);
  const topupResult = searchParams.get('topup');

  useEffect(() => {
    if (topupResult === 'success') {
      toast({
        title: "Payment successful",
        description: "Your wallet has been topped up.",
      });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
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

  const plans = plansData?.plans || [];
  const locations = locationsData?.locations || [];
  const wallet = walletData?.wallet;
  const selectedPlan = plans.find(p => p.id === selectedPlanId);
  const selectedLocation = locations.find(l => l.code === selectedLocationCode);
  const canAfford = wallet && selectedPlan && wallet.balanceCents >= selectedPlan.priceMonthly;

  const handleDeploy = () => {
    if (!selectedPlanId || !selectedLocationCode) return;
    deployMutation.mutate({
      planId: selectedPlanId,
      locationCode: selectedLocationCode,
    });
  };

  const handleTopupAndDeploy = () => {
    if (!selectedPlan || !wallet) return;
    const shortfall = selectedPlan.priceMonthly - wallet.balanceCents;
    const topupNeeded = Math.max(shortfall, 500);
    topupMutation.mutate(topupNeeded);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-white" data-testid="text-page-title">
              Deploy
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Shared CPU • Australia
            </p>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel: Selection */}
          <div className="lg:col-span-2 space-y-6">
            {/* Location Section */}
            <GlassCard className="p-5">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                Location
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {locations.map((location) => (
                  <button
                    key={location.code}
                    type="button"
                    disabled={!location.enabled}
                    onClick={() => location.enabled && setSelectedLocationCode(location.code)}
                    className={`relative flex items-center gap-3 p-4 rounded-lg border transition-all text-left ${
                      !location.enabled 
                        ? 'opacity-50 cursor-not-allowed bg-white/[0.02] border-white/5' 
                        : selectedLocationCode === location.code 
                          ? 'bg-primary/10 border-primary ring-1 ring-primary' 
                          : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                    }`}
                    data-testid={`radio-location-${location.code.toLowerCase()}`}
                  >
                    <img 
                      src={flagAU} 
                      alt={location.countryCode} 
                      className="h-5 w-7 object-cover rounded-sm shadow-sm"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${location.enabled ? 'text-white' : 'text-muted-foreground'}`}>
                          {location.name}
                        </span>
                        <span className="text-xs text-muted-foreground">({location.code})</span>
                      </div>
                    </div>
                    {!location.enabled && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">
                        Coming soon
                      </span>
                    )}
                    {location.enabled && selectedLocationCode === location.code && (
                      <div className="absolute top-2 right-2 bg-primary rounded-full p-0.5">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </GlassCard>

            {/* Plans Section */}
            <GlassCard className="p-5">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                Plan
              </h2>
              
              {loadingPlans ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 text-primary animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {plans.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={`relative p-4 rounded-lg border transition-all text-left ${
                        selectedPlanId === plan.id
                          ? 'bg-primary/10 border-primary ring-1 ring-primary'
                          : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                      }`}
                      data-testid={`card-plan-${plan.code}`}
                    >
                      {selectedPlanId === plan.id && (
                        <div className="absolute top-2 right-2 bg-primary rounded-full p-0.5">
                          <Check className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                      
                      <div className="mb-3">
                        <h3 className="font-semibold text-white">{plan.name}</h3>
                        <p className="text-lg font-mono font-bold text-primary">
                          {formatCurrency(plan.priceMonthly)}
                          <span className="text-xs text-muted-foreground font-normal">/mo</span>
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Cpu className="h-3.5 w-3.5" />
                          <span>{plan.vcpu} vCPU</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <MemoryStick className="h-3.5 w-3.5" />
                          <span>{formatRAM(plan.ramMb)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <HardDrive className="h-3.5 w-3.5" />
                          <span>{plan.storageGb} GB NVMe</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <ArrowUpDown className="h-3.5 w-3.5" />
                          <span>{formatTransfer(plan.transferGb)}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </GlassCard>
          </div>

          {/* Right Panel: Summary */}
          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-6">
              <GlassCard className="p-5">
                <h2 className="text-lg font-semibold text-white mb-4">Summary</h2>
                
                <div className="space-y-4">
                  {/* Location */}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Location</span>
                    <span className="text-white flex items-center gap-1.5">
                      {selectedLocation && (
                        <img src={flagAU} alt="AU" className="h-3.5 w-5 object-cover rounded-sm" />
                      )}
                      {selectedLocation?.name || 'Select location'}
                    </span>
                  </div>
                  
                  {/* Plan */}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Plan</span>
                    <span className="text-white">{selectedPlan?.name || 'Select plan'}</span>
                  </div>
                  
                  {/* Specs */}
                  {selectedPlan && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Specs</span>
                      <span className="text-muted-foreground text-xs">
                        {selectedPlan.vcpu} vCPU, {formatRAM(selectedPlan.ramMb)}, {selectedPlan.storageGb} GB
                      </span>
                    </div>
                  )}
                  
                  <div className="border-t border-white/10 pt-4 space-y-3">
                    {/* Monthly price */}
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Monthly price</span>
                      <span className="font-mono font-medium text-white">
                        {selectedPlan ? formatCurrency(selectedPlan.priceMonthly) : '$0.00'}
                      </span>
                    </div>
                    
                    {/* Balance */}
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Balance</span>
                      <span className={`font-mono font-medium ${canAfford ? 'text-green-500' : 'text-white'}`}>
                        {loadingWallet ? "..." : formatCurrency(wallet?.balanceCents || 0)}
                      </span>
                    </div>
                    
                    {/* Due now */}
                    <div className="flex justify-between items-center">
                      <span className="text-white font-medium">Due now</span>
                      <span className="font-mono font-bold text-lg text-primary">
                        {selectedPlan ? formatCurrency(selectedPlan.priceMonthly) : '$0.00'}
                      </span>
                    </div>
                  </div>
                  
                  {/* Action Button */}
                  <div className="pt-2">
                    {!selectedPlan ? (
                      <Button 
                        className="w-full h-11" 
                        disabled 
                        data-testid="button-deploy-disabled"
                      >
                        Select a plan
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
                            Deploy
                          </>
                        )}
                      </Button>
                    ) : stripeConfigured ? (
                      <Button 
                        className="w-full h-11 gap-2" 
                        onClick={handleTopupAndDeploy}
                        disabled={topupMutation.isPending}
                        data-testid="button-topup-deploy"
                      >
                        {topupMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Plus className="h-4 w-4" />
                            Top up & Deploy
                          </>
                        )}
                      </Button>
                    ) : (
                      <Button 
                        className="w-full h-11" 
                        disabled 
                        data-testid="button-deploy-no-stripe"
                      >
                        Insufficient balance
                      </Button>
                    )}
                  </div>
                  
                  {/* Subtext */}
                  <p className="text-xs text-muted-foreground text-center">
                    Charges deduct from wallet balance
                  </p>
                </div>
              </GlassCard>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
