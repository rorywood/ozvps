import { AppShell } from "@/components/layout/app-shell";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { 
  User, 
  Shield, 
  Key, 
  ExternalLink
} from "lucide-react";

export default function Account() {
  return (
    <AppShell>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-white mb-2" data-testid="text-page-title">Settings</h1>
          <p className="text-muted-foreground">Manage your account and preferences</p>
        </div>

        <GlassCard className="p-12 flex flex-col items-center justify-center" data-testid="account-settings">
          <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <User className="h-10 w-10 text-primary" />
          </div>
          <h3 className="text-xl font-display font-medium text-white mb-2">Account Settings</h3>
          <p className="text-muted-foreground text-center max-w-md mb-6">
            Manage your profile, security settings, and API access through your VirtFusion account.
          </p>
          <Button className="bg-primary hover:bg-primary/90" data-testid="button-virtfusion-account" asChild>
            <a href="https://vps.cloudasn.com" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open VirtFusion Panel
            </a>
          </Button>
        </GlassCard>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                <User className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Profile</h3>
                <p className="text-sm text-muted-foreground">Personal information</p>
              </div>
            </div>
            <p className="text-muted-foreground text-sm">
              Update your name, email, and contact information in VirtFusion.
            </p>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500 border border-green-500/20">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Security</h3>
                <p className="text-sm text-muted-foreground">Password & 2FA</p>
              </div>
            </div>
            <p className="text-muted-foreground text-sm">
              Manage password, two-factor authentication, and session settings.
            </p>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20">
                <Key className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white">API Access</h3>
                <p className="text-sm text-muted-foreground">Tokens & keys</p>
              </div>
            </div>
            <p className="text-muted-foreground text-sm">
              Generate and manage API tokens for programmatic access.
            </p>
          </GlassCard>
        </div>
      </div>
    </AppShell>
  );
}
