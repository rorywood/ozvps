import { useEffect } from "react";
import { useRoute, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { VncViewer } from "@/components/vnc-viewer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Monitor, ArrowLeft, AlertCircle, Ban } from "lucide-react";
import { Link } from "wouter";
import { useConsoleLock } from "@/hooks/use-console-lock";
import { ConsoleLockedOverlay } from "@/components/console-locked-overlay";
import { useAuth } from "@/hooks/use-auth";

export default function ServerConsole() {
  const [, params] = useRoute("/servers/:id/console");
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const serverId = params?.id;
  const { user } = useAuth();

  // Check if this is a popout window
  const isPopout = searchString.includes('popout=true');

  // Check if account is suspended - show blocked message
  if (user?.accountSuspended) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-6">
          <div className="flex items-start gap-4">
            <Ban className="h-6 w-6 text-destructive flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h2 className="text-xl font-bold text-foreground mb-2">
                Account Suspended
              </h2>
              <p className="text-muted-foreground mb-4">
                Your account has been suspended and you cannot access the console at this time.
              </p>
              {user.accountSuspendedReason && (
                <div className="bg-destructive/10 rounded p-3 mb-4">
                  <p className="text-xs uppercase text-muted-foreground mb-1">Reason:</p>
                  <p className="text-sm text-foreground">{user.accountSuspendedReason}</p>
                </div>
              )}
              <Button variant="outline" asChild className="w-full">
                <Link href="/support">Contact Support</Link>
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }
  
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

  // Cleanup VNC on component unmount (navigating away) or window close
  useEffect(() => {
    if (!serverId) return;

    const disableVncWithKeepalive = () => {
      // Use fetch with keepalive for reliable cleanup during page unload
      // This ensures the request completes even if the page is closing
      const csrfToken = document.cookie.split('; ').find(c => c.startsWith('ozvps_csrf='))?.split('=')[1] || '';

      fetch(`/api/servers/${serverId}/vnc/disable`, {
        method: 'POST',
        keepalive: true,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
      }).catch(() => {});
    };

    const handleBeforeUnload = () => {
      disableVncWithKeepalive();
    };

    // Add beforeunload listener for popout window close
    if (isPopout) {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    // Cleanup function runs when component unmounts (user navigates away)
    return () => {
      if (isPopout) {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
      // Disable VNC when navigating away from console (embedded or popout)
      api.disableVnc(serverId).catch(() => {});
    };
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
      <div className="min-h-screen bg-background">
        <ConsoleLockedOverlay />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="p-12 flex flex-col items-center">
          <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
          <p className="text-foreground font-medium mb-1">Initializing Console</p>
          <p className="text-muted-foreground text-sm">Enabling VNC access...</p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="p-12 flex flex-col items-center max-w-md">
          <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Console Error</h3>
          <p className="text-muted-foreground text-center mb-4">
            Failed to initialize VNC console. Please try again.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => refetch()} className="border-border hover:bg-muted/50 text-foreground" data-testid="button-retry">
              Try Again
            </Button>
            {isPopout ? (
              <Button variant="outline" onClick={() => window.close()} className="border-border hover:bg-muted/50 text-foreground" data-testid="button-close-window">
                Close Window
              </Button>
            ) : (
              <Link href={`/servers/${serverId}`}>
                <Button variant="outline" className="border-border hover:bg-muted/50 text-foreground" data-testid="button-back-to-server">
                  Back to Server
                </Button>
              </Link>
            )}
          </div>
        </Card>
      </div>
    );
  }

  if (consoleData?.embedded && consoleData?.vnc?.wsUrl) {
    return (
      <div className="h-screen bg-background">
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
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Card className="p-12 flex flex-col items-center max-w-md">
        <Monitor className="h-12 w-12 text-primary mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Console Unavailable</h3>
        <p className="text-muted-foreground text-center mb-4">
          Unable to initialize VNC console. The server may be powered off or VNC may not be supported.
        </p>
        {isPopout ? (
          <Button variant="outline" onClick={() => window.close()} className="border-border hover:bg-muted/50 text-foreground" data-testid="button-close-window">
            Close Window
          </Button>
        ) : (
          <Link href={`/servers/${serverId}`}>
            <Button variant="outline" className="border-border hover:bg-muted/50 text-foreground" data-testid="button-back-to-server">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Server
            </Button>
          </Link>
        )}
      </Card>
    </div>
  );
}
