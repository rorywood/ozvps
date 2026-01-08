import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams, useSearch } from "wouter";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppShell } from "@/components/layout/app-shell";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft,
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
import { getOsLogoUrl, FALLBACK_LOGO } from "@/lib/os-logos";

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

export default function DeployConfigurePage() {
  const [, setLocation] = useLocation();
  const params = useParams<{ planId: string }>();
  const search = useSearch();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const planId = parseInt(params.planId || "0", 10);
  const searchParams = new URLSearchParams(search);
  const locationCode = searchParams.get("location") || "BNE";

  const [selectedOsId, setSelectedOsId] = useState<number | null>(null);
  const [hostname, setHostname] = useState("");
  const [hostnameError, setHostnameError] = useState("");

  const { data: plansData, isLoading: loadingPlans } = useQuery<{ plans: Plan[] }>({
    queryKey: ['plans'],
    queryFn: () => api.getPlans(),
  });

  const { data: templatesData, isLoading: loadingTemplates } = useQuery<TemplateGroup[]>({
    queryKey: ['plan-templates', planId],
    queryFn: () => api.getPlanTemplates(planId),
    enabled: planId > 0,
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
    mutationFn: (data: { planId: number; osId: number; hostname: string; locationCode?: string }) => api.deployServer(data),
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

  const plan = (plansData?.plans || []).find(p => p.id === planId);
  const wallet = walletData?.wallet;
  const canAfford = wallet && plan && wallet.balanceCents >= plan.priceMonthly;
  const templates = templatesData || [];

  const validateHostname = (value: string): boolean => {
    if (!value || value.length === 0) {
      setHostnameError("Hostname is required");
      return false;
    }
    if (value.length > 63) {
      setHostnameError("Hostname must be 63 characters or less");
      return false;
    }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(value)) {
      setHostnameError("Hostname must start and end with a letter or number, and contain only letters, numbers, and hyphens");
      return false;
    }
    setHostnameError("");
    return true;
  };

  const handleHostnameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase();
    setHostname(value);
    if (value) {
      validateHostname(value);
    } else {
      setHostnameError("");
    }
  };

  const handleDeploy = () => {
    if (!plan || !selectedOsId) return;
    
    if (!validateHostname(hostname)) {
      return;
    }
    
    deployMutation.mutate({
      planId: plan.id,
      osId: selectedOsId,
      hostname: hostname,
      locationCode,
    });
  };

  const handleTopupAndDeploy = () => {
    if (!plan || !wallet) return;
    const shortfall = plan.priceMonthly - wallet.balanceCents;
    const topupNeeded = Math.max(shortfall, 500);
    topupMutation.mutate(topupNeeded);
  };

  if (loadingPlans) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (!plan) {
    return (
      <AppShell>
        <div className="text-center py-20">
          <h2 className="text-xl font-semibold text-foreground mb-2">Plan not found</h2>
          <p className="text-muted-foreground mb-4">The selected plan does not exist or is inactive.</p>
          <Button onClick={() => setLocation("/deploy")} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Plans
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setLocation("/deploy")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground" data-testid="text-page-title">
              Configure Server
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Choose operating system and hostname
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <GlassCard className="p-5">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                Hostname
              </h2>
              <div className="space-y-2">
                <Label htmlFor="hostname">Server Hostname</Label>
                <Input
                  id="hostname"
                  placeholder="my-server"
                  value={hostname}
                  onChange={handleHostnameChange}
                  className={hostnameError ? "border-red-500" : ""}
                  data-testid="input-hostname"
                />
                {hostnameError ? (
                  <p className="text-xs text-red-500">{hostnameError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Lowercase letters, numbers, and hyphens only. Must start and end with a letter or number.
                  </p>
                )}
              </div>
            </GlassCard>

            <GlassCard className="p-5">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                Operating System
              </h2>
              
              {loadingTemplates ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 text-primary animate-spin" />
                </div>
              ) : templates.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No operating systems available for this plan.
                </p>
              ) : (
                <div className="space-y-6">
                  {templates.map((group, groupIndex) => (
                    <div key={groupIndex}>
                      <h3 className="text-sm font-medium text-foreground mb-3">{group.name}</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {group.templates.map((template) => (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => setSelectedOsId(template.id)}
                            className={`relative flex items-center gap-3 p-4 rounded-lg border transition-all text-left ${
                              selectedOsId === template.id
                                ? 'bg-primary/10 border-primary ring-1 ring-primary'
                                : 'bg-muted/10 border-border hover:border-border'
                            }`}
                            data-testid={`radio-os-${template.id}`}
                          >
                            <img 
                              src={getOsLogoUrl({ id: template.id, name: template.name, group: group.name })}
                              alt={template.name}
                              className="h-6 w-6 object-contain"
                              onError={(e) => { e.currentTarget.src = FALLBACK_LOGO; }}
                            />
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-foreground block truncate">
                                {template.name}
                              </span>
                              {template.version && (
                                <span className="text-xs text-muted-foreground">{template.version}</span>
                              )}
                            </div>
                            {selectedOsId === template.id && (
                              <div className="absolute top-2 right-2 bg-primary rounded-full p-0.5">
                                <Check className="h-3 w-3 text-primary-foreground" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </div>

          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-6">
              <GlassCard className="p-5">
                <h2 className="text-lg font-semibold text-foreground mb-4">Summary</h2>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Plan</span>
                    <span className="text-foreground font-medium">{plan.name}</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs pb-4 border-b border-border">
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

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Hostname</span>
                    <span className="text-foreground font-mono text-xs">
                      {hostname || <span className="text-muted-foreground italic">Not set</span>}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Operating System</span>
                    <span className="text-foreground text-xs">
                      {selectedOsId ? (
                        templates.flatMap(g => g.templates).find(t => t.id === selectedOsId)?.name || 'Selected'
                      ) : (
                        <span className="text-muted-foreground italic">Not selected</span>
                      )}
                    </span>
                  </div>
                  
                  <div className="border-t border-border pt-4 space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Monthly price</span>
                      <span className="font-mono font-medium text-foreground">
                        {formatCurrency(plan.priceMonthly)}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Balance</span>
                      <span className={`font-mono font-medium ${canAfford ? 'text-green-500' : 'text-foreground'}`}>
                        {loadingWallet ? "..." : formatCurrency(wallet?.balanceCents || 0)}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-foreground font-medium">Due now</span>
                      <span className="font-mono font-bold text-lg text-primary">
                        {formatCurrency(plan.priceMonthly)}
                      </span>
                    </div>
                  </div>
                  
                  <div className="pt-2">
                    {!selectedOsId || !hostname ? (
                      <Button 
                        className="w-full h-11" 
                        disabled 
                        data-testid="button-deploy-disabled"
                      >
                        {!hostname ? 'Enter hostname' : 'Select OS'}
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
