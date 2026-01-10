import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function DevBanner() {
  // Only show in development environment
  const isDev = import.meta.env.MODE === "development" ||
                window.location.hostname.includes("dev.") ||
                import.meta.env.DEV;

  if (!isDev) return null;

  const version = import.meta.env.VITE_APP_VERSION || "1.0.0-dev";
  const buildDate = import.meta.env.VITE_BUILD_DATE || new Date().toISOString().split('T')[0];

  return (
    <Alert className="fixed top-0 left-0 right-0 z-50 rounded-none border-x-0 border-t-0 border-b border-yellow-600 bg-yellow-500/10 text-yellow-600 dark:border-yellow-500 dark:bg-yellow-500/10 dark:text-yellow-500">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between gap-4">
        <span className="font-medium">
          Development Environment - Not for production use
        </span>
        <span className="text-xs opacity-75">
          v{version} • {buildDate}
        </span>
      </AlertDescription>
    </Alert>
  );
}
