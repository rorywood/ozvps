import { GlassCard } from "@/components/ui/glass-card";
import { AppShell } from "@/components/layout/app-shell";
import { ShoppingCart, Clock } from "lucide-react";

export default function OrderPage() {
  return (
    <AppShell>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground" data-testid="text-page-title">
          Order VPS
        </h1>
        <p className="text-muted-foreground mt-1">
          Get a new virtual private server
        </p>
      </div>

      <GlassCard className="p-12">
        <div className="flex flex-col items-center justify-center text-center space-y-6">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl" />
            <div className="relative bg-primary/10 rounded-full p-6 border border-primary/20">
              <ShoppingCart className="h-12 w-12 text-primary" />
            </div>
          </div>
          
          <div className="space-y-2">
            <h2 className="text-xl font-display font-semibold text-foreground flex items-center justify-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              Coming Soon
            </h2>
            <p className="text-muted-foreground max-w-md">
              We're working on a seamless ordering experience. Soon you'll be able to purchase and deploy new VPS instances directly from this panel.
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
    </AppShell>
  );
}
