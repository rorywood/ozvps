import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Mail, Lock, User, AlertCircle, Loader2, CheckCircle2, Server, Shield, Zap, Globe, XCircle } from "lucide-react";
import { useLocation, Link } from "wouter";
import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
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

interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

const CHECKLIST_ITEMS: Omit<ChecklistItem, 'completed'>[] = [
  { id: 'account', label: 'Creating your account' },
  { id: 'security', label: 'Configuring security settings' },
  { id: 'wallet', label: 'Setting up your wallet' },
  { id: 'dashboard', label: 'Preparing your dashboard' },
  { id: 'ready', label: 'All set! Redirecting...' },
];

function OnboardingChecklist({ onComplete }: { onComplete: () => void }) {
  const [items, setItems] = useState<ChecklistItem[]>(
    CHECKLIST_ITEMS.map(item => ({ ...item, completed: false }))
  );
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex >= items.length) {
      const timer = setTimeout(onComplete, 500);
      return () => clearTimeout(timer);
    }

    const delay = currentIndex === 0 ? 800 : 1200 + Math.random() * 600;
    const timer = setTimeout(() => {
      setItems(prev => prev.map((item, idx) => 
        idx === currentIndex ? { ...item, completed: true } : item
      ));
      setCurrentIndex(prev => prev + 1);
    }, delay);

    return () => clearTimeout(timer);
  }, [currentIndex, items.length, onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="w-full max-w-md mx-auto"
    >
      <div className="text-center mb-8">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/20 border border-green-500/30 mb-6"
        >
          <CheckCircle2 className="w-10 h-10 text-green-500" />
        </motion.div>
        <h2 className="text-2xl font-display font-bold text-foreground mb-2">
          Welcome to OzVPS!
        </h2>
        <p className="text-muted-foreground">
          Setting up your account...
        </p>
      </div>

      <div className="space-y-4">
        {items.map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ 
              opacity: index <= currentIndex ? 1 : 0.4,
              x: 0 
            }}
            transition={{ 
              duration: 0.3, 
              delay: index * 0.1,
              ease: "easeOut"
            }}
            className="flex items-center gap-4 p-4 rounded-xl bg-card/50 border border-border"
          >
            <div className={`
              flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300
              ${item.completed 
                ? 'bg-green-500/20 border-green-500/50' 
                : index === currentIndex 
                  ? 'bg-primary/20 border-primary/50' 
                  : 'bg-muted border-border'
              } border
            `}>
              {item.completed ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                </motion.div>
              ) : index === currentIndex ? (
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              ) : (
                <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
              )}
            </div>
            <span className={`
              text-sm font-medium transition-colors duration-300
              ${item.completed ? 'text-foreground' : 'text-muted-foreground'}
            `}>
              {item.label}
            </span>
          </motion.div>
        ))}
      </div>

      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-8"
      >
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-green-500 to-emerald-400"
            initial={{ width: "0%" }}
            animate={{ width: `${((currentIndex) / items.length) * 100}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function RegisterPage() {
  useDocumentTitle('Create Account');
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [showChecklist, setShowChecklist] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [recaptchaLoaded, setRecaptchaLoaded] = useState(false);
  const [recaptchaError, setRecaptchaError] = useState<string | null>(null);
  const recaptchaRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);
  
  const [honeypot, setHoneypot] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  const { data: recaptchaConfig } = useQuery({
    queryKey: ['recaptcha-config'],
    queryFn: async () => {
      const response = await fetch('/api/security/recaptcha-config', {
        credentials: 'include',
      });
      if (!response.ok) return { enabled: false, siteKey: null };
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: registrationStatus, isLoading: registrationLoading } = useQuery({
    queryKey: ['registration-status'],
    queryFn: async () => {
      const response = await fetch('/api/auth/registration-status');
      if (!response.ok) return { enabled: true };
      return response.json();
    },
    staleTime: 60 * 1000,
  });

  const registrationEnabled = registrationStatus?.enabled !== false;
  const recaptchaEnabled = recaptchaConfig?.enabled && recaptchaConfig?.siteKey;

  // Load reCAPTCHA script and render widget with retry mechanism
  useEffect(() => {
    // Reset state when reCAPTCHA is disabled
    if (!recaptchaEnabled || !recaptchaConfig?.siteKey) {
      setRecaptchaLoaded(false);
      setRecaptchaToken(null);
      setRecaptchaError(null);
      widgetIdRef.current = null;
      return;
    }

    let attempts = 0;
    const maxAttempts = 40; // 10 seconds total
    let retryTimer: NodeJS.Timeout | null = null;
    let scriptErrored = false;

    const tryRenderRecaptcha = () => {
      // Check if already rendered
      if (widgetIdRef.current !== null) {
        setRecaptchaLoaded(true);
        setRecaptchaError(null);
        return;
      }

      // Check if ref and grecaptcha are available
      if (recaptchaRef.current && window.grecaptcha?.render) {
        try {
          // Clear the container first in case there's stale content
          recaptchaRef.current.innerHTML = '';
          
          widgetIdRef.current = window.grecaptcha.render(recaptchaRef.current, {
            sitekey: recaptchaConfig.siteKey,
            callback: (token: string) => setRecaptchaToken(token),
            theme: 'dark',
          });
          setRecaptchaLoaded(true);
          setRecaptchaError(null);
          return;
        } catch (e: any) {
          // If already rendered error, just mark as loaded
          if (e.message?.includes('already been rendered')) {
            setRecaptchaLoaded(true);
            setRecaptchaError(null);
            return;
          }
          // Check for invalid site key error
          if (e.message?.includes('Invalid site key') || e.message?.includes('Invalid domain')) {
            setRecaptchaError('Invalid reCAPTCHA configuration. Please contact support.');
            return;
          }
          console.error('Failed to render reCAPTCHA:', e);
        }
      }

      // Retry if not successful
      attempts++;
      if (attempts < maxAttempts && !scriptErrored) {
        retryTimer = setTimeout(tryRenderRecaptcha, 250);
      } else if (attempts >= maxAttempts) {
        // Max retries reached - show error
        setRecaptchaError('Failed to load verification. Please refresh the page or try again later.');
      }
    };

    // Load script if not present
    const existingScript = document.querySelector('script[src*="recaptcha/api.js"]');
    if (!existingScript) {
      const script = document.createElement('script');
      script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        // Wait for grecaptcha to be ready
        if (window.grecaptcha) {
          window.grecaptcha.ready(tryRenderRecaptcha);
        } else {
          tryRenderRecaptcha();
        }
      };
      script.onerror = () => {
        scriptErrored = true;
        setRecaptchaError('Failed to load reCAPTCHA. Check your internet connection or try disabling ad blockers.');
      };
      document.head.appendChild(script);
    } else {
      // Script exists, try to render
      if (window.grecaptcha?.ready) {
        window.grecaptcha.ready(tryRenderRecaptcha);
      } else {
        tryRenderRecaptcha();
      }
    }

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      // Reset state on unmount so it can be re-rendered on next mount
      setRecaptchaLoaded(false);
      setRecaptchaToken(null);
      setRecaptchaError(null);
      widgetIdRef.current = null;
    };
  }, [recaptchaEnabled, recaptchaConfig?.siteKey]);

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
      setShowChecklist(true);
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

    if (!name.trim()) {
      setError("Please enter your name");
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

    if (!termsAccepted) {
      setError("Please accept the Terms of Service to continue");
      return;
    }

    registerMutation.mutate();
  };

  const handleChecklistComplete = () => {
    setLocation("/dashboard");
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

  const features = [
    { icon: Server, title: "Instant Deployment", description: "Deploy servers in seconds" },
    { icon: Shield, title: "Enterprise Security", description: "Protected by Australian infrastructure" },
    { icon: Zap, title: "High Performance", description: "NVMe storage & premium network" },
    { icon: Globe, title: "99.9% Uptime", description: "Reliable cloud hosting" },
  ];

  return (
    <div className="min-h-screen flex bg-background">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-green-500/10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-green-500/20 via-transparent to-transparent" />
        
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-green-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20">
          <Link href="/">
            <img src={logo} alt="OzVPS" className="h-16 w-auto mb-12 cursor-pointer" data-testid="img-logo-side" />
          </Link>
          
          <h1 className="text-4xl xl:text-5xl font-display font-bold text-foreground mb-6 leading-tight">
            Cloud Servers<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-green-500">
              Made Simple
            </span>
          </h1>
          
          <p className="text-lg text-muted-foreground mb-12 max-w-md">
            Deploy high-performance virtual servers with our easy-to-use control panel. 
            Pay as you go with our prepaid wallet system.
          </p>
          
          <div className="grid grid-cols-2 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 + 0.2 }}
                className="flex items-start gap-3"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <feature.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{feature.title}</h3>
                  <p className="text-xs text-muted-foreground">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <AnimatePresence mode="wait">
          {showChecklist ? (
            <motion.div
              key="checklist"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-md"
            >
              <OnboardingChecklist onComplete={handleChecklistComplete} />
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-md"
            >
              <div className="lg:hidden flex justify-center mb-8">
                <Link href="/">
                  <img src={logo} alt="OzVPS" className="h-12 w-auto cursor-pointer" data-testid="img-logo" />
                </Link>
              </div>

              <div className="mb-8">
                <h1 className="text-3xl font-display font-bold text-foreground">
                  Create Account
                </h1>
                <p className="text-muted-foreground mt-2">
                  Get started with OzVPS cloud servers
                </p>
              </div>

              {!registrationEnabled && !registrationLoading ? (
                <div className="space-y-6">
                  <div className="flex flex-col items-center justify-center text-center p-8 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mb-4">
                      <XCircle className="w-8 h-8 text-amber-500" />
                    </div>
                    <h2 className="text-xl font-semibold text-foreground mb-2">Registration Temporarily Closed</h2>
                    <p className="text-muted-foreground text-sm max-w-sm">
                      New account registration is currently disabled. Please contact support if you need access or check back later.
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground text-sm">
                      Already have an account?{" "}
                      <Link href="/login" className="text-primary hover:text-primary/80 font-medium" data-testid="link-login-disabled">
                        Sign in
                      </Link>
                    </p>
                  </div>
                </div>
              ) : (
              <>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium">Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="name" 
                      type="text"
                      placeholder="Your full name" 
                      className="pl-10 h-11 bg-input border-border focus-visible:ring-primary/50 text-foreground placeholder:text-muted-foreground/50"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      required
                      data-testid="input-name"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="email" 
                      type="email"
                      placeholder="you@example.com" 
                      className="pl-10 h-11 bg-input border-border focus-visible:ring-primary/50 text-foreground placeholder:text-muted-foreground/50"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      data-testid="input-email"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="password" 
                      type="password"
                      placeholder="Create a password"
                      className="pl-10 h-11 bg-input border-border focus-visible:ring-primary/50 text-foreground placeholder:text-muted-foreground/50"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      data-testid="input-password"
                    />
                  </div>
                  {strength && (
                    <div className="space-y-1.5 pt-1">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${strength.color} ${strength.width} transition-all duration-300`} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Password strength: <span className={strength.color === 'bg-green-500' ? 'text-green-400' : strength.color === 'bg-yellow-500' ? 'text-yellow-400' : 'text-red-400'}>{strength.label}</span>
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="confirmPassword" 
                      type="password"
                      placeholder="Confirm your password"
                      className="pl-10 h-11 bg-input border-border focus-visible:ring-primary/50 text-foreground placeholder:text-muted-foreground/50"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      data-testid="input-confirm-password"
                    />
                  </div>
                  {confirmPassword && password === confirmPassword && (
                    <div className="flex items-center gap-1.5 text-xs text-green-400 pt-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Passwords match
                    </div>
                  )}
                </div>

                {recaptchaEnabled && (
                  <div className="flex flex-col items-center py-2" data-testid="recaptcha-container">
                    <div ref={recaptchaRef} />
                    {!recaptchaLoaded && !recaptchaError && (
                      <div className="flex items-center justify-center p-4 text-muted-foreground text-sm">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Loading verification...
                      </div>
                    )}
                    {recaptchaError && (
                      <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mt-2">
                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                        <span>{recaptchaError}</span>
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

                <div className="flex items-start gap-3 py-1">
                  <Checkbox 
                    id="terms" 
                    checked={termsAccepted}
                    onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                    className="mt-0.5 border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    data-testid="checkbox-terms"
                  />
                  <Label 
                    htmlFor="terms" 
                    className="text-sm text-muted-foreground font-normal leading-relaxed cursor-pointer"
                  >
                    I agree to the{" "}
                    <a 
                      href="https://www.ozvps.com.au/terms" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary/80 underline underline-offset-2"
                      data-testid="link-terms"
                    >
                      Terms of Service
                    </a>
                  </Label>
                </div>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3"
                    data-testid="text-error"
                  >
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                  </motion.div>
                )}

                <Button 
                  type="submit" 
                  className="w-full h-12 text-base font-medium bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg shadow-green-500/25 border-0"
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

              <div className="mt-8 text-center">
                <p className="text-muted-foreground text-sm">
                  Already have an account?{" "}
                  <Link href="/login" className="text-primary hover:text-primary/80 font-medium" data-testid="link-login">
                    Sign in
                  </Link>
                </p>
              </div>

              <p className="text-center text-xs text-muted-foreground mt-6">
                Need help? Contact support@ozvps.com.au
              </p>
              </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
