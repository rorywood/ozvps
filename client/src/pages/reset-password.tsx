import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Eye, EyeOff, ArrowLeft, Loader2, CheckCircle2, AlertCircle, XCircle, Shield, Zap, Server } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState } from "react";
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

  // No token provided - show error in the new design
  if (!token) {
    return (
      <div className="min-h-screen flex bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        {/* Left Side - Branded Panel */}
        <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-primary/10" />
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/30 rounded-full blur-[128px] animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-500/20 rounded-full blur-[96px]" />
          <div className="relative z-10 flex flex-col justify-between p-12 w-full">
            <div>
              <Link href="/">
                <img src={logo} alt="OzVPS" className="h-12 w-auto cursor-pointer brightness-0 invert" />
              </Link>
            </div>
            <div className="space-y-12">
              <div>
                <h1 className="text-5xl font-bold mb-6 tracking-tight text-white leading-tight">
                  Reset Your<br />
                  <span className="text-primary">Password</span>
                </h1>
                <p className="text-xl text-slate-400 leading-relaxed max-w-md">
                  Create a new secure password to regain access to your account.
                </p>
              </div>
            </div>
            <div className="text-sm text-slate-600">
              © {new Date().getFullYear()} OzVPS. All rights reserved.
            </div>
          </div>
        </div>

        {/* Right Side */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
          <div className="w-full max-w-md">
            <div className="lg:hidden text-center mb-10">
              <Link href="/">
                <img src={logo} alt="OzVPS" className="h-12 w-auto mx-auto cursor-pointer brightness-0 invert" />
              </Link>
            </div>
            <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/50 rounded-2xl p-8 shadow-2xl shadow-black/20">
              <div className="text-center py-4">
                <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <XCircle className="h-10 w-10 text-red-500" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">Invalid Reset Link</h2>
                <p className="text-slate-400 mb-8">
                  No reset token was provided. Please request a new password reset link.
                </p>
                <Button asChild className="w-full h-12 font-semibold rounded-xl bg-primary hover:bg-primary/90">
                  <Link href="/forgot-password">Request new link</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
                className="h-16 w-auto cursor-pointer brightness-0 invert"
              />
            </Link>
          </div>

          {/* Main Content */}
          <div>
            <div className="mb-16">
              <h1 className="text-5xl font-bold mb-6 tracking-tight text-white leading-tight">
                Reset Your<br />
                <span className="text-primary">Password</span>
              </h1>
              <p className="text-xl text-slate-400 leading-relaxed max-w-md">
                Create a new secure password to regain access to your account.
              </p>
            </div>

            {/* Features */}
            <div className="grid gap-7">
              <div className="flex items-center gap-4 group">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:bg-primary/20 transition-colors">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Secure Reset</h3>
                  <p className="text-sm text-slate-500">Encrypted token verification</p>
                </div>
              </div>

              <div className="flex items-center gap-4 group">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:bg-primary/20 transition-colors">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Instant Access</h3>
                  <p className="text-sm text-slate-500">Login immediately after reset</p>
                </div>
              </div>

              <div className="flex items-center gap-4 group">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:bg-primary/20 transition-colors">
                  <Server className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Servers Safe</h3>
                  <p className="text-sm text-slate-500">All your data remains intact</p>
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

          {/* Form Card */}
          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/50 rounded-2xl p-8 shadow-2xl shadow-black/20">
            {/* Loading/Validating */}
            {validating && (
              <div className="text-center py-8">
                <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
                <p className="text-slate-400">Validating reset link...</p>
              </div>
            )}

            {/* Token Invalid */}
            {validationError && !validating && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-4"
              >
                <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <XCircle className="h-10 w-10 text-red-500" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">Invalid or Expired Link</h2>
                <p className="text-slate-400 mb-8">
                  {(validationError as Error).message}
                </p>
                <div className="space-y-3">
                  <Button asChild className="w-full h-12 font-semibold rounded-xl bg-primary hover:bg-primary/90">
                    <Link href="/forgot-password">Request new link</Link>
                  </Button>
                  <Button variant="outline" asChild className="w-full h-12 rounded-xl border-slate-700 text-slate-300 hover:bg-slate-800">
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
                <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">Password Reset!</h2>
                <p className="text-slate-400 mb-8">
                  Your password has been successfully reset. You can now log in with your new password.
                </p>
                <Button asChild className="w-full h-12 font-semibold rounded-xl bg-primary hover:bg-primary/90">
                  <Link href="/login">Go to login</Link>
                </Button>
              </motion.div>
            )}

            {/* Reset Form */}
            {tokenData?.valid && !success && (
              <>
                {/* Header */}
                <div className="mb-8">
                  <h1 className="text-2xl font-bold text-white mb-2">Create new password</h1>
                  <p className="text-slate-400">
                    Enter a strong password for your account
                  </p>
                </div>

                {tokenData.email && (
                  <div className="text-center text-sm text-slate-400 bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 mb-6">
                    Resetting password for <span className="text-white font-medium">{tokenData.email}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  {resetPasswordMutation.isError && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-start gap-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-4"
                    >
                      <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                      <span>{(resetPasswordMutation.error as Error).message}</span>
                    </motion.div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium text-slate-300">
                      New Password
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 pointer-events-none" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter new password"
                        className="pl-12 pr-12 h-12 bg-slate-800/50 border-slate-700/50 text-white placeholder:text-slate-500 focus:border-primary/50 focus:ring-primary/20 rounded-xl"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                    {password && !passwordValid ? (
                      <p className="text-xs text-red-400">Password must be at least 8 characters</p>
                    ) : (
                      <p className="text-xs text-slate-500">Must be at least 8 characters long</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-sm font-medium text-slate-300">
                      Confirm Password
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 pointer-events-none" />
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Confirm new password"
                        className="pl-12 pr-12 h-12 bg-slate-800/50 border-slate-700/50 text-white placeholder:text-slate-500 focus:border-primary/50 focus:ring-primary/20 rounded-xl"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
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
                    className="w-full h-12 text-base font-semibold rounded-xl bg-primary hover:bg-primary/90 transition-all mt-4"
                    disabled={resetPasswordMutation.isPending || !passwordValid || !passwordsMatch}
                  >
                    {resetPasswordMutation.isPending ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Resetting...
                      </>
                    ) : (
                      "Reset password"
                    )}
                  </Button>
                </form>
              </>
            )}
          </div>

          {/* Footer Links */}
          {tokenData?.valid && !success && (
            <div className="mt-8 text-center space-y-4">
              <p className="text-sm text-slate-600">
                <Link href="/login" className="hover:text-slate-400 transition-colors flex items-center justify-center gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back to login
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
