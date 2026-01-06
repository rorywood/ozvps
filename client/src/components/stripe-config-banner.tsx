import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";

export function StripeConfigBanner() {
  const { data: stripeStatus, isLoading } = useQuery({
    queryKey: ['stripe-status'],
    queryFn: () => api.getStripeStatus(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (isLoading || !stripeStatus || stripeStatus.configured) {
    return null;
  }

  return (
    <div 
      className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 px-4 py-2 flex items-center gap-3 text-sm"
      data-testid="banner-stripe-not-configured"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2">
        <span className="font-medium">Stripe payments not configured</span>
        <span className="text-yellow-500/70 text-xs sm:text-sm">Connect Stripe in Integrations to enable top-ups</span>
      </div>
    </div>
  );
}
