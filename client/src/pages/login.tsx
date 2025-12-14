import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import logo from "@/assets/logo.png";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [customerId, setCustomerId] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!customerId.trim()) {
      setError("Please enter your Customer ID");
      return;
    }

    setLoading(true);
    
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ extRelationId: customerId.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["auth", "session"] });
      setLocation("/dashboard");
    } catch (err) {
      setError("Failed to connect. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <GlassCard className="w-full max-w-md p-8 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl" />
        
        <div className="relative z-10">
          <div className="flex flex-col items-center mb-8">
            <img src={logo} alt="CloudASN" className="h-16 w-auto mb-4" data-testid="img-logo" />
            <h1 className="text-xl font-display font-bold text-white text-center">VPS Control Panel</h1>
            <p className="text-muted-foreground text-center mt-2 text-sm">
              Enter your Customer ID to access your servers
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="customerId">Customer ID</Label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  id="customerId" 
                  type="text"
                  placeholder="Enter your Customer ID" 
                  className="pl-9 bg-black/20 border-white/10 focus-visible:ring-primary/50 text-white placeholder:text-muted-foreground/50"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  data-testid="input-customer-id"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Your Customer ID is provided in your welcome email or can be found in{" "}
                <a 
                  href="https://billing.cloudasn.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  WHMCS
                  <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md p-3" data-testid="text-error">
                {error}
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full h-10 font-medium bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_20px_rgba(59,130,246,0.3)] border-0"
              disabled={loading}
              data-testid="button-login"
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </div>
      </GlassCard>
    </div>
  );
}
