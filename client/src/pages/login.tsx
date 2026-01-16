import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, AlertCircle, Loader2, Smartphone, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useLocation, Link } from "wouter";
import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import logo from "@/assets/logo.png";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useToast } from "@/hooks/use-toast";

declare global {
  interface Window {
    grecaptcha: {
      ready: (callback: () => void) => void;
      render: (container: HTMLElement, options: { sitekey: string; callback: (token: string) => void; theme: string }) => number;
      reset: (widgetId: number) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
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
  const [honeypot, setHoneypot] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // 2FA State
  const [requires2FA, setRequires2FA] = useState(false);
  const [twoFAToken, setTwoFAToken] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [savedRecaptchaToken, setSavedRecaptchaToken] = useState<string | undefined>(undefined);

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

  const isValidSiteKey = (key: string | null | undefined): boolean => {
    if (!key || typeof key !== 'string') return false;
    return key.startsWith('6L') && key.length > 30;
  };

  const recaptchaEnabled = recaptchaConfig?.enabled && isValidSiteKey(recaptchaConfig?.siteKey);
  const isV3 = recaptchaConfig?.version === 'v3';

  // Load reCAPTCHA
  useEffect(() => {
    if (!recaptchaConfig?.enabled || !isValidSiteKey(recaptchaConfig?.siteKey)) {
      setRecaptchaLoaded(false);
      setRecaptchaToken(null);
      setRecaptchaError(null);
      widgetIdRef.current = null;
      return;
    }

    let attempts = 0;
    const maxAttempts = 12;
    let retryTimer: NodeJS.Timeout | null = null;
    let scriptErrored = false;
    const version = recaptchaConfig.version || 'v3';

    const tryInitRecaptcha = () => {
      if (version === 'v3') {
        if (typeof window.grecaptcha?.execute === 'function') {
          setRecaptchaLoaded(true);
          setRecaptchaError(null);
          return;
        }
      } else {
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

      attempts++;
      if (attempts < maxAttempts && !scriptErrored) {
        retryTimer = setTimeout(tryInitRecaptcha, 250);
      } else if (attempts >= maxAttempts) {
        setRecaptchaError('Failed to load verification. Please refresh the page or try again later.');
      }
    };

    const existingScript = document.querySelector('script[src*="recaptcha"]');
    if (!existingScript) {
      const script = document.createElement('script');
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
      if (data.requires2FA) {
        setRequires2FA(true);
        setError("");
        setIsSubmitting(false);
        return;
      }

      const displayName = formatDisplayName(data.user?.name, data.user?.email);
      queryClient.clear();
      toast({
        title: `Welcome back, ${displayName}!`,
        description: "Redirecting to your dashboard...",
      });

      // Quick redirect without welcome screen
      setTimeout(() => {
        setLocation("/");
      }, 500);
    },
    onError: (err: any) => {
      setIsSubmitting(false);
      if (err.code === 'USER_NOT_FOUND') {
        setShowUserNotFound(true);
        setError("");
      } else {
        setError(err.message || "Invalid email or password");
        setShowUserNotFound(false);
      }
      setRecaptchaToken(null);
      setTwoFAToken("");
      if (widgetIdRef.current !== null && window.grecaptcha?.reset) {
        window.grecaptcha.reset(widgetIdRef.current);
      }
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Debounce: prevent double submission
    if (isSubmitting || loginMutation.isPending) return;

    setError("");
    setIsSubmitting(true);

    if (honeypot) {
      setError("Verification failed. Please try again.");
      setIsSubmitting(false);
      return;
    }

    if (!email.trim() || !password) {
      setError("Please enter your email and password");
      setIsSubmitting(false);
      return;
    }

    if (recaptchaEnabled && !recaptchaError && recaptchaLoaded) {
      if (isV3) {
        try {
          const token = await window.grecaptcha.execute(recaptchaConfig!.siteKey!, { action: 'login' });
          setSavedRecaptchaToken(token);
          loginMutation.mutate({ recaptchaToken: token });
          return;
        } catch (err) {
          console.error('reCAPTCHA v3 execute error:', err);
          loginMutation.mutate({});
          return;
        }
      } else {
        if (!recaptchaToken) {
          setError("Please complete the reCAPTCHA verification");
          setIsSubmitting(false);
          return;
        }
        setSavedRecaptchaToken(recaptchaToken);
        loginMutation.mutate({ recaptchaToken });
        return;
      }
    }

    loginMutation.mutate({});
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting || loginMutation.isPending) return;

    setError("");
    setIsSubmitting(true);

    if (!twoFAToken.trim()) {
      setError("Please enter your verification code");
      setIsSubmitting(false);
      return;
    }

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

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Branded Panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-background relative overflow-hidden">
        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo & Brand */}
          <div>
            <Link href="/">
              <img
                src={logo}
                alt="OzVPS"
                className="h-16 w-auto cursor-pointer dark:invert-0 invert"
                data-testid="img-logo"
              />
            </Link>
          </div>

          {/* Main Content */}
          <div className="space-y-8">
            <div>
              <h1 className="text-4xl font-bold mb-4 tracking-tight text-foreground">
                Welcome to OzVPS
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Enterprise-grade virtual servers with Australian hosting and 24/7 support.
              </p>
            </div>

            {/* Features */}
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1 text-foreground">Lightning Fast Deployment</h3>
                  <p className="text-sm text-muted-foreground">Deploy your server in seconds with our automated platform</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1 text-foreground">Australian Data Centers</h3>
                  <p className="text-sm text-muted-foreground">Low latency and compliance with local data sovereignty</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1 text-foreground">24/7 Expert Support</h3>
                  <p className="text-sm text-muted-foreground">Our team is always here to help when you need us</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-sm text-muted-foreground">
            © 2026 OzVPS. All rights reserved.
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex-1 flex items-center justify-center bg-background p-8">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <Link href="/">
              <img
                src={logo}
                alt="OzVPS"
                className="h-14 w-auto mx-auto cursor-pointer dark:invert-0 invert"
                data-testid="img-logo-mobile"
              />
            </Link>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              {requires2FA ? "Two-Factor Authentication" : "Sign in to your account"}
            </h1>
            <p className="text-muted-foreground">
              {requires2FA
                ? useBackupCode
                  ? "Enter your backup code to continue"
                  : "Enter your authentication code to continue"
                : "Welcome back! Enter your credentials to continue"
              }
            </p>
          </div>

          {/* Form Card */}
          <div className="space-y-6">
          {!requires2FA ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Session Message */}
              {sessionMessage && (
                <div className="flex items-start gap-3 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg p-4">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <span>{sessionMessage.error}</span>
                </div>
              )}

              {/* User Not Found */}
              {showUserNotFound && (
                <div className="flex flex-col gap-3 text-sm bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-lg p-4">
                  <div className="flex items-start gap-3 text-blue-700 dark:text-blue-400">
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                    <span className="font-medium">No account found with this email</span>
                  </div>
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    Ready to get started? Create your account in seconds.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    asChild
                    className="w-full mt-1"
                  >
                    <Link href="/register">
                      Create your account
                    </Link>
                  </Button>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="flex items-start gap-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg p-4">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-foreground">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    className="pl-11 h-12 text-base"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setShowUserNotFound(false); setError(""); }}
                    autoComplete="email"
                    autoFocus
                    data-testid="input-email"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium text-foreground">Password</Label>
                  <Link
                    href="/forgot-password"
                    className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                    data-testid="link-forgot-password"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    className="pl-11 h-12 text-base"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    autoComplete="current-password"
                    data-testid="input-password"
                  />
                </div>
              </div>

              {/* reCAPTCHA v2 Widget */}
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

              {/* Honeypot */}
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

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold"
                disabled={isSubmitting || loginMutation.isPending}
                data-testid="button-submit"
              >
                {(isSubmitting || loginMutation.isPending) ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign in to your account"
                )}
              </Button>

              {/* reCAPTCHA Notice */}
              {recaptchaEnabled && (
                <p className="text-xs text-muted-foreground text-center">
                  Protected by reCAPTCHA.{' '}
                  <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">
                    Privacy
                  </a>
                  {' '}·{' '}
                  <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">
                    Terms
                  </a>
                </p>
              )}
            </form>
          ) : (
            /* 2FA Form */
            <form onSubmit={handle2FASubmit} className="space-y-5">
              {/* 2FA Info */}
              <div className="flex items-start gap-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <Smartphone className="h-6 w-6 text-primary flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-base font-semibold text-foreground mb-1">
                    {useBackupCode ? "Use a backup code" : "Verify your identity"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {useBackupCode
                      ? "Enter one of your backup codes"
                      : "Enter the 6-digit code from your authenticator app"}
                  </p>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg p-4">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* 2FA Code Input */}
              <div className="space-y-2">
                <Label htmlFor="twofa-code" className="text-sm font-medium text-foreground">
                  {useBackupCode ? "Backup Code" : "Verification Code"}
                </Label>
                <Input
                  id="twofa-code"
                  type="text"
                  placeholder={useBackupCode ? "XXXXXXXX" : "000000"}
                  className="text-center text-2xl tracking-widest font-mono h-14"
                  value={twoFAToken}
                  onChange={(e) => setTwoFAToken(useBackupCode ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={useBackupCode ? 8 : 6}
                  autoFocus
                  autoComplete="one-time-code"
                  data-testid="input-2fa-code"
                />
              </div>

              {/* Verify Button */}
              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold"
                disabled={isSubmitting || loginMutation.isPending || (useBackupCode ? twoFAToken.length < 8 : twoFAToken.length !== 6)}
                data-testid="button-verify-2fa"
              >
                {(isSubmitting || loginMutation.isPending) ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify and continue"
                )}
              </Button>

              {/* 2FA Options */}
              <div className="flex flex-col gap-3 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setUseBackupCode(!useBackupCode)}
                  className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  {useBackupCode ? "Use authenticator app instead" : "Use a backup code instead"}
                </button>
                <button
                  type="button"
                  onClick={handleBack2FA}
                  className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to sign in
                </button>
              </div>
            </form>
          )}
          </div>

          {/* Footer Links */}
          {!requires2FA && (
            <div className="mt-8 text-center space-y-4">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-background px-4 text-muted-foreground">
                    New to OzVPS?
                  </span>
                </div>
              </div>
              <p className="text-sm">
                <Link href="/register" className="text-primary hover:text-primary/80 font-semibold transition-colors" data-testid="link-register">
                  Create your free account
                </Link>
              </p>
              <p className="text-xs text-muted-foreground">
                <a href="https://ozvps.com.au" className="hover:text-foreground transition-colors" data-testid="link-back-to-website">
                  ← Back to ozvps.com.au
                </a>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
