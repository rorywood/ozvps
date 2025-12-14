import { AppShell } from "@/components/layout/app-shell";
import { GlassCard } from "@/components/ui/glass-card";
import { 
  Network, 
  Globe, 
  Construction
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function Networking() {
  return (
    <AppShell>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-white mb-2" data-testid="text-page-title">Networking</h1>
          <p className="text-muted-foreground">Manage IP addresses and network settings</p>
        </div>

        <GlassCard className="p-12 flex flex-col items-center justify-center" data-testid="networking-coming-soon">
          <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <Network className="h-10 w-10 text-primary" />
          </div>
          <h3 className="text-xl font-display font-medium text-white mb-2">Networking Features</h3>
          <p className="text-muted-foreground text-center max-w-md mb-6">
            IP address management and network configuration will be available once you have VPS servers deployed.
          </p>
          <Link href="/provision">
            <Button className="bg-primary hover:bg-primary/90" data-testid="button-deploy-server">
              <Globe className="h-4 w-4 mr-2" />
              Deploy a Server First
            </Button>
          </Link>
        </GlassCard>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white">IPv4 Addresses</h3>
                <p className="text-sm text-muted-foreground">Dedicated public IPs</p>
              </div>
            </div>
            <p className="text-muted-foreground text-sm">
              Each VPS receives a dedicated IPv4 address. Additional IPs can be requested for your servers.
            </p>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20">
                <Network className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Private Networking</h3>
                <p className="text-sm text-muted-foreground">Internal server communication</p>
              </div>
            </div>
            <p className="text-muted-foreground text-sm">
              Connect your VPS servers privately with internal networking for secure, fast communication.
            </p>
          </GlassCard>
        </div>
      </div>
    </AppShell>
  );
}
