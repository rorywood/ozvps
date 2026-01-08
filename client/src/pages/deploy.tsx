import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/layout/app-shell";
import { useToast } from "@/hooks/use-toast";
import { 
  Check,
  Loader2,
  Zap,
  Wallet,
  Server,
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

function formatCurrency(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2)}`;
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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [selectedLocationCode, setSelectedLocationCode] = useState<string>("BNE");

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

  const deployMutation = useMutation({
    mutationFn: (data: { planId: number; locationCode: string }) => api.deployServer(data),
    onSuccess: (data: { orderId: number; serverId: number }) => {
      toast({
        title: "Server created!",
        description: "Complete the setup to install your operating system.",
      });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      setLocation(`/servers/${data.serverId}`);
    },
    onError: (error: any) => {
      toast({
        title: "Deployment failed",
        description: error.message || "Failed to create server",
        variant: "destructive",
      });
    },
  });

  const plans = (plansData?.plans || []).filter(p => p.active);
  const locations = locationsData?.locations || [];
  const wallet = walletData?.wallet;
  const selectedPlan = plans.find(p => p.id === selectedPlanId);
  const selectedLocation = locations.find(l => l.code === selectedLocationCode);
  const canAfford = wallet && selectedPlan && wallet.balanceCents >= selectedPlan.priceMonthly;

  const handleDeploy = () => {
    if (!selectedPlanId || !selectedLocationCode) return;
    deployMutation.mutate({ planId: selectedPlanId, locationCode: selectedLocationCode });
  };

  const handleAddFunds = () => {
    setLocation('/billing');
  };

  return (
    <AppShell>
      <div className="min-h-[calc(100vh-12rem)] flex flex-col overflow-x-hidden">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <Server className="h-6 w-6 text-blue-400" />
            <h1 className="text-2xl font-display font-bold text-white" data-testid="text-page-title">
              Deploy Server
            </h1>
          </div>
          <p className="text-muted-foreground text-sm ml-9">
            Select a plan and region to get started
          </p>
        </div>

        {/* Main Content */}
        <div className="flex-1 space-y-8 pb-32 overflow-x-hidden">
          
          {/* Location Selection */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="h-4 w-4 text-blue-400" />
              <h2 className="text-sm font-medium text-white">
                Region
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {locations.map((location) => (
                <button
                  key={location.code}
                  type="button"
                  disabled={!location.enabled}
                  onClick={() => location.enabled && setSelectedLocationCode(location.code)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                    !location.enabled 
                      ? 'opacity-40 cursor-not-allowed bg-white/5 border-white/5' 
                      : selectedLocationCode === location.code 
                        ? 'bg-blue-500/10 border-blue-500/50 text-white' 
                        : 'bg-white/5 border-white/10 hover:border-white/20 text-white/80 hover:text-white'
                  }`}
                  data-testid={`radio-location-${location.code.toLowerCase()}`}
                >
                  <img 
                    src={flagAU} 
                    alt={location.countryCode} 
                    className="h-4 w-5 object-cover rounded-sm"
                  />
                  <span className="text-sm font-medium">{location.name}</span>
                  {selectedLocationCode === location.code && (
                    <Check className="h-3.5 w-3.5 text-blue-400" />
                  )}
                  {!location.enabled && (
                    <span className="text-[10px] text-muted-foreground">Soon</span>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Plan Selection */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-4 w-4 text-blue-400" />
              <h2 className="text-sm font-medium text-white">
                Select Plan
              </h2>
            </div>
            
            {loadingPlans ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 text-blue-400 animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                {plans.map((plan) => {
                  const isSelected = selectedPlanId === plan.id;
                  const isPopular = plan.code === 'lite';
                  
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={`relative p-4 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'bg-blue-500/10 border-blue-500/50'
                          : 'bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
                      }`}
                      data-testid={`card-plan-${plan.code}`}
                    >
                      {/* Popular Badge */}
                      {isPopular && (
                        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                          <span className="px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-blue-500 text-white rounded-full">
                            Popular
                          </span>
                        </div>
                      )}
                      
                      {/* Selected Check */}
                      {isSelected && (
                        <div className="absolute top-3 right-3">
                          <div className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        </div>
                      )}
                      
                      {/* Plan Name & Price */}
                      <div className="mb-4">
                        <h3 className="text-base font-semibold text-white">{plan.name}</h3>
                        <div className="flex items-baseline gap-0.5 mt-1">
                          <span className="text-2xl font-bold text-white">
                            {formatCurrency(plan.priceMonthly)}
                          </span>
                          <span className="text-xs text-muted-foreground">/mo</span>
                        </div>
                      </div>
                      
                      {/* Specs */}
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">vCPU</span>
                          <span className="text-white font-medium">{plan.vcpu}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">RAM</span>
                          <span className="text-white font-medium">{formatRAM(plan.ramMb)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">NVMe</span>
                          <span className="text-white font-medium">{plan.storageGb} GB</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Transfer</span>
                          <span className="text-white font-medium">{formatTransfer(plan.transferGb)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Sticky Bottom Bar */}
        <div className="fixed bottom-0 left-0 right-0 z-40 lg:pl-64">
          <div className="bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a] to-transparent h-6 pointer-events-none" />
          <div className="bg-[#0a0a0a]/95 backdrop-blur-sm border-t border-white/10">
            <div className="max-w-5xl mx-auto px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                {/* Left: Summary */}
                <div className="flex items-center gap-4 text-sm">
                  {selectedLocation && (
                    <div className="flex items-center gap-2">
                      <img src={flagAU} alt="AU" className="h-3.5 w-5 object-cover rounded-sm" />
                      <span className="text-white/80">{selectedLocation.name}</span>
                    </div>
                  )}
                  {selectedPlan && (
                    <div className="hidden sm:flex items-center gap-1.5 text-white/60">
                      <span className="text-white/40">|</span>
                      <span className="text-white">{selectedPlan.name}</span>
                      <span className="text-white/40">-</span>
                      <span>{selectedPlan.vcpu} vCPU, {formatRAM(selectedPlan.ramMb)}</span>
                    </div>
                  )}
                </div>

                {/* Right: Balance, Price & Deploy */}
                <div className="flex items-center gap-4">
                  {/* Balance */}
                  <div className="hidden sm:block text-right">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Balance</div>
                    <div className={`text-sm font-mono font-medium ${canAfford ? 'text-green-400' : 'text-white'}`}>
                      {loadingWallet ? "..." : `$${((wallet?.balanceCents || 0) / 100).toFixed(2)}`}
                    </div>
                  </div>

                  {/* Price */}
                  {selectedPlan && (
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Due Now</div>
                      <div className="text-sm font-mono font-bold text-white">
                        ${(selectedPlan.priceMonthly / 100).toFixed(2)}
                      </div>
                    </div>
                  )}

                  {/* Deploy Button */}
                  {!selectedPlan ? (
                    <Button 
                      className="h-9 px-5 bg-white/10 text-white/50 hover:bg-white/10 cursor-not-allowed border-0" 
                      disabled 
                      data-testid="button-deploy-disabled"
                    >
                      Select a plan
                    </Button>
                  ) : canAfford ? (
                    <Button 
                      className="h-9 px-5 bg-blue-600 hover:bg-blue-700 text-white border-0" 
                      onClick={handleDeploy}
                      disabled={loadingWallet || deployMutation.isPending}
                      data-testid="button-deploy"
                    >
                      {deployMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Zap className="h-4 w-4 mr-1.5" />
                          Deploy
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button 
                      className="h-9 px-5 bg-white/10 hover:bg-white/15 text-white border-0" 
                      onClick={handleAddFunds}
                      data-testid="button-add-funds"
                    >
                      <Wallet className="h-4 w-4 mr-1.5" />
                      Add Funds
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
