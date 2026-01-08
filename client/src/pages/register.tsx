import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, User, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { useLocation, Link } from "wouter";
import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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

export default function RegisterPage() {
  useDocumentTitle('Create Account');
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
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

  const registerMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          password, 
          name: name || undefined,
          recaptchaToken: recaptchaToken || undefined 
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Registration failed');
      }
      return response.json();
    },
    onSuccess: () => {
      setLocation("/dashboard");
    },
    onError: (err: any) => {
      setError(err.message || "Registration failed. Please try again.");
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
    
    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }
    
    if (!password) {
      setError("Please enter a password");
      return;
    }
    
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    
    if (recaptchaEnabled && !recaptchaToken) {
      setError("Please complete the reCAPTCHA verification");
      return;
    }

    registerMutation.mutate();
  };

  const passwordStrength = () => {
    if (!password) return null;
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    
    if (strength <= 2) return { label: "Weak", color: "bg-red-500", width: "w-1/3" };
    if (strength <= 3) return { label: "Medium", color: "bg-yellow-500", width: "w-2/3" };
    return { label: "Strong", color: "bg-green-500", width: "w-full" };
  };

  const strength = passwordStrength();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-lg p-10 relative overflow-hidden rounded-2xl bg-white/[0.03] ring-1 ring-white/10">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-green-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-primary/20 rounded-full blur-3xl" />
        
        <div className="relative z-10">
          <div className="flex flex-col items-center mb-8">
            <img src={logo} alt="OzVPS" className="h-16 w-auto mb-5" data-testid="img-logo" />
            <h1 className="text-2xl font-display font-bold text-white text-center">
              Create Your Account
            </h1>
            <p className="text-muted-foreground text-center mt-2 text-base">
              Get started with OzVPS cloud servers
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name (Optional)</Label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  id="name" 
                  type="text"
                  placeholder="Your name" 
                  className="pl-9 bg-black/20 border-white/10 focus-visible:ring-primary/50 text-white placeholder:text-muted-foreground/50"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  data-testid="input-name"
                />
              </div>
            </div>

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
                  placeholder="Create a password"
                  className="pl-9 bg-black/20 border-white/10 focus-visible:ring-primary/50 text-white placeholder:text-muted-foreground/50"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  data-testid="input-password"
                />
              </div>
              {strength && (
                <div className="space-y-1">
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className={`h-full ${strength.color} ${strength.width} transition-all duration-300`} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Password strength: <span className={strength.color === 'bg-green-500' ? 'text-green-400' : strength.color === 'bg-yellow-500' ? 'text-yellow-400' : 'text-red-400'}>{strength.label}</span>
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  id="confirmPassword" 
                  type="password"
                  placeholder="Confirm your password"
                  className="pl-9 bg-black/20 border-white/10 focus-visible:ring-primary/50 text-white placeholder:text-muted-foreground/50"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  data-testid="input-confirm-password"
                />
              </div>
              {confirmPassword && password === confirmPassword && (
                <div className="flex items-center gap-1.5 text-xs text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Passwords match
                </div>
              )}
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

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md p-3" data-testid="text-error">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full h-12 text-base font-medium bg-green-600 hover:bg-green-700 text-white shadow-[0_0_20px_rgba(34,197,94,0.3)] border-0 mt-2"
              disabled={registerMutation.isPending}
              data-testid="button-submit"
            >
              {registerMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating account...
                </>
              ) : (
                "Create Account"
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-muted-foreground text-sm">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:text-primary/80 font-medium" data-testid="link-login">
                Sign in
              </Link>
            </p>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-4">
            By creating an account, you agree to our Terms of Service
          </p>
        </div>
      </div>
    </div>
  );
}
