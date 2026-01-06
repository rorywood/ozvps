import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, AlertCircle, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import logo from "@/assets/logo.png";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const loginMutation = useMutation({
    mutationFn: () => api.login(email, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth"] });
      setLocation("/");
    },
    onError: (err: any) => {
      setError(err.message || "Invalid email or password");
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!email.trim() || !password) {
      setError("Please enter your email and password");
      return;
    }

    loginMutation.mutate();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <GlassCard className="w-full max-w-lg p-10 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl" />
        
        <div className="relative z-10">
          <div className="flex flex-col items-center mb-10">
            <img src={logo} alt="OzVPS" className="h-20 w-auto mb-6" data-testid="img-logo" />
            <h1 className="text-2xl font-display font-bold text-white text-center">
              Welcome Back
            </h1>
            <p className="text-muted-foreground text-center mt-3 text-base">
              Sign in to manage your servers
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  id="email" 
                  type="email"
                  placeholder="you@example.com" 
                  className="pl-9 bg-black/20 border-white/10 focus-visible:ring-primary/50 text-white placeholder:text-muted-foreground/50"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  data-testid="input-email"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  id="password" 
                  type="password"
                  placeholder="Enter your password"
                  className="pl-9 bg-black/20 border-white/10 focus-visible:ring-primary/50 text-white placeholder:text-muted-foreground/50"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  data-testid="input-password"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md p-3" data-testid="text-error">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full h-12 text-base font-medium bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_20px_rgba(59,130,246,0.3)] border-0"
              disabled={loginMutation.isPending}
              data-testid="button-submit"
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Need help? Contact support@ozvps.com
          </p>
        </div>
      </GlassCard>
    </div>
  );
}
