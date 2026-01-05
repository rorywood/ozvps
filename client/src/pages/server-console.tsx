import { useEffect, useState, useRef } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Loader2, Monitor, CheckCircle } from "lucide-react";
import { Link } from "wouter";

export default function ServerConsole() {
  const [, params] = useRoute("/servers/:id/console");
  const serverId = params?.id;
  const [authStatus, setAuthStatus] = useState<'loading' | 'authenticating' | 'redirecting' | 'error'>('loading');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hasStartedAuth = useRef(false);

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

    if (consoleData?.twoStep && consoleData?.authUrl && consoleData?.vncUrl && !hasStartedAuth.current) {
      hasStartedAuth.current = true;
      setAuthStatus('authenticating');
      
      const iframe = iframeRef.current;
      const vncUrl = consoleData.vncUrl;
      if (iframe && vncUrl) {
        iframe.src = consoleData.authUrl;
        
        const handleLoad = () => {
          setAuthStatus('redirecting');
          setTimeout(() => {
            window.location.replace(vncUrl);
          }, 500);
        };
        
        iframe.addEventListener('load', handleLoad);
        
        const timeout = setTimeout(() => {
          setAuthStatus('redirecting');
          window.location.replace(vncUrl);
        }, 3000);
        
        return () => {
          iframe.removeEventListener('load', handleLoad);
          clearTimeout(timeout);
        };
      }
    }
  }, [consoleData]);

  if (isLoading || authStatus === 'loading') {
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

  if (authStatus === 'authenticating') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <GlassCard className="p-12 flex flex-col items-center">
          <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
          <p className="text-white font-medium mb-1">Authenticating...</p>
          <p className="text-muted-foreground text-sm">Setting up secure session</p>
        </GlassCard>
        <iframe 
          ref={iframeRef}
          style={{ display: 'none' }}
          title="auth-frame"
        />
      </div>
    );
  }

  if (authStatus === 'redirecting' || consoleData?.url || consoleData?.twoStep) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <GlassCard className="p-12 flex flex-col items-center">
          <CheckCircle className="h-8 w-8 text-green-400 mb-4" />
          <p className="text-white font-medium mb-1">Opening VNC Console</p>
          <p className="text-muted-foreground text-sm">Redirecting to console...</p>
        </GlassCard>
        <iframe 
          ref={iframeRef}
          style={{ display: 'none' }}
          title="auth-frame"
        />
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

  return null;
}
