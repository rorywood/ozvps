import { AppShell } from "@/components/layout/app-shell";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  User, 
  Shield, 
  Key, 
  Copy, 
  Mail,
  Smartphone
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const apiTokens = [
  { id: "tk_live_89234...", name: "Production API Key", created: "2024-05-12", last_used: "2 mins ago" },
  { id: "tk_test_77212...", name: "Development Key", created: "2024-06-01", last_used: "5 days ago" },
];

export default function Account() {
  const { toast } = useToast();

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard",
      description: "API token has been copied to your clipboard.",
    });
  };

  return (
    <AppShell>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-white mb-2">Account Settings</h1>
          <p className="text-muted-foreground">Manage your profile, security, and API access</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Profile Section */}
          <div className="lg:col-span-2 space-y-6">
            <GlassCard className="p-6">
              <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Personal Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input defaultValue="John Doe" className="bg-black/20 border-white/10 text-white" />
                </div>
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input defaultValue="demo@virtfusion.com" className="pl-9 bg-black/20 border-white/10 text-white" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input defaultValue="+1 (555) 123-4567" className="pl-9 bg-black/20 border-white/10 text-white" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Input defaultValue="Acme Corp" className="bg-black/20 border-white/10 text-white" />
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <Button className="bg-primary text-primary-foreground border-0">Save Changes</Button>
              </div>
            </GlassCard>

             <GlassCard className="p-6">
              <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                <Key className="h-5 w-5 text-primary" />
                API Tokens
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Manage API tokens for accessing the VirtFusion API programmatically. Treat these tokens like passwords.
              </p>
              
              <div className="space-y-4">
                {apiTokens.map((token, i) => (
                  <div key={i} className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-lg bg-black/20 border border-white/5 gap-4">
                    <div>
                      <div className="font-medium text-white">{token.name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                        <span>Created: {token.created}</span>
                        <span>•</span>
                        <span>Last used: {token.last_used}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="px-2 py-1 rounded bg-black/40 text-xs font-mono text-muted-foreground border border-white/5">
                        {token.id}
                      </code>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-white" onClick={() => copyToClipboard(token.id)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="destructive" className="h-8">Revoke</Button>
                    </div>
                  </div>
                ))}
                
                <Button variant="outline" className="w-full border-dashed border-white/10 hover:bg-white/5 text-muted-foreground hover:text-white">
                  Generate New Token
                </Button>
              </div>
            </GlassCard>
          </div>

          {/* Security Sidebar */}
          <div className="space-y-6">
            <GlassCard className="p-6">
               <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                <Shield className="h-5 w-5 text-green-500" />
                Security
              </h2>
              
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-white">Two-Factor Auth</div>
                    <div className="text-xs text-muted-foreground">Secure your account with 2FA</div>
                  </div>
                  <div className="h-6 w-11 bg-green-500 rounded-full relative cursor-pointer">
                    <div className="absolute right-1 top-1 h-4 w-4 bg-white rounded-full shadow-sm" />
                  </div>
                </div>
                 <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-white">Session Timeout</div>
                    <div className="text-xs text-muted-foreground">Auto-logout after 1 hour</div>
                  </div>
                   <div className="h-6 w-11 bg-white/10 rounded-full relative cursor-pointer">
                    <div className="absolute left-1 top-1 h-4 w-4 bg-white/50 rounded-full shadow-sm" />
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-white/5">
                <h3 className="text-sm font-medium text-white mb-4">Login History</h3>
                <div className="space-y-3">
                  {[
                    { ip: "192.168.1.1", loc: "New York, US", time: "Current Session" },
                    { ip: "10.0.0.52", loc: "London, UK", time: "2 days ago" },
                  ].map((login, i) => (
                     <div key={i} className="flex justify-between text-xs">
                       <span className="text-muted-foreground">{login.ip} ({login.loc})</span>
                       <span className={cn("font-mono", i === 0 ? "text-green-400" : "text-muted-foreground")}>{login.time}</span>
                     </div>
                  ))}
                </div>
              </div>
            </GlassCard>
          </div>

        </div>
      </div>
    </AppShell>
  );
}
