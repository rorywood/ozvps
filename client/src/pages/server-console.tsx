import { useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { AppShell } from "@/components/layout/app-shell";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Monitor, Maximize2, Minimize2 } from "lucide-react";
import { Link } from "wouter";

export default function ServerConsole() {
  const [, params] = useRoute("/servers/:id/console");
  const serverId = params?.id;
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <GlassCard className="p-12 flex flex-col items-center">
            <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
            <p className="text-muted-foreground">Enabling VNC console...</p>
          </GlassCard>
        </div>
      </AppShell>
    );
  }

  if (error || !consoleData?.url) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <GlassCard className="p-12 flex flex-col items-center max-w-md">
            <Monitor className="h-12 w-12 text-red-400 mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Console Unavailable</h3>
            <p className="text-muted-foreground text-center mb-4">
              Unable to enable VNC console. The server may be powered off or VNC may not be supported.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => refetch()} className="border-white/10 hover:bg-white/5">
                Try Again
              </Button>
              <Link href={`/servers/${serverId}`}>
                <Button variant="outline" className="border-white/10 hover:bg-white/5">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Server
                </Button>
              </Link>
            </div>
          </GlassCard>
        </div>
      </AppShell>
    );
  }

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          <Link href={`/servers/${serverId}`}>
            <Button variant="outline" size="sm" className="bg-black/50 border-white/20 text-white hover:bg-white/10">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Server
            </Button>
          </Link>
          <Button 
            variant="outline" 
            size="sm"
            className="bg-black/50 border-white/20 text-white hover:bg-white/10"
            onClick={() => setIsFullscreen(false)}
          >
            <Minimize2 className="h-4 w-4 mr-2" />
            Exit Fullscreen
          </Button>
        </div>
        <iframe
          src={consoleData.url}
          className="w-full h-full border-0"
          title="VNC Console"
          data-testid="console-iframe"
        />
      </div>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/servers/${serverId}`}>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-white" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-display font-bold text-white">VNC Console</h1>
              <p className="text-sm text-muted-foreground">
                <span className="text-green-400">Console ready</span>
              </p>
            </div>
          </div>
          <Button 
            variant="outline"
            className="border-white/10 hover:bg-white/5"
            onClick={() => setIsFullscreen(true)}
            data-testid="button-fullscreen"
          >
            <Maximize2 className="h-4 w-4 mr-2" />
            Fullscreen
          </Button>
        </div>

        <GlassCard className="p-0 overflow-hidden">
          <div className="relative" style={{ paddingBottom: '56.25%' }}>
            <iframe
              src={consoleData.url}
              className="absolute inset-0 w-full h-full border-0"
              title="VNC Console"
              data-testid="console-iframe"
            />
          </div>
        </GlassCard>

        <p className="text-xs text-muted-foreground text-center">
          The console session will automatically expire after 60 minutes of inactivity.
        </p>
      </div>
    </AppShell>
  );
}
