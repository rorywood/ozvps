import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Clock, LogIn } from "lucide-react";
import { Link } from "wouter";
import logo from "@/assets/logo.png";

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col items-center mb-12">
          <img src={logo} alt="OzVPS" className="h-16 w-auto mb-6" data-testid="img-logo" />
          <h1 className="text-3xl font-display font-bold text-white text-center" data-testid="text-page-title">
            Order a VPS
          </h1>
          <p className="text-muted-foreground text-center mt-2">
            High-performance virtual private servers
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
              <h2 className="text-xl font-display font-semibold text-white flex items-center justify-center gap-2">
                <Clock className="h-5 w-5 text-yellow-500" />
                Coming Soon
              </h2>
              <p className="text-muted-foreground max-w-md">
                We're working on a seamless ordering experience. Soon you'll be able to purchase and deploy new VPS instances directly from here.
              </p>
            </div>

            <div className="pt-4">
              <Link href="/login">
                <Button className="gap-2" data-testid="button-login">
                  <LogIn className="h-4 w-4" />
                  Already have an account? Sign In
                </Button>
              </Link>
            </div>
          </div>
        </GlassCard>

        <p className="text-center text-sm text-muted-foreground mt-8">
          Need help? Contact support@ozvps.com
        </p>
      </div>
    </div>
  );
}
