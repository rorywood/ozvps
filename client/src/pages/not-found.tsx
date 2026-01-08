import { Button } from "@/components/ui/button";
import { Home, ArrowLeft, Search, Globe } from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import logo from "@/assets/logo.png";
import { useDocumentTitle } from "@/hooks/use-document-title";

export default function NotFound() {
  useDocumentTitle('Page Not Found');

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-blue-500/5 via-transparent to-transparent" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-lg w-full text-center space-y-8 relative z-10"
      >
        <Link href="/">
          <img src={logo} alt="OzVPS" className="h-12 w-auto mx-auto cursor-pointer" data-testid="img-logo" />
        </Link>

        <div className="space-y-4">
          <div className="relative">
            <div className="text-[120px] sm:text-[160px] font-display font-bold text-primary/10 leading-none select-none">
              404
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Search className="h-16 w-16 sm:h-20 sm:w-20 text-primary/40" />
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground">
            Page Not Found
          </h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            The page you're looking for doesn't exist or has been moved. 
            Check the URL or head back to the dashboard.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            asChild
            className="gap-2 bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-700"
            data-testid="button-go-home"
          >
            <Link href="/dashboard">
              <Home className="h-4 w-4" />
              Go to Dashboard
            </Link>
          </Button>
          <Button
            variant="outline"
            className="gap-2 border-border"
            onClick={() => window.history.back()}
            data-testid="button-go-back"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </Button>
        </div>

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
