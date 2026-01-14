import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, ArrowLeft, Loader2, CheckCircle2, AlertCircle, ServerCrash } from "lucide-react";
import { Link } from "wouter";
import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import logo from "@/assets/logo.png";
import { useDocumentTitle } from "@/hooks/use-document-title";

export default function ForgotPasswordPage() {
  useDocumentTitle("Forgot Password - OzVPS");

  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);

  // Check service health on component mount
  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    fetch('/api/health', { signal: controller.signal })
      .then(res => {
        clearTimeout(timeoutId);
        if (!res.ok) {
          setServiceUnavailable(true);
        }
        return res.json();
      })
      .then(data => {
        if (data.status !== 'ok') {
          setServiceUnavailable(true);
        }
      })
      .catch(() => {
        clearTimeout(timeoutId);
        setServiceUnavailable(true);
      });

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

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
            <h1 className="text-2xl font-bold text-foreground">Forgot Password</h1>
            <p className="text-muted-foreground mt-2">
              Enter your email to receive a password reset link
            </p>
          </div>

          {/* Card */}
          <div className="bg-card/50 backdrop-blur-sm border border-border rounded-2xl p-8 shadow-xl">
            {submitted ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-4"
              >
                <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-2">Check your email</h2>
                <p className="text-muted-foreground mb-6">
                  If an account exists with <span className="text-foreground font-medium">{email}</span>, you'll receive a password reset link shortly.
                </p>
                <p className="text-sm text-muted-foreground mb-6">
                  The link will expire in 30 minutes. Check your spam folder if you don't see it.
                </p>
                <div className="space-y-3">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setSubmitted(false);
                      setEmail("");
                    }}
                  >
                    Send another email
                  </Button>
                  <Button asChild className="w-full">
                    <Link href="/login">Back to login</Link>
                  </Button>
                </div>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                {serviceUnavailable && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-3 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-4"
                  >
                    <ServerCrash className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium mb-1">Service Temporarily Unavailable</p>
                      <p className="text-amber-300/80 text-xs">
                        Our systems are currently undergoing maintenance. Please try again in a few minutes.
                      </p>
                    </div>
                  </motion.div>
                )}

                {forgotPasswordMutation.isError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3"
                  >
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{(forgotPasswordMutation.error as Error).message}</span>
                  </motion.div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-foreground font-medium">
                    Email address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      className="pl-10 h-11 bg-input border-border focus-visible:ring-primary/50"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 text-base font-medium bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-700 text-white shadow-lg shadow-primary/25 border-0"
                  disabled={forgotPasswordMutation.isPending || !email.trim()}
                >
                  {forgotPasswordMutation.isPending ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send reset link"
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
