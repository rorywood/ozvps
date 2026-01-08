import { AlertTriangle, RefreshCw, Globe, ServerCrash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import logo from "@/assets/logo.png";
import { Link } from "wouter";
import { useDocumentTitle } from "@/hooks/use-document-title";

interface SystemErrorProps {
  errorCode?: string;
  onRetry?: () => void;
}

export default function SystemError({ errorCode = "API_UNAVAILABLE", onRetry }: SystemErrorProps) {
  useDocumentTitle('System Error');

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-red-500/5 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-lg w-full text-center space-y-8 relative z-10"
      >
        <Link href="/">
          <img src={logo} alt="OzVPS" className="h-12 w-auto mx-auto cursor-pointer" data-testid="img-logo" />
        </Link>

        <div className="space-y-6">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="mx-auto h-24 w-24 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20"
          >
            <ServerCrash className="h-12 w-12 text-red-500" />
          </motion.div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground">
              System Unavailable
            </h1>
            <p className="text-muted-foreground max-w-md mx-auto">
              We're experiencing some technical difficulties at the moment. 
              Please try again later.
            </p>
          </div>

          <div className="bg-muted/30 border border-border rounded-xl p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Error Code</div>
            <div className="font-mono text-red-400 text-lg" data-testid="text-error-code">{errorCode}</div>
          </div>
        </div>

        {onRetry && (
          <Button 
            onClick={onRetry}
            className="gap-2 bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-700"
            data-testid="button-retry"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        )}

        <div className="pt-4">
          <a 
            href="https://ozvps.com.au" 
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-back-to-website"
          >
            <Globe className="h-4 w-4" />
            Back to ozvps.com.au
          </a>
        </div>

        <p className="text-xs text-muted-foreground">
          Need help? Contact <a href="mailto:support@ozvps.com.au" className="text-primary hover:underline">support@ozvps.com.au</a>
        </p>
      </motion.div>
    </div>
  );
}
