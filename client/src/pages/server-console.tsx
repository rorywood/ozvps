import { useEffect } from "react";
import { useRoute, useSearch } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Ban } from "lucide-react";
import { Link } from "wouter";
import { useConsoleLock } from "@/hooks/use-console-lock";
import { ConsoleLockedOverlay } from "@/components/console-locked-overlay";
import { useAuth } from "@/hooks/use-auth";

export default function ServerConsole() {
  const [, params] = useRoute("/servers/:id/console");
  const searchString = useSearch();
  const serverId = params?.id;
  const { user } = useAuth();

  // Check if this is a popout window
  const isPopout = searchString.includes('popout=true');

  // Console lock for 15 seconds after boot
  const consoleLock = useConsoleLock(serverId || '');

  // Set window title for popout
  useEffect(() => {
    if (isPopout) {
      document.title = `Console - Server ${serverId}`;
    }
  }, [isPopout, serverId]);

  // Navigate to the server-side VNC console once checks pass
  useEffect(() => {
    if (!serverId || consoleLock.isLocked || user?.accountSuspended) return;
    window.location.href = `/api/servers/${serverId}/vnc-console`;
  }, [serverId, consoleLock.isLocked, user?.accountSuspended]);

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

  // Loading state while navigating
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Card className="p-12 flex flex-col items-center">
        <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
        <p className="text-foreground font-medium mb-1">Opening Console</p>
        <p className="text-muted-foreground text-sm">Connecting to VNC...</p>
      </Card>
    </div>
  );
}
