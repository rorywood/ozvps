import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { AppShell } from "@/components/layout/app-shell";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Monitor, ExternalLink, Copy, Check } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function ServerConsole() {
  const [, params] = useRoute("/servers/:id/console");
  const serverId = params?.id;
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);

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

  const handleOpenConsole = () => {
    if (consoleData?.url) {
      window.open(consoleData.url, '_blank', 'width=1024,height=768,menubar=no,toolbar=no');
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
    toast({
      title: "Copied",
      description: `${label} copied to clipboard`,
    });
  };

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

  const vnc = consoleData.vnc;

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
                {vnc?.enabled ? (
                  <span className="text-green-400">Console enabled</span>
                ) : (
                  <span className="text-yellow-400">Console ready</span>
                )}
              </p>
            </div>
          </div>
        </div>

        <GlassCard className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500 border border-green-500/20">
              <Monitor className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Console Access</h3>
              <p className="text-sm text-muted-foreground">Connect to your server's console</p>
            </div>
          </div>

          <div className="space-y-4">
            <Button 
              onClick={handleOpenConsole}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-open-console"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Console in New Window
            </Button>

            {vnc && (
              <div className="border-t border-white/10 pt-4">
                <h4 className="text-sm font-medium text-muted-foreground mb-3">Connection Details (for VNC clients)</h4>
                <div className="grid gap-3">
                  <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-white/5">
                    <div>
                      <div className="text-xs text-muted-foreground">IP Address</div>
                      <div className="text-white font-mono">{vnc.ip}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-white"
                      onClick={() => copyToClipboard(vnc.ip, 'IP')}
                    >
                      {copied === 'IP' ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-white/5">
                    <div>
                      <div className="text-xs text-muted-foreground">Port</div>
                      <div className="text-white font-mono">{vnc.port}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-white"
                      onClick={() => copyToClipboard(String(vnc.port), 'Port')}
                    >
                      {copied === 'Port' ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-white/5">
                    <div>
                      <div className="text-xs text-muted-foreground">Password</div>
                      <div className="text-white font-mono">{vnc.password}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-white"
                      onClick={() => copyToClipboard(vnc.password, 'Password')}
                    >
                      {copied === 'Password' ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </GlassCard>

        <p className="text-xs text-muted-foreground text-center">
          The console session will automatically expire after 60 minutes of inactivity.
        </p>
      </div>
    </AppShell>
  );
}
