import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SystemErrorProps {
  errorCode?: string;
  onRetry?: () => void;
}

export default function SystemError({ errorCode = "API_UNAVAILABLE", onRetry }: SystemErrorProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto h-20 w-20 rounded-full bg-red-500/10 flex items-center justify-center">
          <AlertTriangle className="h-10 w-10 text-red-500" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-display font-bold text-foreground">Oh No!</h1>
          <p className="text-lg text-muted-foreground">
            We're experiencing some technical difficulties at the moment.
          </p>
          <p className="text-muted-foreground">
            Please try again later. If the problem persists, contact support.
          </p>
        </div>

        <div className="bg-muted/50 border border-border rounded-lg p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Error Code</div>
          <div className="font-mono text-red-400 text-lg" data-testid="text-error-code">{errorCode}</div>
        </div>

        {onRetry && (
          <Button 
            onClick={onRetry}
            className="bg-primary hover:bg-primary/90"
            data-testid="button-retry"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        )}

        <p className="text-xs text-muted-foreground">
          OzVPS Panel &bull; <a href="https://ozvps.com.au/support" className="text-primary hover:underline">Contact Support</a>
        </p>
      </div>
    </div>
  );
}
