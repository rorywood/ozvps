import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, AlertCircle, Loader2, Info } from "lucide-react";
import { useLocation, Link } from "wouter";
import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import logo from "@/assets/logo.png";
import { useDocumentTitle } from "@/hooks/use-document-title";

declare global {
  interface Window {
    grecaptcha: {
      ready: (callback: () => void) => void;
      render: (container: HTMLElement, options: { sitekey: string; callback: (token: string) => void; theme: string }) => number;
      reset: (widgetId: number) => void;
    };
    onRecaptchaLoad?: () => void;
  }
}

export default function LoginPage() {
  useDocumentTitle('Sign In');
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sessionMessage, setSessionMessage] = useState<{ error: string; code: string } | null>(null);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [recaptchaLoaded, setRecaptchaLoaded] = useState(false);
  const recaptchaRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);
  
  const [honeypot, setHoneypot] = useState("");

  const { data: recaptchaConfig } = useQuery({
    queryKey: ['recaptcha-config'],
    queryFn: async () => {
      const response = await fetch('/api/security/recaptcha-config');
      if (!response.ok) return { enabled: false, siteKey: null };
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const recaptchaEnabled = recaptchaConfig?.enabled && recaptchaConfig?.siteKey;

  const initRecaptcha = useCallback(() => {
    if (recaptchaRef.current && recaptchaConfig?.siteKey && window.grecaptcha && widgetIdRef.current === null) {
      try {
        widgetIdRef.current = window.grecaptcha.render(recaptchaRef.current, {
          sitekey: recaptchaConfig.siteKey,
          callback: (token: string) => setRecaptchaToken(token),
          theme: 'dark',
        });
        setRecaptchaLoaded(true);
      } catch (e) {
        console.error('Failed to render reCAPTCHA:', e);
      }
    }
  }, [recaptchaConfig?.siteKey]);

  useEffect(() => {
    if (!recaptchaEnabled) return;

    const existingScript = document.querySelector('script[src*="recaptcha"]');
    if (existingScript) {
      if (window.grecaptcha) {
        window.grecaptcha.ready(initRecaptcha);
      }
      return;
    }

    window.onRecaptchaLoad = () => {
      window.grecaptcha.ready(initRecaptcha);
    };

    const script = document.createElement('script');
    script.src = 'https://www.google.com/recaptcha/api.js?onload=onRecaptchaLoad&render=explicit';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    return () => {
      delete window.onRecaptchaLoad;
    };
  }, [recaptchaEnabled, initRecaptcha]);

  useEffect(() => {
    const storedError = sessionStorage.getItem('sessionError');
    if (storedError) {
      try {
        const parsed = JSON.parse(storedError);
        setSessionMessage(parsed);
      } catch {}
      sessionStorage.removeItem('sessionError');
    }
  }, []);

  const loginMutation = useMutation({
    mutationFn: () => api.login(email, password, recaptchaToken || undefined),
    onSuccess: () => {
      queryClient.clear();
      setLocation("/");
    },
    onError: (err: any) => {
      setError(err.message || "Invalid email or password");
      setRecaptchaToken(null);
      if (widgetIdRef.current !== null && window.grecaptcha) {
        window.grecaptcha.reset(widgetIdRef.current);
      }
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (honeypot) {
      setError("Verification failed. Please try again.");
      return;
    }
    
    if (!email.trim() || !password) {
      setError("Please enter your email and password");
      return;
    }
    
    if (recaptchaEnabled && !recaptchaToken) {
      setError("Please complete the reCAPTCHA verification");
      return;
    }

    loginMutation.mutate();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-lg p-10 relative overflow-hidden rounded-2xl bg-card/50 ring-1 ring-border">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl" />
        
        <div className="relative z-10">
          <div className="flex flex-col items-center mb-10">
            <img src={logo} alt="OzVPS" className="h-20 w-auto mb-6" data-testid="img-logo" />
            <h1 className="text-2xl font-display font-bold text-foreground text-center">
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
                  className="pl-9 bg-input border-border focus-visible:ring-primary/50 text-foreground placeholder:text-muted-foreground/50"
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
                  className="pl-9 bg-input border-border focus-visible:ring-primary/50 text-foreground placeholder:text-muted-foreground/50"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  data-testid="input-password"
                />
              </div>
            </div>

            {recaptchaEnabled && (
              <div className="flex justify-center" data-testid="recaptcha-container">
                <div ref={recaptchaRef} />
                {!recaptchaLoaded && (
                  <div className="flex items-center justify-center p-4 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Loading verification...
                  </div>
                )}
              </div>
            )}

            <div aria-hidden="true" className="absolute -left-[9999px] opacity-0 h-0 overflow-hidden">
              <Label htmlFor="website">Website</Label>
              <Input 
                id="website" 
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>

            {sessionMessage && (
              <div className="flex items-start gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md p-3" data-testid="text-session-message">
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{sessionMessage.error}</span>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md p-3" data-testid="text-error">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full h-12 text-base font-medium bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_20px_rgba(59,130,246,0.3)] border-0 mt-4"
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

          <div className="mt-6 text-center">
            <p className="text-muted-foreground text-sm">
              Don't have an account?{" "}
              <Link href="/register" className="text-primary hover:text-primary/80 font-medium" data-testid="link-register">
                Create one
              </Link>
            </p>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-4">
            Need help? Contact support@ozvps.com
          </p>
        </div>
      </div>
    </div>
  );
}
