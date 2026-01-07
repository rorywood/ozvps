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
  Cpu,
  MemoryStick,
  HardDrive,
  ArrowUpDown,
  MapPin,
  ChevronRight
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
      <div className="min-h-[calc(100vh-12rem)] flex flex-col">
        {/* Hero Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-white" data-testid="text-page-title">
                Deploy a Server
              </h1>
              <p className="text-muted-foreground text-sm">
                Choose your configuration and deploy instantly
              </p>
            </div>
          </div>
        </div>

        {/* Main Content - Flows naturally */}
        <div className="flex-1 space-y-8 pb-32">
          
          {/* Location Selection - Compact inline pills */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
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
                  className={`group relative flex items-center gap-2.5 px-4 py-2.5 rounded-full transition-all ${
                    !location.enabled 
                      ? 'opacity-40 cursor-not-allowed bg-white/5' 
                      : selectedLocationCode === location.code 
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25' 
                        : 'bg-white/5 hover:bg-white/10 text-white'
                  }`}
                  data-testid={`radio-location-${location.code.toLowerCase()}`}
                >
                  <img 
                    src={flagAU} 
                    alt={location.countryCode} 
                    className="h-4 w-6 object-cover rounded-sm"
                  />
                  <span className="font-medium text-sm">{location.name}</span>
                  {!location.enabled && (
                    <span className="text-[10px] opacity-60">Soon</span>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Plan Selection - Horizontal scrollable cards */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Cpu className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Choose Plan
              </h2>
            </div>
            
            {loadingPlans ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 px-4 pb-2">
                <div className="flex gap-3 min-w-min">
                  {plans.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={`relative flex-shrink-0 w-56 p-5 rounded-2xl transition-all duration-200 text-left ${
                        selectedPlanId === plan.id
                          ? 'bg-gradient-to-br from-primary/15 to-primary/5 ring-2 ring-primary shadow-xl shadow-primary/10'
                          : 'bg-white/[0.03] hover:bg-white/[0.06] ring-1 ring-white/10 hover:ring-white/20'
                      }`}
                      data-testid={`card-plan-${plan.code}`}
                    >
                      {selectedPlanId === plan.id && (
                        <div className="absolute top-3 right-3 bg-primary rounded-full p-1">
                          <Check className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                      
                      <div className="mb-4">
                        <h3 className="font-semibold text-white text-lg">{plan.name}</h3>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-2xl font-bold text-primary font-mono">
                            {formatCurrency(plan.priceMonthly)}
                          </span>
                          <span className="text-xs text-muted-foreground">/mo</span>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Cpu className="h-3.5 w-3.5" />
                          <span>{plan.vcpu} vCPU</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MemoryStick className="h-3.5 w-3.5" />
                          <span>{formatRAM(plan.ramMb)} RAM</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <HardDrive className="h-3.5 w-3.5" />
                          <span>{plan.storageGb} GB NVMe</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <ArrowUpDown className="h-3.5 w-3.5" />
                          <span>{formatTransfer(plan.transferGb)} Transfer</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Sticky Bottom Summary Bar */}
        <div className="fixed bottom-0 left-0 right-0 z-40">
          <div className="bg-gradient-to-t from-background via-background to-transparent h-8 pointer-events-none" />
          <div className="bg-background/80 backdrop-blur-xl border-t border-white/10">
            <div className="max-w-5xl mx-auto px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                {/* Left: Selection Summary */}
                <div className="flex items-center gap-6 min-w-0">
                  {selectedLocation && (
                    <div className="flex items-center gap-2 text-sm">
                      <img src={flagAU} alt="AU" className="h-4 w-5 object-cover rounded-sm" />
                      <span className="text-white font-medium">{selectedLocation.name}</span>
                    </div>
                  )}
                  {selectedPlan && (
                    <>
                      <ChevronRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                      <div className="text-sm hidden sm:block">
                        <span className="text-white font-medium">{selectedPlan.name}</span>
                        <span className="text-muted-foreground ml-2">
                          {selectedPlan.vcpu} vCPU, {formatRAM(selectedPlan.ramMb)}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Right: Price & Action */}
                <div className="flex items-center gap-4">
                  {/* Balance indicator */}
                  <div className="text-right hidden sm:block">
                    <div className="text-xs text-muted-foreground">Balance</div>
                    <div className={`font-mono font-medium ${canAfford ? 'text-green-500' : 'text-white'}`}>
                      {loadingWallet ? "..." : formatCurrency(wallet?.balanceCents || 0)}
                    </div>
                  </div>

                  {/* Price & Deploy */}
                  <div className="flex items-center gap-3">
                    {selectedPlan && (
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Due now</div>
                        <div className="font-mono font-bold text-primary text-lg">
                          {formatCurrency(selectedPlan.priceMonthly)}
                        </div>
                      </div>
                    )}

                    {!selectedPlan ? (
                      <Button 
                        className="h-11 px-6" 
                        disabled 
                        data-testid="button-deploy-disabled"
                      >
                        Select a plan
                      </Button>
                    ) : canAfford ? (
                      <Button 
                        className="h-11 px-6 gap-2 shadow-lg shadow-primary/25" 
                        onClick={handleDeploy}
                        disabled={loadingWallet || deployMutation.isPending}
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
                    ) : (
                      <Button 
                        className="h-11 px-6 gap-2" 
                        variant="outline"
                        onClick={handleAddFunds}
                        data-testid="button-add-funds"
                      >
                        <Wallet className="h-4 w-4" />
                        Add Funds
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
