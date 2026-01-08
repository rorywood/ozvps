import { useQuery } from "@tanstack/react-query";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Server, Cpu, HardDrive, Activity, Zap, LogIn, Loader2 } from "lucide-react";
import { Link } from "wouter";
import logo from "@/assets/logo.png";
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

export default function PricingPage() {
  const { data: authData } = useQuery({
    queryKey: ['auth'],
    queryFn: () => api.getAuthUser(),
    retry: false,
  });

  const { data: plansData, isLoading } = useQuery<{ plans: Plan[] }>({
    queryKey: ['plans'],
    queryFn: () => api.getPlans(),
  });

  const isLoggedIn = !!authData?.user;
  const plans = plansData?.plans || [];

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col items-center mb-12">
          <Link href={isLoggedIn ? "/dashboard" : "/login"}>
            <img src={logo} alt="OzVPS" className="h-16 w-auto mb-6 cursor-pointer" data-testid="img-logo" />
          </Link>
          <h1 className="text-3xl font-display font-bold text-foreground text-center" data-testid="text-page-title">
            VPS Pricing
          </h1>
          <p className="text-muted-foreground text-center mt-2 max-w-lg">
            High-performance virtual private servers powered by Australian infrastructure.
            Pay as you go with our prepaid wallet system.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {plans.map((plan) => (
              <GlassCard key={plan.id} className="p-6" data-testid={`card-plan-${plan.code}`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">{plan.name}</h3>
                    <p className="text-3xl font-bold text-primary mt-1">
                      {formatCurrency(plan.priceMonthly)}
                      <span className="text-sm font-normal text-muted-foreground">/mo</span>
                    </p>
                  </div>
                  <div className="bg-primary/10 rounded-full p-2 border border-primary/20">
                    <Server className="h-5 w-5 text-primary" />
                  </div>
                </div>
                
                <div className="space-y-3 text-sm text-muted-foreground mb-6">
                  <div className="flex items-center gap-3">
                    <Cpu className="h-4 w-4 text-primary/70" />
                    <span>{plan.vcpu} vCPU Core{plan.vcpu > 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Zap className="h-4 w-4 text-primary/70" />
                    <span>{formatRAM(plan.ramMb)} RAM</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <HardDrive className="h-4 w-4 text-primary/70" />
                    <span>{plan.storageGb} GB NVMe Storage</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Activity className="h-4 w-4 text-primary/70" />
                    <span>{(plan.transferGb / 1000).toFixed(0)} TB Monthly Transfer</span>
                  </div>
                </div>

                <Link href={isLoggedIn ? "/deploy" : "/login"}>
                  <Button className="w-full gap-2" data-testid={`button-select-${plan.code}`}>
                    <Zap className="h-4 w-4" />
                    {isLoggedIn ? "Deploy Now" : "Get Started"}
                  </Button>
                </Link>
              </GlassCard>
            ))}
          </div>
        )}

        <GlassCard className="p-8 text-center">
          <h2 className="text-xl font-semibold text-foreground mb-4">Ready to get started?</h2>
          {isLoggedIn ? (
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Deploy your server instantly with our prepaid wallet system.
              </p>
              <Link href="/deploy">
                <Button size="lg" className="gap-2" data-testid="button-deploy-cta">
                  <Zap className="h-5 w-5" />
                  Go to Deploy
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Sign in or create an account to deploy your first VPS.
              </p>
              <Link href="/login">
                <Button size="lg" className="gap-2" data-testid="button-login-cta">
                  <LogIn className="h-5 w-5" />
                  Sign In to Continue
                </Button>
              </Link>
            </div>
          )}
        </GlassCard>

        <p className="text-center text-sm text-muted-foreground mt-8">
          All prices in AUD. Need help? Contact support@ozvps.com
        </p>
      </div>
    </div>
  );
}
