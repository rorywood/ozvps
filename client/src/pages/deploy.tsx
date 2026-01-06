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
  ArrowRight,
  Zap,
  AlertCircle
} from "lucide-react";
import { api } from "@/lib/api";

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

  const { data: walletData, isLoading: loadingWallet } = useQuery<{ wallet: Wallet }>({
    queryKey: ['wallet'],
    queryFn: () => api.getWallet(),
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

  const deployMutation = useMutation({
    mutationFn: (data: { planId: number; hostname?: string }) => api.deployServer(data),
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
  const wallet = walletData?.wallet;
  const selectedPlan = plans.find(p => p.id === selectedPlanId);
  const canAfford = wallet && selectedPlan && wallet.balanceCents >= selectedPlan.priceMonthly;

  const handleDeploy = () => {
    if (!selectedPlanId) return;
    deployMutation.mutate({
      planId: selectedPlanId,
      hostname: hostname.trim() || undefined,
    });
  };

  const handleTopup = () => {
    topupMutation.mutate(topupAmount);
  };

  return (
    <AppShell>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-white" data-testid="text-page-title">
              Deploy New VPS
            </h1>
            <p className="text-muted-foreground mt-1">
              Select a plan and deploy your server in seconds
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Wallet className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">Balance:</span>
            <span className="font-mono font-medium text-white" data-testid="text-wallet-balance">
              {loadingWallet ? "..." : formatCurrency(wallet?.balanceCents || 0)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: Plan Selection */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Server className="h-5 w-5 text-primary" />
              Select Plan
            </h2>
            
            {loadingPlans ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {plans.map((plan) => (
                  <GlassCard
                    key={plan.id}
                    className={`p-4 cursor-pointer transition-all ${
                      selectedPlanId === plan.id 
                        ? 'ring-2 ring-primary border-primary' 
                        : 'hover:border-primary/50'
                    }`}
                    onClick={() => setSelectedPlanId(plan.id)}
                    data-testid={`card-plan-${plan.code}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-white">{plan.name}</h3>
                        <p className="text-2xl font-bold text-primary">
                          {formatCurrency(plan.priceMonthly)}
                          <span className="text-sm font-normal text-muted-foreground">/mo</span>
                        </p>
                      </div>
                      {selectedPlanId === plan.id && (
                        <div className="bg-primary rounded-full p-1">
                          <Check className="h-4 w-4 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Cpu className="h-4 w-4" />
                        <span>{plan.vcpu} vCPU</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        <span>{formatRAM(plan.ramMb)} RAM</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-4 w-4" />
                        <span>{plan.storageGb} GB NVMe</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        <span>{(plan.transferGb / 1000).toFixed(0)} TB Transfer</span>
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            )}
          </div>

          {/* Column 2: Summary & Actions */}
          <div className="space-y-4">
            {/* Order Summary */}
            <GlassCard className="p-4">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Server className="h-5 w-5 text-primary" />
                Order Summary
              </h2>
              
              {selectedPlan ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Plan</span>
                      <span className="text-white font-medium">{selectedPlan.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Location</span>
                      <span className="text-white font-medium">Brisbane, AU</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Monthly</span>
                      <span className="text-white font-medium">{formatCurrency(selectedPlan.priceMonthly)}</span>
                    </div>
                  </div>

                  <div className="border-t border-border/50 pt-4">
                    <Label htmlFor="hostname" className="text-sm text-muted-foreground">
                      Hostname (optional)
                    </Label>
                    <Input
                      id="hostname"
                      placeholder="my-server"
                      value={hostname}
                      onChange={(e) => setHostname(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      className="mt-1"
                      data-testid="input-hostname"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Lowercase letters, numbers, and hyphens only
                    </p>
                  </div>

                  <div className="border-t border-border/50 pt-4">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-muted-foreground">Your Balance</span>
                      <span className={`font-mono font-medium ${canAfford ? 'text-green-500' : 'text-red-500'}`}>
                        {formatCurrency(wallet?.balanceCents || 0)}
                      </span>
                    </div>

                    {canAfford ? (
                      <Button 
                        className="w-full gap-2" 
                        onClick={handleDeploy}
                        disabled={deployMutation.isPending}
                        data-testid="button-deploy"
                      >
                        {deployMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Zap className="h-4 w-4" />
                            Deploy Now
                          </>
                        )}
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-yellow-500 text-sm">
                          <AlertCircle className="h-4 w-4" />
                          <span>Insufficient balance</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          You need {formatCurrency((selectedPlan.priceMonthly) - (wallet?.balanceCents || 0))} more to deploy this server.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Server className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Select a plan to continue</p>
                </div>
              )}
            </GlassCard>

            {/* Wallet Top-up */}
            <GlassCard className="p-4">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                Add Funds
              </h2>
              
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  {[500, 1000, 2000, 5000, 10000, 20000].map((amount) => (
                    <Button
                      key={amount}
                      variant={topupAmount === amount ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTopupAmount(amount)}
                      className="font-mono"
                      data-testid={`button-topup-${amount}`}
                    >
                      ${amount / 100}
                    </Button>
                  ))}
                </div>
                
                <Button 
                  className="w-full gap-2" 
                  variant="secondary"
                  onClick={handleTopup}
                  disabled={topupMutation.isPending}
                  data-testid="button-topup-submit"
                >
                  {topupMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Add {formatCurrency(topupAmount)} to Wallet
                    </>
                  )}
                </Button>
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
