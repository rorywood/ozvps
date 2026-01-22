import { Button } from "@/components/ui/button";
import { Mail, Loader2, CheckCircle2, AlertCircle, RefreshCw, XCircle } from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import logo from "@/assets/logo.png";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";

export default function VerifyEmailPage() {
  useDocumentTitle("Verify Your Email - OzVPS");

  const [, navigate] = useLocation();
  const searchString = useSearch();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading, logout } = useAuth();
  const [resendCooldown, setResendCooldown] = useState(0);

  // Extract token from URL if present
  const params = new URLSearchParams(searchString);
  const token = params.get('token');

  // State for token verification
  const [verifyState, setVerifyState] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Track if we've started verification to prevent re-runs
  const verificationStarted = useRef(false);

  // Handle token verification on mount - ONLY ONCE
  useEffect(() => {
    if (token && !verificationStarted.current) {
      verificationStarted.current = true;
      setVerifyState('verifying');

      fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
        .then(async (res) => {
          const data = await res.json();
          if (res.ok) {
            setVerifyState('success');
            // Don't auto-redirect - let user click the button
          } else {
            setVerifyState('error');
            setVerifyError(data.error || 'Failed to verify email');
          }
        })
        .catch((err) => {
          setVerifyState('error');
          setVerifyError('Failed to connect to server. Please try again.');
        });
    }
  }, [token]);

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Polling to check if email has been verified (only when NOT processing a token)
  const { data: meData } = useQuery({
    queryKey: ['auth', 'me', 'verification-poll'],
    queryFn: () => api.getMe(),
    refetchInterval: 3000,
    enabled: !!user && !token, // Only poll when logged in AND not verifying via token
    staleTime: 0,
  });

  // Redirect to dashboard if verified via polling (not token verification)
  useEffect(() => {
    if (!token && (meData?.user?.emailVerified || meData?.emailVerified)) {
      queryClient.invalidateQueries({ queryKey: ['auth'] });
      setTimeout(() => navigate('/'), 500);
    }
  }, [meData, navigate, queryClient, token]);

  // Redirect to login if not authenticated AND no token
  useEffect(() => {
    if (!authLoading && !user && !token) {
      navigate('/login');
    }
  }, [authLoading, user, navigate, token]);

  // If already verified AND no token, redirect to dashboard
  useEffect(() => {
    if (!token && user?.emailVerified) {
      navigate('/');
    }
  }, [user, navigate, token]);

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

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleContinueToDashboard = () => {
    // Refresh auth state then navigate
    queryClient.invalidateQueries({ queryKey: ['auth'] });
    navigate('/');
  };

  // ============================================
  // TOKEN VERIFICATION FLOW (when ?token= is present)
  // ============================================
  if (token) {
    // Show loading while verifying
    if (verifyState === 'idle' || verifyState === 'verifying') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Verifying your email...</p>
          </div>
        </div>
      );
    }

    // Show success or error result
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
                    <p className="text-muted-foreground mb-4">
                      Your email has been successfully verified. You can now access all features of OzVPS.
                    </p>
                    {user ? (
                      <Button onClick={handleContinueToDashboard} className="w-full" size="lg">
                        Continue to Dashboard
                      </Button>
                    ) : (
                      <div className="space-y-4">
                        <div className="p-4 bg-muted/50 rounded-lg border border-border">
                          <p className="text-sm text-muted-foreground">
                            You can close this page and return to the browser where you signed up.
                            It will automatically redirect to your dashboard.
                          </p>
                        </div>
                        <Button onClick={() => navigate('/login')} variant="outline" className="w-full">
                          Or sign in here
                        </Button>
                      </div>
                    )}
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
                    <div className="space-y-3">
                      <Button onClick={() => navigate('/login')} className="w-full">
                        Go to Login
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Sign in to request a new verification email
                      </p>
                    </div>
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

  // ============================================
  // WAITING FOR VERIFICATION FLOW (no token, user logged in)
  // ============================================

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
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
