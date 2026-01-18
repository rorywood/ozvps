import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, ArrowLeft, Loader2, CheckCircle2, AlertCircle, Shield, Zap, Server } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import logo from "@/assets/logo.png";
import { useDocumentTitle } from "@/hooks/use-document-title";

export default function ForgotPasswordPage() {
  useDocumentTitle("Forgot Password - OzVPS");

  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const forgotPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
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
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      forgotPasswordMutation.mutate(email.trim());
    }
  };

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
              />
            </Link>
          </div>

          {/* Main Content */}
          <div className="space-y-12">
            <div>
              <h1 className="text-5xl font-bold mb-6 tracking-tight text-white leading-tight">
                Secure Account<br />
                <span className="text-primary">Recovery</span>
              </h1>
              <p className="text-xl text-slate-400 leading-relaxed max-w-md">
                We'll help you regain access to your account quickly and securely.
              </p>
            </div>

            {/* Features */}
            <div className="grid gap-8">
              <div className="flex items-center gap-4 group">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:bg-primary/20 transition-colors">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Instant Delivery</h3>
                  <p className="text-sm text-slate-500">Reset link sent immediately</p>
                </div>
              </div>

              <div className="flex items-center gap-4 group">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:bg-primary/20 transition-colors">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Secure Process</h3>
                  <p className="text-sm text-slate-500">Encrypted and time-limited links</p>
                </div>
              </div>

              <div className="flex items-center gap-4 group">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:bg-primary/20 transition-colors">
                  <Server className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Keep Your Servers</h3>
                  <p className="text-sm text-slate-500">All your data remains safe</p>
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
            {submitted ? (
              <div className="text-center py-4">
                <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">Check your email</h2>
                <p className="text-slate-400 mb-4">
                  If an account exists with <span className="text-white font-medium">{email}</span>, you'll receive a password reset link shortly.
                </p>
                <p className="text-sm text-slate-500 mb-8 pb-4 border-b border-slate-800">
                  The link will expire in 30 minutes. Check your spam folder if you don't see it.
                </p>
                <div className="space-y-3">
                  <Button
                    variant="outline"
                    className="w-full h-12 rounded-xl border-slate-700 text-slate-300 hover:bg-slate-800"
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
                  <p className="text-slate-400">
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
                    <Label htmlFor="email" className="text-sm font-medium text-slate-300">
                      Email
                    </Label>
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
                        autoFocus
                        required
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-12 text-base font-semibold rounded-xl bg-primary hover:bg-primary/90 transition-all mt-2"
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
                </form>
              </>
            )}
          </div>

          {/* Footer Links */}
          {!submitted && (
            <div className="mt-8 text-center space-y-4">
              <p className="text-slate-400">
                Remember your password?{' '}
                <Link href="/login" className="text-primary hover:text-primary/80 font-semibold transition-colors">
                  Sign in
                </Link>
              </p>
              <p className="text-sm text-slate-600">
                <a href="https://ozvps.com.au" className="hover:text-slate-400 transition-colors flex items-center justify-center gap-2">
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
