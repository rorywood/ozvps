import { useEffect, useState } from "react";
import { useRoute, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Monitor, ArrowLeft, AlertCircle, Ban } from "lucide-react";
import { Link } from "wouter";
import { useConsoleLock } from "@/hooks/use-console-lock";
import { ConsoleLockedOverlay } from "@/components/console-locked-overlay";
import { useAuth } from "@/hooks/use-auth";

// Build noVNC URL from WebSocket URL and password
function buildNoVncUrl(wsUrl: string, password: string): string {
  const url = new URL(wsUrl);
  const host = url.hostname;
  const port = url.port || (url.protocol === 'wss:' ? '443' : '80');
  const path = url.pathname.replace(/^\//, ''); // Remove leading slash
  const encrypt = url.protocol === 'wss:' ? '1' : '0';

  // Use hash fragment for password (more secure - not sent to server in logs)
  const queryParams = new URLSearchParams({
    host,
    port,
    encrypt,
    autoconnect: '1',
    resize: 'scale',
    reconnect: '1',
    reconnect_delay: '2000',
  });

  // Password and path go in hash fragment for security
  const hashParams = new URLSearchParams({
    path,
    password,
  });

  return `/novnc/vnc.html?${queryParams.toString()}#${hashParams.toString()}`;
}

export default function ServerConsole() {
  const [, params] = useRoute("/servers/:id/console");
  const searchString = useSearch();
  const serverId = params?.id;
  const { user } = useAuth();
  const [redirected, setRedirected] = useState(false);

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
    enabled: !!serverId && !consoleLock.isLocked && !user?.accountSuspended,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5,
  });

  // Set window title for popout
  useEffect(() => {
    if (isPopout) {
      document.title = `Console - Server ${serverId}`;
    }
  }, [isPopout, serverId]);

  // Redirect to noVNC when we have the console data
  useEffect(() => {
    if (consoleData?.embedded && consoleData?.vnc?.wsUrl && !redirected) {
      const noVncUrl = buildNoVncUrl(consoleData.vnc.wsUrl, consoleData.vnc.password);
      setRedirected(true);
      window.location.href = noVncUrl;
    }
  }, [consoleData, redirected]);

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

  // Show redirecting state while we navigate to noVNC
  if (consoleData?.embedded && consoleData?.vnc?.wsUrl) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="p-12 flex flex-col items-center">
          <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
          <p className="text-foreground font-medium mb-1">Opening Console</p>
          <p className="text-muted-foreground text-sm">Redirecting to noVNC...</p>
        </Card>
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
