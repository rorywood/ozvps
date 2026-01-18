import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Mail, Lock, User, AlertCircle, Loader2, CheckCircle2, Shield, Zap, Server, XCircle, ArrowLeft } from "lucide-react";
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
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
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
      <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/50 rounded-2xl p-8 shadow-2xl shadow-black/20">
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/20 border border-green-500/30 mb-6"
          >
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          </motion.div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Welcome to OzVPS!
          </h2>
          <p className="text-slate-400">
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
              className="flex items-center gap-4 p-4 rounded-xl bg-slate-800/30 border border-slate-700/50"
            >
              <div className={`
                flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300
                ${item.completed
                  ? 'bg-green-500/20 border-green-500/50'
                  : index === currentIndex
                    ? 'bg-primary/20 border-primary/50'
                    : 'bg-slate-800 border-slate-700'
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
                  <div className="w-2 h-2 rounded-full bg-slate-600" />
                )}
              </div>
              <span className={`
                text-sm font-medium transition-colors duration-300
                ${item.completed ? 'text-white' : 'text-slate-500'}
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
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-green-500 to-emerald-400"
              initial={{ width: "0%" }}
              animate={{ width: `${((currentIndex) / items.length) * 100}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </motion.div>
      </div>
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
      if (!response.ok) return { enabled: false, siteKey: null, version: 'v3' as const };
      return response.json() as Promise<{ enabled: boolean; siteKey: string | null; version: 'v2' | 'v3' }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: registrationStatus } = useQuery({
    queryKey: ['registration-status'],
    queryFn: async () => {
      const response = await fetch('/api/auth/registration-status');
      if (!response.ok) return { enabled: true };
      return response.json();
    },
    staleTime: 60 * 1000,
  });

  const registrationEnabled = registrationStatus?.enabled !== false;

  const isValidSiteKey = (key: string | null | undefined): boolean => {
    if (!key || typeof key !== 'string') return false;
    return key.startsWith('6L') && key.length > 30;
  };

  const recaptchaEnabled = recaptchaConfig?.enabled && isValidSiteKey(recaptchaConfig?.siteKey);
  const isV3 = recaptchaConfig?.version === 'v3';

  useEffect(() => {
    if (!recaptchaConfig?.enabled || !isValidSiteKey(recaptchaConfig?.siteKey)) {
      setRecaptchaLoaded(false);
      setRecaptchaToken(null);
      setRecaptchaError(null);
      widgetIdRef.current = null;
      return;
    }

    let attempts = 0;
    const maxAttempts = 40;
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

  const registerMutation = useMutation({
    mutationFn: async (token?: string) => {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          name: name || undefined,
          recaptchaToken: token,
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
      if (widgetIdRef.current !== null && window.grecaptcha?.reset) {
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

    if (!termsAccepted) {
      setError("Please accept the Terms of Service to continue");
      return;
    }

    if (recaptchaEnabled && !recaptchaError && recaptchaLoaded) {
      if (isV3) {
        try {
          const token = await window.grecaptcha.execute(recaptchaConfig!.siteKey!, { action: 'register' });
          registerMutation.mutate(token);
          return;
        } catch (err) {
          console.error('reCAPTCHA v3 execute error:', err);
          registerMutation.mutate(undefined);
          return;
        }
      } else {
        if (!recaptchaToken) {
          setError("Please complete the reCAPTCHA verification");
          return;
        }
        registerMutation.mutate(recaptchaToken);
        return;
      }
    }

    registerMutation.mutate(undefined);
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

    if (strength <= 2) return { label: "Weak", color: "bg-red-500", textColor: "text-red-400", width: "w-1/3" };
    if (strength <= 3) return { label: "Medium", color: "bg-yellow-500", textColor: "text-yellow-400", width: "w-2/3" };
    return { label: "Strong", color: "bg-green-500", textColor: "text-green-400", width: "w-full" };
  };

  const strength = passwordStrength();

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
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
                className="h-12 w-auto cursor-pointer brightness-0 invert"
                data-testid="img-logo"
              />
            </Link>
          </div>

          {/* Main Content */}
          <div className="space-y-12">
            <div>
              <h1 className="text-5xl font-bold mb-6 tracking-tight text-white leading-tight">
                Start Your<br />
                <span className="text-primary">Cloud Journey</span>
              </h1>
              <p className="text-xl text-slate-400 leading-relaxed max-w-md">
                Join thousands of developers and businesses who trust OzVPS for reliable, high-performance cloud infrastructure.
              </p>
            </div>

            {/* Features */}
            <div className="grid gap-8">
              <div className="flex items-center gap-4 group">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:bg-primary/20 transition-colors">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Instant Deployment</h3>
                  <p className="text-sm text-slate-500">Servers ready in under 60 seconds</p>
                </div>
              </div>

              <div className="flex items-center gap-4 group">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:bg-primary/20 transition-colors">
                  <Server className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Australian Infrastructure</h3>
                  <p className="text-sm text-slate-500">Low latency, local data sovereignty</p>
                </div>
              </div>

              <div className="flex items-center gap-4 group">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:bg-primary/20 transition-colors">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Enterprise Security</h3>
                  <p className="text-sm text-slate-500">DDoS protection included</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-sm text-slate-600">
            © {new Date().getFullYear()} OzVPS. All rights reserved.
          </div>
        </div>
      </div>

      {/* Right Side - Register Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
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
              {/* Mobile Logo */}
              <div className="lg:hidden text-center mb-10">
                <Link href="/">
                  <img
                    src={logo}
                    alt="OzVPS"
                    className="h-10 w-auto mx-auto cursor-pointer brightness-0 invert"
                    data-testid="img-logo-mobile"
                  />
                </Link>
              </div>

              {/* Form Card */}
              <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/50 rounded-2xl p-8 shadow-2xl shadow-black/20">
                {/* Header */}
                <div className="mb-8">
                  <h1 className="text-2xl font-bold text-white mb-2">
                    Create your account
                  </h1>
                  <p className="text-slate-400">
                    Get started with OzVPS cloud servers
                  </p>
                </div>

                {registrationEnabled === false ? (
                  <div className="space-y-6">
                    <div className="flex flex-col items-center justify-center text-center p-6 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mb-4">
                        <XCircle className="w-8 h-8 text-amber-500" />
                      </div>
                      <h2 className="text-xl font-semibold text-white mb-2">
                        Registration Temporarily Closed
                      </h2>
                      <p className="text-slate-400 text-sm">
                        New account registration is currently disabled. Please contact support or check back later.
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-slate-400 text-sm">
                        Already have an account?{" "}
                        <Link href="/login" className="text-primary hover:text-primary/80 font-semibold" data-testid="link-login-disabled">
                          Sign in
                        </Link>
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      {/* Name */}
                      <div className="space-y-2">
                        <Label htmlFor="name" className="text-sm font-medium text-slate-300">Full Name</Label>
                        <div className="relative">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 pointer-events-none" />
                          <Input
                            id="name"
                            type="text"
                            placeholder="John Doe"
                            className="pl-12 h-12 bg-slate-800/50 border-slate-700/50 text-white placeholder:text-slate-500 focus:border-primary/50 focus:ring-primary/20 rounded-xl"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoComplete="name"
                            required
                            data-testid="input-name"
                          />
                        </div>
                      </div>

                      {/* Email */}
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-sm font-medium text-slate-300">Email</Label>
                        <div className="relative">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 pointer-events-none" />
                          <Input
                            id="email"
                            type="email"
                            placeholder="you@example.com"
                            className="pl-12 h-12 bg-slate-800/50 border-slate-700/50 text-white placeholder:text-slate-500 focus:border-primary/50 focus:ring-primary/20 rounded-xl"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                            data-testid="input-email"
                          />
                        </div>
                      </div>

                      {/* Password */}
                      <div className="space-y-2">
                        <Label htmlFor="password" className="text-sm font-medium text-slate-300">Password</Label>
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 pointer-events-none" />
                          <Input
                            id="password"
                            type="password"
                            placeholder="Create a password"
                            className="pl-12 h-12 bg-slate-800/50 border-slate-700/50 text-white placeholder:text-slate-500 focus:border-primary/50 focus:ring-primary/20 rounded-xl"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="new-password"
                            data-testid="input-password"
                          />
                        </div>
                        {strength && (
                          <div className="space-y-1.5 pt-1">
                            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div className={`h-full ${strength.color} ${strength.width} transition-all duration-300`} />
                            </div>
                            <p className="text-xs text-slate-500">
                              Password strength: <span className={strength.textColor}>{strength.label}</span>
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Confirm Password */}
                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword" className="text-sm font-medium text-slate-300">Confirm Password</Label>
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 pointer-events-none" />
                          <Input
                            id="confirmPassword"
                            type="password"
                            placeholder="Confirm your password"
                            className="pl-12 h-12 bg-slate-800/50 border-slate-700/50 text-white placeholder:text-slate-500 focus:border-primary/50 focus:ring-primary/20 rounded-xl"
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

                      {/* reCAPTCHA v2 Widget */}
                      {recaptchaEnabled && !recaptchaError && !isV3 && (
                        <div className="flex flex-col items-center py-2" data-testid="recaptcha-container">
                          <div ref={recaptchaRef} />
                          {!recaptchaLoaded && (
                            <div className="flex items-center justify-center p-4 text-slate-400 text-sm">
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

                      {/* Terms */}
                      <div className="flex items-start gap-3 py-2">
                        <Checkbox
                          id="terms"
                          checked={termsAccepted}
                          onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                          className="mt-0.5 border-slate-600 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                          data-testid="checkbox-terms"
                        />
                        <Label
                          htmlFor="terms"
                          className="text-sm text-slate-400 font-normal leading-relaxed cursor-pointer"
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

                      {/* Error */}
                      {error && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-start gap-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-4"
                          data-testid="text-error"
                        >
                          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                          <span>{error}</span>
                        </motion.div>
                      )}

                      {/* Submit Button */}
                      <Button
                        type="submit"
                        className="w-full h-12 text-base font-semibold rounded-xl bg-primary hover:bg-primary/90 transition-all mt-2"
                        disabled={registerMutation.isPending}
                        data-testid="button-submit"
                      >
                        {registerMutation.isPending ? (
                          <>
                            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                            Creating account...
                          </>
                        ) : (
                          "Create account"
                        )}
                      </Button>

                      {/* reCAPTCHA Notice */}
                      {recaptchaEnabled && (
                        <p className="text-xs text-slate-500 text-center">
                          Protected by reCAPTCHA.{' '}
                          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition-colors">
                            Privacy
                          </a>
                          {' '}·{' '}
                          <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition-colors">
                            Terms
                          </a>
                        </p>
                      )}
                    </form>
                  </>
                )}
              </div>

              {/* Footer Links */}
              {registrationEnabled !== false && (
                <div className="mt-8 text-center space-y-4">
                  <p className="text-slate-400">
                    Already have an account?{' '}
                    <Link href="/login" className="text-primary hover:text-primary/80 font-semibold transition-colors" data-testid="link-login">
                      Sign in
                    </Link>
                  </p>
                  <p className="text-sm text-slate-600">
                    <a href="https://ozvps.com.au" className="hover:text-slate-400 transition-colors flex items-center justify-center gap-2" data-testid="link-back-to-website">
                      <ArrowLeft className="h-4 w-4" />
                      Back to ozvps.com.au
                    </a>
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
