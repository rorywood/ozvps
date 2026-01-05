import { useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Loader2, Monitor } from "lucide-react";

export default function ServerConsole() {
  const [, params] = useRoute("/servers/:id/console");
  const serverId = params?.id;

  const { data: consoleData, isLoading, error, refetch } = useQuery({
    queryKey: ['console-url', serverId],
    queryFn: async () => {
      const result = await api.getConsoleUrl(serverId || '');
      return result;
    },
    enabled: !!serverId,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (consoleData?.url) {
      window.location.replace(consoleData.url);
    }
  }, [consoleData?.url]);

  if (isLoading || consoleData?.url) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <GlassCard className="p-12 flex flex-col items-center">
          <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
          <p className="text-white font-medium mb-1">Connecting to Console</p>
          <p className="text-muted-foreground text-sm">Please wait...</p>
        </GlassCard>
      </div>
    );
  }

  if (error || !consoleData?.url) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <GlassCard className="p-12 flex flex-col items-center max-w-md">
          <Monitor className="h-12 w-12 text-red-400 mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Console Unavailable</h3>
          <p className="text-muted-foreground text-center mb-4">
            Unable to enable VNC console. The server may be powered off or VNC may not be supported.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => refetch()} className="border-white/10 hover:bg-white/5 text-white">
              Try Again
            </Button>
            <Button 
              variant="outline" 
              className="border-white/10 hover:bg-white/5 text-white"
              onClick={() => window.close()}
            >
              Close Window
            </Button>
          </div>
        </GlassCard>
      </div>
    );
  }

  return null;
}
