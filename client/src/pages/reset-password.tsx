import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Eye, EyeOff, ArrowLeft, Loader2, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import logo from "@/assets/logo.png";
import { useDocumentTitle } from "@/hooks/use-document-title";

export default function ResetPasswordPage() {
  useDocumentTitle("Reset Password - OzVPS");

  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [success, setSuccess] = useState(false);

  // Get token from URL
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');

  // Validate token on load
  const { data: tokenData, isLoading: validating, error: validationError } = useQuery({
    queryKey: ['validate-reset-token', token],
    queryFn: async () => {
      if (!token) throw new Error('No reset token provided');
      const response = await fetch(`/api/auth/validate-reset-token?token=${encodeURIComponent(token)}`);
      const data = await response.json();
      if (!data.valid) {
        throw new Error(data.error || 'Invalid reset token');
      }
      return data;
    },
    enabled: !!token,
    retry: false,
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ token, password }: { token: string; password: string }) => {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password');
      }
      return data;
    },
    onSuccess: () => {
      setSuccess(true);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (token && password && password === confirmPassword) {
      resetPasswordMutation.mutate({ token, password });
    }
  };

  // Password validation
  const passwordValid = password.length >= 8;
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  // No token provided
  if (!token) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted/30">
        <div className="flex-1 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md text-center"
          >
            <div className="bg-card/50 backdrop-blur-sm border border-border rounded-2xl p-8 shadow-xl">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle className="h-8 w-8 text-red-500" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">Invalid Reset Link</h2>
              <p className="text-muted-foreground mb-6">
                No reset token was provided. Please request a new password reset link.
              </p>
              <Button asChild className="w-full">
                <Link href="/forgot-password">Request new link</Link>
              </Button>
            </div>
          </motion.div>
        </div>
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
            <Link href="/">
              <img
                src={logo}
                alt="OzVPS"
                className="h-12 w-auto dark:invert-0 invert mx-auto mb-4 drop-shadow-lg"
              />
            </Link>
            <h1 className="text-2xl font-bold text-foreground">Reset Password</h1>
            <p className="text-muted-foreground mt-2">
              Create a new password for your account
            </p>
          </div>

          {/* Card */}
          <div className="bg-card/50 backdrop-blur-sm border border-border rounded-2xl p-8 shadow-xl">
            {/* Loading/Validating */}
            {validating && (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
                <p className="text-muted-foreground">Validating reset link...</p>
              </div>
            )}

            {/* Token Invalid */}
            {validationError && !validating && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-4"
              >
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <XCircle className="h-8 w-8 text-red-500" />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-2">Invalid or Expired Link</h2>
                <p className="text-muted-foreground mb-6">
                  {(validationError as Error).message}
                </p>
                <div className="space-y-3">
                  <Button asChild className="w-full">
                    <Link href="/forgot-password">Request new link</Link>
                  </Button>
                  <Button variant="outline" asChild className="w-full">
                    <Link href="/login">Back to login</Link>
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Success */}
            {success && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-4"
              >
                <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-2">Password Reset!</h2>
                <p className="text-muted-foreground mb-6">
                  Your password has been successfully reset. You can now log in with your new password.
                </p>
                <Button asChild className="w-full">
                  <Link href="/login">Go to login</Link>
                </Button>
              </motion.div>
            )}

            {/* Reset Form */}
            {tokenData?.valid && !success && (
              <form onSubmit={handleSubmit} className="space-y-6">
                {tokenData.email && (
                  <div className="text-center text-sm text-muted-foreground bg-muted/30 rounded-lg p-3 mb-4">
                    Resetting password for <span className="text-foreground font-medium">{tokenData.email}</span>
                  </div>
                )}

                {resetPasswordMutation.isError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3"
                  >
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{(resetPasswordMutation.error as Error).message}</span>
                  </motion.div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-foreground font-medium">
                    New Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter new password"
                      className="pl-10 pr-10 h-11 bg-input border-border focus-visible:ring-primary/50"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {password && !passwordValid ? (
                    <p className="text-xs text-red-400">Password must be at least 8 characters</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Must be at least 8 characters long</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-foreground font-medium">
                    Confirm Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Confirm new password"
                      className="pl-10 pr-10 h-11 bg-input border-border focus-visible:ring-primary/50"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {confirmPassword && !passwordsMatch && (
                    <p className="text-xs text-red-400">Passwords don't match</p>
                  )}
                  {passwordsMatch && passwordValid && (
                    <p className="text-xs text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Passwords match
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 text-base font-medium bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-700 text-white shadow-lg shadow-primary/25 border-0"
                  disabled={resetPasswordMutation.isPending || !passwordValid || !passwordsMatch}
                >
                  {resetPasswordMutation.isPending ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    "Reset Password"
                  )}
                </Button>

                <div className="text-center">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to login
                  </Link>
                </div>
              </form>
            )}
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <footer className="py-6 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} OzVPS. All rights reserved.</p>
      </footer>
    </div>
  );
}
