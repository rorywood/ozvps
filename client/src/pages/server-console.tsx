import { useRoute } from "wouter";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Monitor, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function ServerConsole() {
  const [, params] = useRoute("/servers/:id/console");
  const serverId = params?.id;

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <GlassCard className="p-12 flex flex-col items-center max-w-md">
        <Monitor className="h-12 w-12 text-primary mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">VNC Console</h3>
        <p className="text-muted-foreground text-center mb-4">
          The console opens in a separate window. If it didn't open, please go back and click the Console button again.
        </p>
        <p className="text-muted-foreground text-center text-sm mb-6">
          Make sure popup windows are allowed for this site.
        </p>
        <Link href={`/servers/${serverId}`}>
          <Button variant="outline" className="border-white/10 hover:bg-white/5 text-white" data-testid="button-back-to-server">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Server
          </Button>
        </Link>
      </GlassCard>
    </div>
  );
}
