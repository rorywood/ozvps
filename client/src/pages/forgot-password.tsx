import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, ArrowLeft, Loader2, CheckCircle2, AlertCircle, Shield, Zap, Server, RefreshCw, DatabaseIcon } from "lucide-react";
import { Link } from "wouter";
import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import logo from "@/assets/logo.png";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useSystemHealth } from "@/hooks/use-system-health";


export default function ForgotPasswordPage() {
  useDocumentTitle("Forgot Password - OzVPS");

  // Check system health (database connectivity)
  const { isDatabaseDown, refetch: refetchHealth, errorMessage: healthErrorMessage } = useSystemHealth();

  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [recaptchaLoaded, setRecaptchaLoaded] = useState(false);
  const [recaptchaError, setRecaptchaError] = useState<string | null>(null);
  const recaptchaRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);

  // Fetch reCAPTCHA config
  const { data: recaptchaConfig } = useQuery({
    queryKey: ['recaptcha-config'],
    queryFn: async () => {
      const response = await fetch('/api/security/recaptcha-config', {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return { enabled: false, siteKey: null, version: 'v3' };
      return response.json();
    },
    staleTime: 1000 * 60 * 5,
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

    let retryTimer: ReturnType<typeof setTimeout>;
    const version = recaptchaConfig.version || 'v3';

    const tryInitRecaptcha = () => {
      if (version === 'v3') {
        if (typeof window.grecaptcha?.execute === 'function') {
          setRecaptchaLoaded(true);
          setRecaptchaError(null);
        }
      } else {
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
          } catch (e: any) {
            if (e.message?.includes('already been rendered')) {
              setRecaptchaLoaded(true);
              setRecaptchaError(null);
            }
          }
        }
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
        }
      };
      document.head.appendChild(script);
    } else {
      if (window.grecaptcha?.ready) {
        window.grecaptcha.ready(tryInitRecaptcha);
      }
    }

    return () => {
      clearTimeout(retryTimer);
    };
  }, [recaptchaEnabled, recaptchaConfig?.siteKey, recaptchaConfig?.version]);

  const forgotPasswordMutation = useMutation({
    mutationFn: async ({ email, recaptchaToken }: { email: string; recaptchaToken?: string }) => {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, recaptchaToken }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send reset email');
      }
      return data;
    },
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: () => {
      // Reset reCAPTCHA on error
      setRecaptchaToken(null);
      if (widgetIdRef.current !== null && window.grecaptcha?.reset) {
        window.grecaptcha.reset(widgetIdRef.current);
      }
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    if (recaptchaEnabled && recaptchaLoaded) {
      if (isV3) {
        try {
          const token = await window.grecaptcha.execute(recaptchaConfig!.siteKey!, { action: 'forgot_password' });
          forgotPasswordMutation.mutate({ email: email.trim(), recaptchaToken: token });
        } catch (err) {
          console.error('reCAPTCHA v3 execute error:', err);
          forgotPasswordMutation.mutate({ email: email.trim() });
        }
      } else {
        if (!recaptchaToken) {
          setRecaptchaError("Please complete the reCAPTCHA verification");
          return;
        }
        forgotPasswordMutation.mutate({ email: email.trim(), recaptchaToken });
      }
    } else {
      forgotPasswordMutation.mutate({ email: email.trim() });
    }
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-[#0a0d14] via-[#0d1117] to-[#0a0d14]">
      {/* Left Side - Branded Panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-primary/10" />

        {/* Grid Pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />

        {/* Glowing Orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/30 rounded-full blur-[128px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-500/20 rounded-full blur-[96px]" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo & Brand */}
          <div>
            <Link href="/">
              <img
                src={logo}
                alt="OzVPS"
                className="h-16 w-auto cursor-pointer brightness-0 invert"
              />
            </Link>
          </div>

          {/* Main Content */}
          <div>
            <div className="mb-16">
              <h1 className="text-5xl font-bold mb-6 tracking-tight text-white leading-tight">
                Secure Account<br />
                <span className="text-primary">Recovery</span>
              </h1>
              <p className="text-xl text-[#a6a6a6] leading-relaxed max-w-md">
                We'll help you regain access to your account quickly and securely.
              </p>
            </div>

            {/* Features */}
            <div className="grid gap-7">
              <div className="flex items-center gap-4 group">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:bg-primary/20 transition-colors">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Instant Delivery</h3>
                  <p className="text-sm text-[#737373]">Reset link sent immediately</p>
                </div>
              </div>

              <div className="flex items-center gap-4 group">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:bg-primary/20 transition-colors">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Secure Process</h3>
                  <p className="text-sm text-[#737373]">Encrypted and time-limited links</p>
                </div>
              </div>

              <div className="flex items-center gap-4 group">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:bg-primary/20 transition-colors">
                  <Server className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Keep Your Servers</h3>
                  <p className="text-sm text-[#737373]">All your data remains safe</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-sm text-[#525252]">
            © {new Date().getFullYear()} OzVPS. All rights reserved.
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-10">
            <Link href="/">
              <img
                src={logo}
                alt="OzVPS"
                className="h-12 w-auto mx-auto cursor-pointer brightness-0 invert"
              />
            </Link>
          </div>

          {/* Database Unavailable Banner */}
          {isDatabaseDown && (
            <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center">
              <DatabaseIcon className="h-12 w-12 text-red-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-red-400 mb-2">System Temporarily Unavailable</h2>
              <p className="text-[#a6a6a6] mb-4">
                {healthErrorMessage || "We're experiencing technical difficulties. Please try again in a few minutes."}
              </p>
              <Button
                variant="outline"
                onClick={() => refetchHealth()}
                className="border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Check Again
              </Button>
            </div>
          )}

          {/* Form Card */}
          <div className={`bg-[#0d1117]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl shadow-black/20 ${isDatabaseDown ? 'opacity-50 pointer-events-none' : ''}`}>
            {isDatabaseDown ? (
              <div className="text-center py-8">
                <h1 className="text-2xl font-bold text-white mb-2">Password Reset Unavailable</h1>
                <p className="text-[#737373]">Please wait while we restore the service...</p>
              </div>
            ) : submitted ? (
              <div className="text-center py-4">
                <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">Check your email</h2>
                <p className="text-[#a6a6a6] mb-4">
                  If an account exists with <span className="text-white font-medium">{email}</span>, you'll receive a password reset link shortly.
                </p>
                <p className="text-sm text-[#737373] mb-8 pb-4 border-b border-white/10">
                  The link will expire in 30 minutes. Check your spam folder if you don't see it.
                </p>
                <div className="space-y-3">
                  <Button
                    variant="outline"
                    className="w-full h-12 rounded-xl border-white/10 text-[#ebebeb] hover:bg-[#161b22]"
                    onClick={() => {
                      setSubmitted(false);
                      setEmail("");
                    }}
                  >
                    Send another email
                  </Button>
                  <Button asChild className="w-full h-12 font-semibold rounded-xl bg-primary hover:bg-primary/90">
                    <Link href="/login">Back to login</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="mb-8">
                  <h1 className="text-2xl font-bold text-white mb-2">Reset your password</h1>
                  <p className="text-[#a6a6a6]">
                    Enter your email and we'll send you a reset link
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  {forgotPasswordMutation.isError && (
                    <div className="flex items-start gap-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                      <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                      <span>{(forgotPasswordMutation.error as Error).message}</span>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium text-[#ebebeb]">
                      Email
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#737373] pointer-events-none" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        className="pl-12 h-12 bg-[#161b22]/50 border-white/10/50 text-white placeholder:text-[#525252] focus:border-primary/50 focus:ring-primary/20 rounded-xl"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        autoFocus
                        required
                      />
                    </div>
                  </div>

                  {/* reCAPTCHA v2 Widget */}
                  {recaptchaEnabled && !recaptchaError && !isV3 && (
                    <div className="flex flex-col items-center py-2">
                      <div ref={recaptchaRef} />
                      {!recaptchaLoaded && (
                        <div className="text-sm text-[#737373]">Loading verification...</div>
                      )}
                    </div>
                  )}

                  {/* reCAPTCHA Error */}
                  {recaptchaError && (
                    <div className="flex items-start gap-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                      <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                      <span>{recaptchaError}</span>
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-12 text-base font-semibold rounded-xl bg-primary hover:bg-primary/90 transition-all mt-4"
                    disabled={forgotPasswordMutation.isPending || !email.trim()}
                  >
                    {forgotPasswordMutation.isPending ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Sending reset link...
                      </>
                    ) : (
                      "Send reset link"
                    )}
                  </Button>

                  {/* reCAPTCHA Notice */}
                  {recaptchaEnabled && (
                    <div className="flex items-center justify-center gap-2 text-xs text-[#737373] mt-4">
                      <svg className="h-4 w-4 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      <span>Protected by reCAPTCHA</span>
                      <span className="text-[#555]">·</span>
                      <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-[#a6a6a6] hover:text-white transition-colors">
                        Privacy
                      </a>
                      <span className="text-[#555]">·</span>
                      <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="text-[#a6a6a6] hover:text-white transition-colors">
                        Terms
                      </a>
                    </div>
                  )}
                </form>
              </>
            )}
          </div>

          {/* Footer Links */}
          {!isDatabaseDown && !submitted && (
            <div className="mt-8 text-center space-y-4">
              <p className="text-[#a6a6a6]">
                Remember your password?{' '}
                <Link href="/login" className="text-primary hover:text-primary/80 font-semibold transition-colors">
                  Sign in
                </Link>
              </p>
              <p className="text-sm text-[#525252]">
                <a href="https://ozvps.com.au" className="hover:text-[#a6a6a6] transition-colors flex items-center justify-center gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back to ozvps.com.au
                </a>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
