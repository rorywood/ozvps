import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Loader2, Monitor, ExternalLink } from "lucide-react";
import { Link } from "wouter";

export default function ServerConsole() {
  const [, params] = useRoute("/servers/:id/console");
  const serverId = params?.id;
  const [status, setStatus] = useState<'loading' | 'authenticating' | 'opening' | 'done' | 'error'>('loading');

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
      return;
    }

    if (consoleData?.twoStep && consoleData?.authUrl && consoleData?.vncUrl) {
      setStatus('authenticating');
      
      // Use hidden iframe for authentication
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = consoleData.authUrl;
      document.body.appendChild(iframe);
      
      // Wait for auth to complete, then redirect to VNC
      setTimeout(() => {
        setStatus('opening');
        document.body.removeChild(iframe);
        window.location.replace(consoleData.vncUrl);
      }, 1500);
    }
  }, [consoleData]);

  if (isLoading || status === 'loading') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <GlassCard className="p-12 flex flex-col items-center">
          <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
          <p className="text-white font-medium mb-1">Initializing Console</p>
          <p className="text-muted-foreground text-sm">Enabling VNC access...</p>
        </GlassCard>
      </div>
    );
  }

  if (status === 'authenticating') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <GlassCard className="p-12 flex flex-col items-center">
          <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
          <p className="text-white font-medium mb-1">Authenticating...</p>
          <p className="text-muted-foreground text-sm">A new window opened for authentication</p>
        </GlassCard>
      </div>
    );
  }

  if (status === 'opening') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <GlassCard className="p-12 flex flex-col items-center">
          <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
          <p className="text-white font-medium mb-1">Opening VNC Console</p>
          <p className="text-muted-foreground text-sm">Redirecting...</p>
        </GlassCard>
      </div>
    );
  }

  if (error || (!consoleData?.url && !consoleData?.twoStep)) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <GlassCard className="p-12 flex flex-col items-center max-w-md">
          <Monitor className="h-12 w-12 text-red-400 mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Console Unavailable</h3>
          <p className="text-muted-foreground text-center mb-4">
            Unable to enable VNC console. The server may be powered off or VNC may not be supported.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => refetch()} className="border-white/10 hover:bg-white/5 text-white" data-testid="button-retry">
              Try Again
            </Button>
            <Link href={`/servers/${serverId}`}>
              <Button variant="outline" className="border-white/10 hover:bg-white/5 text-white" data-testid="button-back-to-server">
                Back to Server
              </Button>
            </Link>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (consoleData?.vncUrl) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <GlassCard className="p-12 flex flex-col items-center max-w-md">
          <Monitor className="h-12 w-12 text-primary mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">VNC Console Ready</h3>
          <p className="text-muted-foreground text-center mb-4">
            If the console didn't open automatically, click below to access it.
          </p>
          <a href={consoleData.vncUrl} target="_blank" rel="noopener noreferrer">
            <Button className="bg-primary hover:bg-primary/90" data-testid="button-open-vnc">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open VNC Console
            </Button>
          </a>
          <Link href={`/servers/${serverId}`} className="mt-4">
            <Button variant="ghost" className="text-muted-foreground hover:text-white" data-testid="button-back">
              Back to Server
            </Button>
          </Link>
        </GlassCard>
      </div>
    );
  }

  return null;
}
