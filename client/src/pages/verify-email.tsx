import { Button } from "@/components/ui/button";
import { Mail, Loader2, CheckCircle2, AlertCircle, RefreshCw, XCircle } from "lucide-react";
import { useLocation, useSearch } from "wouter";
import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import logo from "@/assets/logo.png";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";

// Standalone component for token verification - NO AUTH REQUIRED
function TokenVerification({ token }: { token: string }) {
  const [verifyState, setVerifyState] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const verificationStarted = useRef(false);

  useEffect(() => {
    if (!verificationStarted.current) {
      verificationStarted.current = true;

      fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
        .then(async (res) => {
          const data = await res.json();
          if (res.ok) {
            setVerifyState('success');
          } else {
            setVerifyState('error');
            setVerifyError(data.error || 'Failed to verify email');
          }
        })
        .catch(() => {
          setVerifyState('error');
          setVerifyError('Failed to connect to server. Please try again.');
        });
    }
  }, [token]);

  if (verifyState === 'verifying') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Verifying your email...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted/30">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-radial from-primary/5 via-transparent to-transparent" />
        <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-gradient-radial from-blue-500/5 via-transparent to-transparent" />
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-8">
            <img
              src={logo}
              alt="OzVPS"
              className="h-12 w-auto dark:invert-0 invert mx-auto mb-4 drop-shadow-lg"
            />
          </div>

          <div className="bg-card/50 backdrop-blur-sm border border-border rounded-2xl p-8 shadow-xl">
            <div className="text-center">
              {verifyState === 'success' ? (
                <>
                  <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                  </div>
                  <h2 className="text-xl font-semibold text-foreground mb-3">
                    Email Verified!
                  </h2>
                  <p className="text-muted-foreground mb-6">
                    Your email has been successfully verified. You can now access all features of OzVPS.
                  </p>
                  <div className="p-4 bg-muted/50 rounded-lg border border-border">
                    <p className="text-sm text-muted-foreground">
                      You can close this page and return to the browser where you signed up.
                      It will automatically redirect to your dashboard.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <XCircle className="h-10 w-10 text-red-500" />
                  </div>
                  <h2 className="text-xl font-semibold text-foreground mb-3">
                    Verification Failed
                  </h2>
                  <p className="text-muted-foreground mb-6">
                    {verifyError || 'The verification link is invalid or has expired.'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Please sign in and request a new verification email.
                  </p>
                </>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      <footer className="py-6 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} OzVPS. All rights reserved.</p>
      </footer>
    </div>
  );
}

// Main component - checks for token first
export default function VerifyEmailPage() {
  useDocumentTitle("Verify Your Email - OzVPS");

  // Check for token IMMEDIATELY using window.location (most reliable)
  const hasToken = typeof window !== 'undefined' && window.location.search.includes('token=');
  const token = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('token')
    : null;

  // If there's a token, render the standalone verification component
  // This happens BEFORE any auth hooks are called
  if (hasToken && token) {
    return <TokenVerification token={token} />;
  }

  // No token - render the "waiting for verification" UI (requires auth)
  return <WaitingForVerification />;
}

// Component for logged-in users waiting for verification
function WaitingForVerification() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading, logout } = useAuth();
  const [resendCooldown, setResendCooldown] = useState(0);

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Polling to check if email has been verified
  const { data: meData } = useQuery({
    queryKey: ['auth', 'me', 'verification-poll'],
    queryFn: () => api.getMe(),
    refetchInterval: 3000,
    enabled: !!user,
    staleTime: 0,
  });

  // Redirect to dashboard if verified via polling
  useEffect(() => {
    if (meData?.user?.emailVerified || meData?.emailVerified) {
      queryClient.invalidateQueries({ queryKey: ['auth'] });
      setTimeout(() => navigate('/'), 500);
    }
  }, [meData, navigate, queryClient]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [authLoading, user, navigate]);

  // If already verified, redirect to dashboard
  useEffect(() => {
    if (user?.emailVerified) {
      navigate('/');
    }
  }, [user, navigate]);

  const resendMutation = useMutation({
    mutationFn: () => api.resendVerificationEmail(),
    onSuccess: () => {
      setResendCooldown(20);
    },
  });

  const handleResend = () => {
    if (resendCooldown === 0) {
      resendMutation.mutate();
    }
  };

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted/30">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-radial from-primary/5 via-transparent to-transparent" />
        <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-gradient-radial from-blue-500/5 via-transparent to-transparent" />
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-8">
            <img
              src={logo}
              alt="OzVPS"
              className="h-12 w-auto dark:invert-0 invert mx-auto mb-4 drop-shadow-lg"
            />
            <h1 className="text-2xl font-bold text-foreground">Verify Your Email</h1>
            <p className="text-muted-foreground mt-2">
              One more step to activate your account
            </p>
          </div>

          <div className="bg-card/50 backdrop-blur-sm border border-border rounded-2xl p-8 shadow-xl">
            <div className="text-center">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Mail className="h-10 w-10 text-primary" />
              </div>

              <h2 className="text-xl font-semibold text-foreground mb-3">
                Check Your Inbox
              </h2>

              <p className="text-muted-foreground mb-2">
                We've sent a verification email to:
              </p>

              <p className="text-foreground font-medium mb-6">
                {user?.email || 'your email address'}
              </p>

              <div className="bg-muted/30 rounded-lg p-4 mb-6 text-left">
                <p className="text-sm text-muted-foreground">
                  Click the verification link in the email to activate your account.
                  The page will automatically redirect once verified.
                </p>
              </div>

              {resendMutation.isError && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4"
                >
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{(resendMutation.error as Error).message}</span>
                </motion.div>
              )}

              {resendMutation.isSuccess && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 mb-4"
                >
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  <span>Verification email sent! Check your inbox.</span>
                </motion.div>
              )}

              <div className="space-y-3">
                <Button
                  onClick={handleResend}
                  variant="outline"
                  className="w-full"
                  disabled={resendMutation.isPending || resendCooldown > 0}
                >
                  {resendMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : resendCooldown > 0 ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Resend in {resendCooldown}s
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Resend verification email
                    </>
                  )}
                </Button>

                <Button
                  onClick={handleLogout}
                  variant="ghost"
                  className="w-full text-muted-foreground hover:text-foreground"
                >
                  Sign out and use a different email
                </Button>
              </div>

              <div className="mt-6 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Didn't receive the email? Check your spam folder or try resending.
                  If you continue having issues, contact{' '}
                  <a href="mailto:support@ozvps.com.au" className="text-primary hover:underline">
                    support@ozvps.com.au
                  </a>
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <footer className="py-6 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} OzVPS. All rights reserved.</p>
      </footer>
    </div>
  );
}
