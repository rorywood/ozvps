import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, AlertCircle, Loader2, Info, Server, Shield, Zap, Globe, CheckCircle2, XCircle, LogOut, Smartphone, ArrowLeft } from "lucide-react";
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
  failed?: boolean;
}

const WELCOME_ITEMS: Omit<WelcomeItem, 'completed'>[] = [
  { id: 'auth', label: 'Verifying your credentials' },
  { id: 'session', label: 'Restoring your session' },
  { id: 'control', label: 'Connecting to control host' },
  { id: 'ready', label: 'All set! Redirecting...' },
];

function WelcomeBackScreen({ displayName, onComplete, onLogout }: { displayName: string; onComplete: () => void; onLogout: () => void }) {
  const [items, setItems] = useState<WelcomeItem[]>(
    WELCOME_ITEMS.map(item => ({ ...item, completed: false }))
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasCompleted, setHasCompleted] = useState(false);
  const [controlHostError, setControlHostError] = useState(false);

  // Non-blocking health check - runs in background but doesn't block redirect
  useEffect(() => {
    // Start health check immediately but don't wait for it
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // Reduced to 3 seconds

    fetch('/api/health', { signal: controller.signal })
      .then(res => {
        clearTimeout(timeoutId);
        if (!res.ok) {
          throw new Error('Control host unreachable');
        }
        return res.json();
      })
      .then(data => {
        if (data.status !== 'ok') {
          throw new Error('Control host error');
        }
        // Health check passed - just update UI, don't block
      })
      .catch(() => {
        clearTimeout(timeoutId);
        // Health check failed - just log it, don't block login
        console.warn('Health check failed, but continuing with login');
      });

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, []);

  // Quick progression through welcome steps without waiting for health check
  useEffect(() => {
    if (controlHostError) return;
    if (currentIndex >= items.length) {
      const timer = setTimeout(() => {
        setHasCompleted(true);
        onComplete();
      }, 300); // Reduced from 500ms
      return () => clearTimeout(timer);
    }

    // Faster delays for all steps
    const delay = currentIndex === 0 ? 300 : 400; // Reduced from 600-1200ms
    const timer = setTimeout(() => {
      setItems(prev => prev.map((item, idx) =>
        idx === currentIndex ? { ...item, completed: true } : item
      ));
      setCurrentIndex(prev => prev + 1);
    }, delay);

    return () => clearTimeout(timer);
  }, [currentIndex, items.length, onComplete, controlHostError]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className={`absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] ${controlHostError ? 'from-red-500/10' : 'from-primary/10'} via-transparent to-transparent`} />
      <div className={`absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] ${controlHostError ? 'from-orange-500/10' : 'from-blue-500/10'} via-transparent to-transparent`} />

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
            className={`inline-flex items-center justify-center w-20 h-20 rounded-full ${controlHostError ? 'bg-amber-500/20 border-amber-500/30' : 'bg-green-500/20 border-green-500/30'} mb-6 border`}
          >
            {controlHostError ? (
              <AlertCircle className="w-10 h-10 text-amber-500" />
            ) : (
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            )}
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
                opacity: index <= currentIndex || item.failed ? 1 : 0.4,
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
                ${item.failed
                  ? 'bg-red-500/20 border-red-500/50'
                  : item.completed
                    ? 'bg-green-500/20 border-green-500/50'
                    : index === currentIndex
                      ? 'bg-primary/20 border-primary/50'
                      : 'bg-muted border-border'
                } border
              `}>
                {item.failed ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <XCircle className="w-5 h-5 text-red-500" />
                  </motion.div>
                ) : item.completed ? (
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
                ${item.failed ? 'text-red-400' : item.completed ? 'text-foreground' : 'text-muted-foreground'}
              `}>
                {item.label}
              </span>
            </motion.div>
          ))}
        </div>

        {controlHostError && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-6 text-center space-y-4"
          >
            <p className="text-muted-foreground text-sm">
              We are having some service issues at the moment, please try again in a few minutes.
            </p>
            <Button
              onClick={onLogout}
              variant="outline"
              className="gap-2"
              data-testid="button-logout-error"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </motion.div>
        )}
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
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
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
  const [recaptchaError, setRecaptchaError] = useState<string | null>(null);
  const recaptchaRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeDisplayName, setWelcomeDisplayName] = useState("");
  
  const [honeypot, setHoneypot] = useState("");
  const { toast } = useToast();

  // 2FA State
  const [requires2FA, setRequires2FA] = useState(false);
  const [twoFAToken, setTwoFAToken] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [savedRecaptchaToken, setSavedRecaptchaToken] = useState<string | undefined>(undefined);

  // Force logout state (when blocked by another session)
  const [showForceLogout, setShowForceLogout] = useState(false);
  const [showUserNotFound, setShowUserNotFound] = useState(false);

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
      const response = await fetch('/api/security/recaptcha-config', {
        credentials: 'include',
      });
      if (!response.ok) return { enabled: false, siteKey: null, version: 'v3' as const };
      return response.json() as Promise<{ enabled: boolean; siteKey: string | null; version: 'v2' | 'v3' }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Validate reCAPTCHA site key format (valid keys start with "6L")
  const isValidSiteKey = (key: string | null | undefined): boolean => {
    if (!key || typeof key !== 'string') return false;
    return key.startsWith('6L') && key.length > 30;
  };

  const recaptchaEnabled = recaptchaConfig?.enabled && isValidSiteKey(recaptchaConfig?.siteKey);
  const isV3 = recaptchaConfig?.version === 'v3';

  // Load reCAPTCHA script and render widget (v2) or just load (v3)
  useEffect(() => {
    // Reset state when reCAPTCHA is disabled or invalid
    if (!recaptchaConfig?.enabled || !isValidSiteKey(recaptchaConfig?.siteKey)) {
      setRecaptchaLoaded(false);
      setRecaptchaToken(null);
      setRecaptchaError(null);
      widgetIdRef.current = null;
      return;
    }

    let attempts = 0;
    const maxAttempts = 12; // 3 seconds total (reduced from 40/10s for better UX)
    let retryTimer: NodeJS.Timeout | null = null;
    let scriptErrored = false;
    const version = recaptchaConfig.version || 'v3';

    const tryInitRecaptcha = () => {
      if (version === 'v3') {
        // v3: Just mark as loaded when grecaptcha is ready
        if (typeof window.grecaptcha?.execute === 'function') {
          setRecaptchaLoaded(true);
          setRecaptchaError(null);
          return;
        }
      } else {
        // v2: Render widget
        if (widgetIdRef.current !== null) {
          setRecaptchaLoaded(true);
          setRecaptchaError(null);
          return;
        }

        if (recaptchaRef.current && window.grecaptcha?.render) {
          try {
            recaptchaRef.current.innerHTML = '';
            widgetIdRef.current = window.grecaptcha.render(recaptchaRef.current, {
              sitekey: recaptchaConfig.siteKey!,
              callback: (token: string) => setRecaptchaToken(token),
              theme: 'dark',
            });
            setRecaptchaLoaded(true);
            setRecaptchaError(null);
            return;
          } catch (e: any) {
            if (e.message?.includes('already been rendered')) {
              setRecaptchaLoaded(true);
              setRecaptchaError(null);
              return;
            }
            if (e.message?.includes('Invalid site key') || e.message?.includes('Invalid domain')) {
              setRecaptchaError('Invalid reCAPTCHA configuration. Please contact support.');
              return;
            }
            console.error('Failed to render reCAPTCHA:', e);
          }
        }
      }

      // Retry if not successful
      attempts++;
      if (attempts < maxAttempts && !scriptErrored) {
        retryTimer = setTimeout(tryInitRecaptcha, 250);
      } else if (attempts >= maxAttempts) {
        setRecaptchaError('Failed to load verification. Please refresh the page or try again later.');
      }
    };

    // Load script if not present
    const existingScript = document.querySelector('script[src*="recaptcha"]');
    if (!existingScript) {
      const script = document.createElement('script');
      // v3 uses render=siteKey, v2 uses render=explicit
      script.src = version === 'v3'
        ? `https://www.google.com/recaptcha/api.js?render=${recaptchaConfig.siteKey}`
        : 'https://www.google.com/recaptcha/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (window.grecaptcha) {
          window.grecaptcha.ready(tryInitRecaptcha);
        } else {
          tryInitRecaptcha();
        }
      };
      script.onerror = () => {
        scriptErrored = true;
        setRecaptchaError('Failed to load reCAPTCHA. Check your internet connection or try disabling ad blockers.');
      };
      document.head.appendChild(script);
    } else {
      if (window.grecaptcha?.ready) {
        window.grecaptcha.ready(tryInitRecaptcha);
      } else {
        tryInitRecaptcha();
      }
    }

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      setRecaptchaLoaded(false);
      setRecaptchaToken(null);
      setRecaptchaError(null);
      widgetIdRef.current = null;
    };
  }, [recaptchaEnabled, recaptchaConfig?.siteKey, recaptchaConfig?.version]);

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
    mutationFn: (params: { recaptchaToken?: string; totpToken?: string; backupCode?: string }) =>
      api.login(email, password, params.recaptchaToken, params.totpToken, params.backupCode),
    onSuccess: (data) => {
      // Check if 2FA is required
      if (data.requires2FA) {
        setRequires2FA(true);
        setError("");
        return;
      }

      const displayName = formatDisplayName(data.user?.name, data.user?.email);
      queryClient.clear();
      // Toast for accessibility (screen readers)
      toast({
        title: `Welcome back, ${displayName}!`,
        description: "You've successfully signed in to your account.",
      });
      setWelcomeDisplayName(displayName);
      setShowWelcome(true);
      // Reset 2FA state
      setRequires2FA(false);
      setTwoFAToken("");
      setUseBackupCode(false);
    },
    onError: (err: any) => {
      // Check if user is already logged in from another location
      if (err.code === 'ALREADY_LOGGED_IN') {
        setShowForceLogout(true);
        setShowUserNotFound(false);
        setError(err.message || "You are already logged in from another location.");
      } else if (err.code === 'USER_NOT_FOUND') {
        // User doesn't exist - show friendly registration prompt
        setShowUserNotFound(true);
        setShowForceLogout(false);
        setError(""); // Clear error - we'll show a special message instead
      } else {
        setError(err.message || "Invalid email or password");
        setShowForceLogout(false);
        setShowUserNotFound(false);
      }
      setRecaptchaToken(null);
      // Reset 2FA token on error
      setTwoFAToken("");
      // Reset v2 widget if applicable
      if (widgetIdRef.current !== null && window.grecaptcha?.reset) {
        window.grecaptcha.reset(widgetIdRef.current);
      }
    },
  });

  // Force logout mutation
  const forceLogoutMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/auth/force-logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          password,
          recaptchaToken: savedRecaptchaToken || recaptchaToken,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to force logout');
      }
      return response.json();
    },
    onSuccess: () => {
      setShowForceLogout(false);
      setError("");
      toast({
        title: "Sessions cleared",
        description: "All other sessions have been logged out. Please sign in again.",
      });
      // Reset reCAPTCHA for new login attempt
      if (widgetIdRef.current !== null && window.grecaptcha?.reset) {
        window.grecaptcha.reset(widgetIdRef.current);
      }
      setRecaptchaToken(null);
    },
    onError: (err: any) => {
      setError(err.message || "Failed to force logout. Please check your credentials.");
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

    // Handle reCAPTCHA based on version
    if (recaptchaEnabled && !recaptchaError && recaptchaLoaded) {
      if (isV3) {
        // v3: Get token right before submitting
        try {
          const token = await window.grecaptcha.execute(recaptchaConfig!.siteKey!, { action: 'login' });
          setSavedRecaptchaToken(token);
          loginMutation.mutate({ recaptchaToken: token });
          return;
        } catch (err) {
          console.error('reCAPTCHA v3 execute error:', err);
          // Allow login anyway if reCAPTCHA fails
          loginMutation.mutate({});
          return;
        }
      } else {
        // v2: Check token from widget callback
        if (!recaptchaToken) {
          setError("Please complete the reCAPTCHA verification");
          return;
        }
        setSavedRecaptchaToken(recaptchaToken);
        loginMutation.mutate({ recaptchaToken });
        return;
      }
    }

    // No reCAPTCHA or error loading
    loginMutation.mutate({});
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!twoFAToken.trim()) {
      setError("Please enter your verification code");
      return;
    }

    // Submit with 2FA token
    if (useBackupCode) {
      loginMutation.mutate({
        recaptchaToken: savedRecaptchaToken,
        backupCode: twoFAToken,
      });
    } else {
      loginMutation.mutate({
        recaptchaToken: savedRecaptchaToken,
        totpToken: twoFAToken,
      });
    }
  };

  const handleBack2FA = () => {
    setRequires2FA(false);
    setTwoFAToken("");
    setUseBackupCode(false);
    setError("");
  };

  const features = [
    { icon: Server, title: "Instant Deployment", description: "Deploy servers in seconds" },
    { icon: Shield, title: "Enterprise Security", description: "Protected by Australian infrastructure" },
    { icon: Zap, title: "High Performance", description: "NVMe storage & premium network" },
    { icon: Globe, title: "99.9% Uptime", description: "Reliable cloud hosting" },
  ];

  // Handle logout from error state
  const handleErrorLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (e) {
      // Ignore logout errors
    }
    queryClient.clear();
    setShowWelcome(false);
    setLocation('/login');
  };

  // Show welcome screen after successful login
  if (showWelcome) {
    return (
      <WelcomeBackScreen 
        displayName={welcomeDisplayName} 
        onComplete={() => setLocation("/")}
        onLogout={handleErrorLogout}
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
            <img src={logo} alt="OzVPS" className="h-16 w-auto mb-12 cursor-pointer dark:invert-0 invert" data-testid="img-logo-side" />
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
              <img src={logo} alt="OzVPS" className="h-12 w-auto cursor-pointer dark:invert-0 invert" data-testid="img-logo" />
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

          {!requires2FA ? (
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
                    onChange={(e) => { setEmail(e.target.value); setShowUserNotFound(false); }}
                    autoComplete="email"
                    data-testid="input-email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-primary hover:text-primary/80 transition-colors"
                    data-testid="link-forgot-password"
                  >
                    Forgot password?
                  </Link>
                </div>
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

              {/* Only show widget for v2 - v3 is invisible */}
              {recaptchaEnabled && !recaptchaError && !isV3 && (
                <div className="flex flex-col items-center py-2" data-testid="recaptcha-container">
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

              {/* User not found - friendly green prompt to register */}
              {showUserNotFound && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col gap-3 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4"
                  data-testid="text-user-not-found"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                    <span className="font-medium">No account found with this email</span>
                  </div>
                  <p className="text-emerald-300/80 text-xs">
                    It looks like you haven't created an account yet. Get started in just a few seconds!
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    asChild
                    className="w-full border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                    data-testid="button-register-from-login"
                  >
                    <Link href="/register">
                      Create your account
                    </Link>
                  </Button>
                </motion.div>
              )}

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex flex-col gap-2 text-sm ${showForceLogout ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-red-400 bg-red-500/10 border-red-500/20'} border rounded-lg p-3`}
                  data-testid="text-error"
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                  {showForceLogout && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => forceLogoutMutation.mutate()}
                      disabled={forceLogoutMutation.isPending}
                      className="mt-1 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                      data-testid="button-force-logout"
                    >
                      {forceLogoutMutation.isPending ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                          Logging out other session...
                        </>
                      ) : (
                        <>
                          <LogOut className="h-3 w-3 mr-1.5" />
                          Force logout other session
                        </>
                      )}
                    </Button>
                  )}
                </motion.div>
              )}

              <Button
                type="submit"
                className="w-full h-12 text-base font-medium bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-700 text-white shadow-lg shadow-primary/25 border-0"
                disabled={loginMutation.isPending || forceLogoutMutation.isPending}
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

              {recaptchaEnabled && (
                <p className="text-[10px] text-muted-foreground/60 text-center mt-3">
                  Protected by reCAPTCHA.{' '}
                  <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-muted-foreground">Privacy</a>
                  {' '}&{' '}
                  <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-muted-foreground">Terms</a>
                </p>
              )}
            </form>
          ) : (
            /* 2FA Verification Form */
            <form onSubmit={handle2FASubmit} className="space-y-5">
              <div className="flex items-center gap-3 p-4 bg-primary/10 border border-primary/20 rounded-lg">
                <Smartphone className="h-8 w-8 text-primary" />
                <div>
                  <h3 className="font-medium text-foreground">Two-Factor Authentication</h3>
                  <p className="text-sm text-muted-foreground">
                    {useBackupCode
                      ? "Enter one of your backup codes"
                      : "Enter the code from your authenticator app"}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="twofa-code" className="text-sm font-medium">
                  {useBackupCode ? "Backup Code" : "Verification Code"}
                </Label>
                <Input
                  id="twofa-code"
                  type="text"
                  placeholder={useBackupCode ? "Enter backup code" : "000000"}
                  className="h-14 text-center text-2xl tracking-widest font-mono bg-input border-border focus-visible:ring-primary/50 text-foreground placeholder:text-muted-foreground/50"
                  value={twoFAToken}
                  onChange={(e) => setTwoFAToken(useBackupCode ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={useBackupCode ? 8 : 6}
                  autoFocus
                  autoComplete="one-time-code"
                  data-testid="input-2fa-code"
                />
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3"
                  data-testid="text-2fa-error"
                >
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}

              <Button
                type="submit"
                className="w-full h-12 text-base font-medium bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-700 text-white shadow-lg shadow-primary/25 border-0"
                disabled={loginMutation.isPending || (useBackupCode ? twoFAToken.length < 8 : twoFAToken.length !== 6)}
                data-testid="button-verify-2fa"
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify"
                )}
              </Button>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUseBackupCode(!useBackupCode)}
                  className="text-sm text-primary hover:text-primary/80 text-center"
                >
                  {useBackupCode ? "Use authenticator app instead" : "Use a backup code instead"}
                </button>
                <button
                  type="button"
                  onClick={handleBack2FA}
                  className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to login
                </button>
              </div>
            </form>
          )}

          <div className="mt-8 text-center">
            <p className="text-muted-foreground text-sm">
              Don't have an account?{" "}
              <Link href="/register" className="text-primary hover:text-primary/80 font-medium" data-testid="link-register">
                Create one
              </Link>
            </p>
          </div>

          <div className="mt-6 text-center">
            <Button
              variant="outline"
              className="border-border hover:bg-muted/50"
              asChild
            >
              <a
                href="https://ozvps.com.au"
                data-testid="link-back-to-website"
              >
                <Globe className="h-4 w-4 mr-2" />
                Back to ozvps.com.au
              </a>
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
