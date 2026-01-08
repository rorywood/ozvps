import { useEffect } from "react";
import { useRoute, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { VncViewer } from "@/components/vnc-viewer";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Loader2, Monitor, ArrowLeft, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { useConsoleLock } from "@/hooks/use-console-lock";
import { ConsoleLockedOverlay } from "@/components/console-locked-overlay";

export default function ServerConsole() {
  const [, params] = useRoute("/servers/:id/console");
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const serverId = params?.id;
  
  // Check if this is a popout window
  const isPopout = searchString.includes('popout=true');
  
  // Console lock for 15 seconds after boot
  const consoleLock = useConsoleLock(serverId || '');

  const { data: consoleData, isLoading, error, refetch } = useQuery({
    queryKey: ['console-url', serverId],
    queryFn: async () => {
      const result = await api.getConsoleUrl(serverId || '');
      return result;
    },
    enabled: !!serverId && !consoleLock.isLocked,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5,
  });

  // Set window title for popout
  useEffect(() => {
    if (isPopout) {
      document.title = `Console - Server ${serverId}`;
    }
  }, [isPopout, serverId]);

  // Cleanup VNC on window close for popout
  useEffect(() => {
    if (isPopout && serverId) {
      const handleBeforeUnload = () => {
        api.disableVnc(serverId).catch(() => {});
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  }, [isPopout, serverId]);

  const handleClose = () => {
    if (isPopout) {
      window.close();
    } else {
      setLocation(`/servers/${serverId}`);
    }
  };

  const handleDisconnect = async () => {
    if (serverId) {
      try {
        await api.disableVnc(serverId);
      } catch (e) {
        console.error('Failed to disable VNC:', e);
      }
    }
    // Auto-close popout on disconnect
    if (isPopout) {
      window.close();
    }
  };

  // Show console locked overlay during lock period
  if (consoleLock.isLocked) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <ConsoleLockedOverlay />
      </div>
    );
  }

  if (isLoading) {
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

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <GlassCard className="p-12 flex flex-col items-center max-w-md">
          <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Console Error</h3>
          <p className="text-muted-foreground text-center mb-4">
            Failed to initialize VNC console. Please try again.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => refetch()} className="border-white/10 hover:bg-white/5 text-white" data-testid="button-retry">
              Try Again
            </Button>
            {isPopout ? (
              <Button variant="outline" onClick={() => window.close()} className="border-white/10 hover:bg-white/5 text-white" data-testid="button-close-window">
                Close Window
              </Button>
            ) : (
              <Link href={`/servers/${serverId}`}>
                <Button variant="outline" className="border-white/10 hover:bg-white/5 text-white" data-testid="button-back-to-server">
                  Back to Server
                </Button>
              </Link>
            )}
          </div>
        </GlassCard>
      </div>
    );
  }

  if (consoleData?.embedded && consoleData?.vnc?.wsUrl) {
    return (
      <div className="h-screen bg-[#0a0a0a]">
        <VncViewer
          wsUrl={consoleData.vnc.wsUrl}
          password={consoleData.vnc.password}
          onClose={handleClose}
          onDisconnect={handleDisconnect}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <GlassCard className="p-12 flex flex-col items-center max-w-md">
        <Monitor className="h-12 w-12 text-primary mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">Console Unavailable</h3>
        <p className="text-muted-foreground text-center mb-4">
          Unable to initialize VNC console. The server may be powered off or VNC may not be supported.
        </p>
        {isPopout ? (
          <Button variant="outline" onClick={() => window.close()} className="border-white/10 hover:bg-white/5 text-white" data-testid="button-close-window">
            Close Window
          </Button>
        ) : (
          <Link href={`/servers/${serverId}`}>
            <Button variant="outline" className="border-white/10 hover:bg-white/5 text-white" data-testid="button-back-to-server">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Server
            </Button>
          </Link>
        )}
      </GlassCard>
    </div>
  );
}
