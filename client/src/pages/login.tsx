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
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/">
            <img
              src={logo}
              alt="OzVPS"
              className="h-10 w-auto mx-auto cursor-pointer dark:invert-0 invert mb-8"
              data-testid="img-logo"
            />
          </Link>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            {requires2FA ? "Two-Factor Authentication" : "Sign in to OzVPS"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {requires2FA
              ? useBackupCode
                ? "Enter your backup code to continue"
                : "Enter your authentication code to continue"
              : "Welcome back! Please enter your credentials"
            }
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
          {!requires2FA ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Session Message */}
              {sessionMessage && (
                <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-md p-3">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{sessionMessage.error}</span>
                </div>
              )}

              {/* User Not Found */}
              {showUserNotFound && (
                <div className="flex flex-col gap-3 text-sm bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-md p-3">
                  <div className="flex items-start gap-2 text-blue-700 dark:text-blue-400">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span className="font-medium">No account found with this email</span>
                  </div>
                  <p className="text-xs text-blue-600 dark:text-blue-500">
                    Ready to get started? Create your account in seconds.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    asChild
                    className="w-full"
                  >
                    <Link href="/register">
                      Create your account
                    </Link>
                  </Button>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-500 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-md p-3">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    className="pl-10"
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
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-primary hover:underline"
                    data-testid="link-forgot-password"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    className="pl-10"
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
                className="w-full"
                disabled={isSubmitting || loginMutation.isPending}
                data-testid="button-submit"
              >
                {(isSubmitting || loginMutation.isPending) ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>

              {/* reCAPTCHA Notice */}
              {recaptchaEnabled && (
                <p className="text-xs text-muted-foreground text-center">
                  Protected by reCAPTCHA.{' '}
                  <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                    Privacy
                  </a>
                  {' '}&{' '}
                  <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                    Terms
                  </a>
                </p>
              )}
            </form>
          ) : (
            /* 2FA Form */
            <form onSubmit={handle2FASubmit} className="space-y-4">
              {/* 2FA Info */}
              <div className="flex items-start gap-3 p-3 bg-primary/5 border border-primary/20 rounded-md">
                <Smartphone className="h-5 w-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {useBackupCode ? "Use a backup code" : "Verify your identity"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {useBackupCode
                      ? "Enter one of your backup codes"
                      : "Enter the 6-digit code from your authenticator app"}
                  </p>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-500 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-md p-3">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* 2FA Code Input */}
              <div className="space-y-2">
                <Label htmlFor="twofa-code">
                  {useBackupCode ? "Backup Code" : "Verification Code"}
                </Label>
                <Input
                  id="twofa-code"
                  type="text"
                  placeholder={useBackupCode ? "XXXXXXXX" : "000000"}
                  className="text-center text-xl tracking-widest font-mono"
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
                className="w-full"
                disabled={isSubmitting || loginMutation.isPending || (useBackupCode ? twoFAToken.length < 8 : twoFAToken.length !== 6)}
                data-testid="button-verify-2fa"
              >
                {(isSubmitting || loginMutation.isPending) ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify"
                )}
              </Button>

              {/* 2FA Options */}
              <div className="flex flex-col gap-2 pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setUseBackupCode(!useBackupCode)}
                  className="text-sm text-primary hover:underline"
                >
                  {useBackupCode ? "Use authenticator app" : "Use a backup code"}
                </button>
                <button
                  type="button"
                  onClick={handleBack2FA}
                  className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
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
          <div className="mt-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link href="/register" className="text-primary hover:underline font-medium" data-testid="link-register">
                Create one
              </Link>
            </p>
            <p className="text-xs text-muted-foreground">
              <a href="https://ozvps.com.au" className="hover:underline" data-testid="link-back-to-website">
                ← Back to ozvps.com.au
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
