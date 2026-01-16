import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AlertCircle, Mail, Loader2, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

export function EmailVerificationBanner() {
  const [dismissed, setDismissed] = useState(false);

  // Check auth status
  const { data: authData } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.getMe(),
  });

  const resendMutation = useMutation({
    mutationFn: async () => {
      // Get CSRF token
      const csrfToken = localStorage.getItem('csrfToken') ||
        document.cookie.split('; ').find(c => c.startsWith('ozvps_csrf='))?.split('=')[1] || '';

      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send verification email');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Verification email sent! Please check your inbox.');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send verification email');
    },
  });

  // Don't show if email is verified, user is not logged in, or banner was dismissed
  if (!authData || authData.emailVerified || dismissed) {
    return null;
  }

  return (
    <div className="bg-warning/10 border-l-4 border-l-warning rounded-lg p-4 mb-6 relative">
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        title="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <AlertCircle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-foreground mb-1">
            Email Verification Required
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            Please verify your email address <span className="font-medium text-foreground">{authData.email}</span> to access all features and deploy servers.
          </p>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => resendMutation.mutate()}
              disabled={resendMutation.isPending || resendMutation.isSuccess}
              className="border-warning/50 text-warning hover:bg-warning/20"
            >
              {resendMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : resendMutation.isSuccess ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Email Sent
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Resend Verification Email
                </>
              )}
            </Button>
            {resendMutation.isSuccess && (
              <span className="text-xs text-muted-foreground">
                Check your inbox and spam folder
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
