import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, AlertCircle, Loader2, Info, Server, Shield, Zap, Globe, CheckCircle2 } from "lucide-react";
import { useLocation, Link } from "wouter";
import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import logo from "@/assets/logo.png";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useToast } from "@/hooks/use-toast";

interface WelcomeItem {
  id: string;
  label: string;
  completed: boolean;
}

const WELCOME_ITEMS: Omit<WelcomeItem, 'completed'>[] = [
  { id: 'auth', label: 'Verifying your credentials' },
  { id: 'session', label: 'Restoring your session' },
  { id: 'ready', label: 'All set! Redirecting...' },
];

function WelcomeBackScreen({ displayName, onComplete }: { displayName: string; onComplete: () => void }) {
  const [items, setItems] = useState<WelcomeItem[]>(
    WELCOME_ITEMS.map(item => ({ ...item, completed: false }))
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasCompleted, setHasCompleted] = useState(false);

  // Fallback navigation - ensure redirect happens even if animation is interrupted
  useEffect(() => {
    const fallbackTimer = setTimeout(() => {
      if (!hasCompleted) {
        onComplete();
      }
    }, 5000); // Maximum 5 seconds before forcing redirect
    return () => clearTimeout(fallbackTimer);
  }, [onComplete, hasCompleted]);

  useEffect(() => {
    if (currentIndex >= items.length) {
      const timer = setTimeout(() => {
        setHasCompleted(true);
        onComplete();
      }, 500);
      return () => clearTimeout(timer);
    }

    const delay = currentIndex === 0 ? 600 : 800 + Math.random() * 400;
    const timer = setTimeout(() => {
      setItems(prev => prev.map((item, idx) => 
        idx === currentIndex ? { ...item, completed: true } : item
      ));
      setCurrentIndex(prev => prev + 1);
    }, delay);

    return () => clearTimeout(timer);
  }, [currentIndex, items.length, onComplete]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent" />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-md mx-auto px-6 relative z-10"
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
            Welcome back, {displayName}!
          </h2>
          <p className="text-muted-foreground">
            Good to see you again...
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
              className="flex items-center gap-4 p-4 rounded-xl bg-card/50 border border-border backdrop-blur-sm"
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
      </motion.div>
    </div>
  );
}

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
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeDisplayName, setWelcomeDisplayName] = useState("");
  
  const [honeypot, setHoneypot] = useState("");
  const { toast } = useToast();

  const formatDisplayName = (name?: string, email?: string): string => {
    if (name) {
      return name
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }
    if (email) {
      const localPart = email.split('@')[0];
      return localPart.charAt(0).toUpperCase() + localPart.slice(1);
    }
    return 'there';
  };

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

  // Load reCAPTCHA script and render widget with retry mechanism
  useEffect(() => {
    // Reset state when reCAPTCHA is disabled
    if (!recaptchaEnabled || !recaptchaConfig?.siteKey) {
      setRecaptchaLoaded(false);
      setRecaptchaToken(null);
      widgetIdRef.current = null;
      return;
    }

    let attempts = 0;
    const maxAttempts = 20;
    let retryTimer: NodeJS.Timeout | null = null;

    const tryRenderRecaptcha = () => {
      // Check if already rendered
      if (widgetIdRef.current !== null) {
        setRecaptchaLoaded(true);
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
          return;
        } catch (e: any) {
          // If already rendered error, just mark as loaded
          if (e.message?.includes('already been rendered')) {
            setRecaptchaLoaded(true);
            return;
          }
          console.error('Failed to render reCAPTCHA:', e);
        }
      }

      // Retry if not successful
      attempts++;
      if (attempts < maxAttempts) {
        retryTimer = setTimeout(tryRenderRecaptcha, 250);
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
      widgetIdRef.current = null;
    };
  }, [recaptchaEnabled, recaptchaConfig?.siteKey]);

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
    onSuccess: (data) => {
      const displayName = formatDisplayName(data.user?.name, data.user?.email);
      queryClient.clear();
      // Toast for accessibility (screen readers)
      toast({
        title: `Welcome back, ${displayName}!`,
        description: "You've successfully signed in to your account.",
      });
      setWelcomeDisplayName(displayName);
      setShowWelcome(true);
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

  const features = [
    { icon: Server, title: "Instant Deployment", description: "Deploy servers in seconds" },
    { icon: Shield, title: "Enterprise Security", description: "Protected by Australian infrastructure" },
    { icon: Zap, title: "High Performance", description: "NVMe storage & premium network" },
    { icon: Globe, title: "99.9% Uptime", description: "Reliable cloud hosting" },
  ];

  // Show welcome screen after successful login
  if (showWelcome) {
    return (
      <WelcomeBackScreen 
        displayName={welcomeDisplayName} 
        onComplete={() => setLocation("/")} 
      />
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-blue-500/10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-blue-500/20 via-transparent to-transparent" />
        
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20">
          <Link href="/">
            <img src={logo} alt="OzVPS" className="h-16 w-auto mb-12 cursor-pointer" data-testid="img-logo-side" />
          </Link>
          
          <h1 className="text-4xl xl:text-5xl font-display font-bold text-foreground mb-6 leading-tight">
            Welcome Back<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">
              to OzVPS
            </span>
          </h1>
          
          <p className="text-lg text-muted-foreground mb-12 max-w-md">
            Sign in to manage your cloud servers, monitor performance, and deploy new instances.
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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
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
              Sign In
            </h1>
            <p className="text-muted-foreground mt-2">
              Welcome back! Sign in to manage your servers
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
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
                  placeholder="Enter your password"
                  className="pl-10 h-11 bg-input border-border focus-visible:ring-primary/50 text-foreground placeholder:text-muted-foreground/50"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  data-testid="input-password"
                />
              </div>
            </div>

            {recaptchaEnabled && (
              <div className="flex justify-center py-2" data-testid="recaptcha-container">
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
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3"
                data-testid="text-session-message"
              >
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{sessionMessage.error}</span>
              </motion.div>
            )}

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
              className="w-full h-12 text-base font-medium bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-700 text-white shadow-lg shadow-primary/25 border-0"
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

          <div className="mt-8 text-center">
            <p className="text-muted-foreground text-sm">
              Don't have an account?{" "}
              <Link href="/register" className="text-primary hover:text-primary/80 font-medium" data-testid="link-register">
                Create one
              </Link>
            </p>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Need help? Contact support@ozvps.com
          </p>
        </motion.div>
      </div>
    </div>
  );
}
