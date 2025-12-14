import { AppShell } from "@/components/layout/app-shell";
import { GlassCard } from "@/components/ui/glass-card";
import { locations, plans, osImages } from "@/lib/mock-data";
import { 
  Server, 
  MapPin, 
  Cpu, 
  Globe,
  Check,
  CreditCard,
  Rocket
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useLocation } from "wouter";

export default function Provision() {
  const [, setLocation] = useLocation();
  const [selectedLocation, setSelectedLocation] = useState(locations[0].id);
  const [selectedPlan, setSelectedPlan] = useState(plans[1].id);
  const [selectedOS, setSelectedOS] = useState(osImages[0].id);
  const [hostname, setHostname] = useState("");
  const [deploying, setDeploying] = useState(false);

  const handleDeploy = () => {
    setDeploying(true);
    setTimeout(() => {
      setDeploying(false);
      setLocation("/servers");
    }, 2000);
  };

  const currentPlan = plans.find(p => p.id === selectedPlan) || plans[0];

  return (
    <AppShell>
      <div className="space-y-8 pb-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-white mb-2">Deploy New Server</h1>
            <p className="text-muted-foreground">Configure and provision your new virtual machine</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            
            {/* 1. Location Selection */}
            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-white flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold border border-primary/30">1</span>
                Choose Location
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {locations.map((loc) => (
                  <GlassCard 
                    key={loc.id}
                    variant="interactive"
                    className={cn(
                      "p-4 flex flex-col items-center justify-center gap-3 text-center h-32 border-2",
                      selectedLocation === loc.id 
                        ? "border-primary bg-primary/10 shadow-[0_0_20px_rgba(59,130,246,0.15)]" 
                        : "border-transparent hover:border-white/20"
                    )}
                    onClick={() => setSelectedLocation(loc.id)}
                  >
                    <span className="text-3xl filter drop-shadow-lg">{loc.flag}</span>
                    <span className={cn("font-medium", selectedLocation === loc.id ? "text-primary" : "text-white")}>
                      {loc.name.split('(')[0]}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">{loc.id.toUpperCase()}</span>
                  </GlassCard>
                ))}
              </div>
            </section>

            {/* 2. OS Selection */}
             <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-white flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold border border-primary/30">2</span>
                Select Image
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {osImages.map((os) => (
                  <GlassCard 
                    key={os.id}
                    variant="interactive"
                    className={cn(
                      "p-4 flex items-center gap-3 border-2",
                      selectedOS === os.id 
                        ? "border-primary bg-primary/10 shadow-[0_0_20px_rgba(59,130,246,0.15)]" 
                        : "border-transparent hover:border-white/20"
                    )}
                    onClick={() => setSelectedOS(os.id)}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded flex items-center justify-center font-bold text-white",
                      os.type === 'linux' ? "bg-orange-500" : "bg-blue-500"
                    )}>
                      {os.name.substring(0, 1)}
                    </div>
                    <div className="text-left">
                       <span className={cn("font-medium block text-sm", selectedOS === os.id ? "text-primary" : "text-white")}>
                        {os.name}
                      </span>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </section>

             {/* 3. Plan Selection */}
             <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-white flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold border border-primary/30">3</span>
                Choose Plan
              </h2>
              <div className="grid grid-cols-1 gap-3">
                {plans.map((plan) => (
                  <GlassCard 
                    key={plan.id}
                    variant="interactive"
                    className={cn(
                      "p-4 flex items-center justify-between border-2",
                      selectedPlan === plan.id 
                        ? "border-primary bg-primary/10 shadow-[0_0_20px_rgba(59,130,246,0.15)]" 
                        : "border-transparent hover:border-white/20"
                    )}
                    onClick={() => setSelectedPlan(plan.id)}
                  >
                    <div className="flex items-center gap-4">
                       <div className={cn(
                        "h-10 w-10 rounded-lg flex items-center justify-center",
                        selectedPlan === plan.id ? "bg-primary text-white" : "bg-white/10 text-muted-foreground"
                      )}>
                        <Server className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className={cn("font-bold", selectedPlan === plan.id ? "text-white" : "text-white")}>{plan.name}</h3>
                        <p className="text-sm text-muted-foreground">{plan.cpu} vCPU • {plan.ram} RAM • {plan.disk} NVMe</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-white font-display">${plan.price}<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
                      <div className="text-xs text-muted-foreground">${(plan.price / 720).toFixed(3)}/hr</div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </section>

             {/* 4. Details */}
             <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-white flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold border border-primary/30">4</span>
                Finalize
              </h2>
              <GlassCard className="p-6">
                 <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="hostname">Hostname</Label>
                      <Input 
                        id="hostname"
                        placeholder="e.g. web-server-01" 
                        value={hostname}
                        onChange={(e) => setHostname(e.target.value)}
                        className="bg-black/20 border-white/10 focus-visible:ring-primary/50 text-white placeholder:text-muted-foreground/50"
                      />
                      <p className="text-xs text-muted-foreground">Valid domain name or label required.</p>
                    </div>
                 </div>
              </GlassCard>
            </section>

          </div>

          {/* Sticky Summary */}
          <div className="lg:col-span-1">
             <div className="sticky top-6">
               <GlassCard className="p-6 space-y-6 border-primary/20 bg-card/60">
                  <h3 className="font-display font-bold text-lg text-white">Order Summary</h3>
                  
                  <div className="space-y-4 text-sm">
                    <div className="flex justify-between items-center pb-4 border-b border-white/5">
                      <span className="text-muted-foreground">Location</span>
                      <span className="text-white font-medium flex items-center gap-2">
                        {locations.find(l => l.id === selectedLocation)?.flag} {locations.find(l => l.id === selectedLocation)?.name.split('(')[0]}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pb-4 border-b border-white/5">
                      <span className="text-muted-foreground">Image</span>
                      <span className="text-white font-medium">{osImages.find(o => o.id === selectedOS)?.name}</span>
                    </div>
                    <div className="flex justify-between items-center pb-4 border-b border-white/5">
                      <span className="text-muted-foreground">Plan</span>
                      <span className="text-white font-medium">{currentPlan.name}</span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <div className="flex justify-between items-end mb-1">
                      <span className="text-lg font-medium text-white">Total</span>
                      <span className="text-3xl font-display font-bold text-primary">${currentPlan.price}<span className="text-sm text-muted-foreground font-sans font-normal">/mo</span></span>
                    </div>
                     <p className="text-xs text-muted-foreground text-right">Includes taxes and fees</p>
                  </div>

                  <Button 
                    className="w-full h-12 text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_20px_rgba(59,130,246,0.3)] border-0 transition-all active:scale-[0.98]"
                    disabled={!hostname || deploying}
                    onClick={handleDeploy}
                  >
                    {deploying ? (
                      <span className="flex items-center gap-2">
                        <Rocket className="h-5 w-5 animate-bounce" /> Deploying...
                      </span>
                    ) : (
                      "Deploy Now"
                    )}
                  </Button>
               </GlassCard>
             </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
