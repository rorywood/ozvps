import { Button } from "@/components/ui/button";
import { Mail, Loader2, CheckCircle2, AlertCircle, RefreshCw, XCircle } from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import { useState, useEffect } from "react";
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

  // Handle token verification on mount
  useEffect(() => {
    if (token && verifyState === 'idle') {
      setVerifyState('verifying');

      // Call the verify API endpoint
      fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
        .then(async (res) => {
          const data = await res.json();
          if (res.ok) {
            setVerifyState('success');
            // Refresh auth state after verification
            queryClient.invalidateQueries({ queryKey: ['auth'] });
            // Auto-redirect to dashboard after 5 seconds (give user time to read)
            setTimeout(() => {
              navigate('/');
            }, 5000);
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
  }, [token, verifyState, queryClient, navigate]);

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Polling to check if email has been verified - poll regardless of current state
  const { data: meData, refetch: refetchMe } = useQuery({
    queryKey: ['auth', 'me', 'verification-poll'],
    queryFn: () => api.getMe(),
    refetchInterval: 3000, // Check every 3 seconds
    enabled: !!user, // Poll as long as user is logged in
    staleTime: 0, // Always fetch fresh
  });

  // Redirect to dashboard if verified (check both meData and refreshed auth)
  // BUT only if we're not already showing the token verification success page
  useEffect(() => {
    // Don't redirect if we just verified via token - let that handler show the success message
    if (verifyState === 'success' || verifyState === 'verifying') {
      return;
    }
    if (meData?.user?.emailVerified || meData?.emailVerified) {
      // Invalidate all auth queries to refresh the app state
      queryClient.invalidateQueries({ queryKey: ['auth'] });
      // Small delay to ensure state updates, then redirect
      setTimeout(() => {
        navigate('/');
      }, 500);
    }
  }, [meData, navigate, queryClient, verifyState]);

  // Redirect to login if not authenticated (but NOT if we have a token - let verification complete first)
  useEffect(() => {
    if (!authLoading && !user && !token) {
      navigate('/login');
    }
  }, [authLoading, user, navigate, token]);

  // If already verified, redirect to dashboard
  // BUT not if we just verified via token - let that success page show first
  useEffect(() => {
    if (user?.emailVerified && verifyState !== 'success') {
      navigate('/');
    }
  }, [user, navigate, verifyState]);

  const resendMutation = useMutation({
    mutationFn: () => api.resendVerificationEmail(),
    onSuccess: () => {
      setResendCooldown(20); // 20 second cooldown
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

  // Show loading state (but don't wait for auth if we have a token)
  // Also show loading if token exists but verification hasn't completed yet (idle or verifying)
  if ((authLoading && !token) || (token && (verifyState === 'idle' || verifyState === 'verifying'))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          {token && <p className="text-muted-foreground">Verifying your email...</p>}
        </div>
      </div>
    );
  }

  // Token verification result page (only show when we have a definitive result: success or error)
  if (token && (verifyState === 'success' || verifyState === 'error')) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted/30">
        {/* Background decoration */}
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
            {/* Logo */}
            <div className="text-center mb-8">
              <img
                src={logo}
                alt="OzVPS"
                className="h-12 w-auto dark:invert-0 invert mx-auto mb-4 drop-shadow-lg"
              />
            </div>

            {/* Card */}
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
                    <p className="text-sm text-muted-foreground mb-6">
                      Redirecting to dashboard in a moment...
                    </p>
                    <Button onClick={() => navigate('/')} className="w-full">
                      Continue to Dashboard Now
                    </Button>
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
                      {user ? (
                        <Button onClick={() => navigate('/verify-email')} className="w-full">
                          Request New Verification Email
                        </Button>
                      ) : (
                        <>
                          <Button onClick={() => navigate('/login')} className="w-full">
                            Sign In
                          </Button>
                          <p className="text-xs text-muted-foreground">
                            Sign in to request a new verification email
                          </p>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Footer */}
        <footer className="py-6 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} OzVPS. All rights reserved.</p>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted/30">
      {/* Background decoration */}
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
          {/* Logo */}
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

          {/* Card */}
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

      {/* Footer */}
      <footer className="py-6 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} OzVPS. All rights reserved.</p>
      </footer>
    </div>
  );
}
