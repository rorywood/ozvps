import { AppShell } from "@/components/layout/app-shell";
import { GlassCard } from "@/components/ui/glass-card";
import { 
  CreditCard, 
  Receipt, 
  Wallet
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Billing() {
  return (
    <AppShell>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-white mb-2" data-testid="text-page-title">Billing</h1>
          <p className="text-muted-foreground">View invoices and manage payment methods</p>
        </div>

        <GlassCard className="p-12 flex flex-col items-center justify-center" data-testid="billing-coming-soon">
          <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <CreditCard className="h-10 w-10 text-primary" />
          </div>
          <h3 className="text-xl font-display font-medium text-white mb-2">Billing & Invoices</h3>
          <p className="text-muted-foreground text-center max-w-md mb-6">
            Billing information and invoices will appear here once you have active services. Manage your billing through your VirtFusion account.
          </p>
          <Button variant="outline" className="border-white/10 hover:bg-white/5" data-testid="button-virtfusion-billing" asChild>
            <a href="https://vps.cloudasn.com" target="_blank" rel="noopener noreferrer">
              <Wallet className="h-4 w-4 mr-2" />
              Open VirtFusion Panel
            </a>
          </Button>
        </GlassCard>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500 border border-green-500/20">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Account Balance</h3>
                <p className="text-sm text-muted-foreground">Prepaid credits</p>
              </div>
            </div>
            <p className="text-muted-foreground text-sm">
              Add funds to your account and pay-as-you-go for server usage.
            </p>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Invoices</h3>
                <p className="text-sm text-muted-foreground">Billing history</p>
              </div>
            </div>
            <p className="text-muted-foreground text-sm">
              View and download past invoices for your accounting needs.
            </p>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Payment Methods</h3>
                <p className="text-sm text-muted-foreground">Cards & accounts</p>
              </div>
            </div>
            <p className="text-muted-foreground text-sm">
              Manage your payment methods for automatic billing.
            </p>
          </GlassCard>
        </div>
      </div>
    </AppShell>
  );
}
