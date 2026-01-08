import { Button } from "@/components/ui/button";
import { Home, RefreshCw, Globe, ServerCrash, WifiOff, Clock, AlertTriangle, ShieldX, Ban } from "lucide-react";
import { Link, useParams } from "wouter";
import { motion } from "framer-motion";
import logo from "@/assets/logo.png";
import { useDocumentTitle } from "@/hooks/use-document-title";

interface ErrorConfig {
  code: string;
  title: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  bgColor: string;
}

const errorConfigs: Record<string, ErrorConfig> = {
  '500': {
    code: '500',
    title: 'Internal Server Error',
    description: 'Something went wrong on our end. Our team has been notified and is working on a fix.',
    icon: ServerCrash,
    iconColor: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  '502': {
    code: '502',
    title: 'Bad Gateway',
    description: 'We\'re having trouble connecting to our servers. Please try again in a few moments.',
    icon: WifiOff,
    iconColor: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
  },
  '503': {
    code: '503',
    title: 'Service Unavailable',
    description: 'We\'re currently performing maintenance or experiencing high traffic. Please check back shortly.',
    icon: Clock,
    iconColor: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
  '504': {
    code: '504',
    title: 'Gateway Timeout',
    description: 'The request took too long to complete. Please try again.',
    icon: Clock,
    iconColor: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
  },
  '401': {
    code: '401',
    title: 'Unauthorized',
    description: 'You need to be logged in to access this page.',
    icon: ShieldX,
    iconColor: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  '403': {
    code: '403',
    title: 'Access Denied',
    description: 'You don\'t have permission to access this resource.',
    icon: Ban,
    iconColor: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  'default': {
    code: 'Error',
    title: 'Something Went Wrong',
    description: 'An unexpected error occurred. Please try again or contact support if the problem persists.',
    icon: AlertTriangle,
    iconColor: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
};

interface ErrorPageProps {
  code?: string;
  title?: string;
  description?: string;
}

export default function ErrorPage({ code: propCode, title: propTitle, description: propDescription }: ErrorPageProps) {
  const params = useParams<{ code?: string }>();
  const errorCode = propCode || params.code || 'default';
  
  const config = errorConfigs[errorCode] || errorConfigs['default'];
  const Icon = config.icon;
  
  const displayTitle = propTitle || config.title;
  const displayDescription = propDescription || config.description;
  const displayCode = errorCode !== 'default' ? errorCode : config.code;

  useDocumentTitle(displayTitle);

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
            className={`mx-auto h-24 w-24 rounded-full ${config.bgColor} flex items-center justify-center border border-current/10`}
          >
            <Icon className={`h-12 w-12 ${config.iconColor}`} />
          </motion.div>

          <div className="space-y-2">
            <div className="inline-block px-3 py-1 rounded-full bg-muted text-muted-foreground text-sm font-mono">
              Error {displayCode}
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground">
              {displayTitle}
            </h1>
            <p className="text-muted-foreground max-w-md mx-auto">
              {displayDescription}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            className="gap-2 bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-700"
            onClick={() => window.location.reload()}
            data-testid="button-retry"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
          <Button
            asChild
            variant="outline"
            className="gap-2 border-border"
            data-testid="button-go-home"
          >
            <Link href="/dashboard">
              <Home className="h-4 w-4" />
              Go to Dashboard
            </Link>
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
