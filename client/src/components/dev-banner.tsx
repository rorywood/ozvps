import { useState } from "react";
import { AlertCircle, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DevChangelog } from "./dev-changelog";
import { Button } from "@/components/ui/button";

export function DevBanner() {
  const [dismissed, setDismissed] = useState(false);
  const version = import.meta.env.VITE_APP_VERSION || "1.0.0-dev";
  const buildDate = import.meta.env.VITE_BUILD_DATE || new Date().toISOString().split('T')[0];

  // Show banner if:
  // 1. Version contains "-dev"
  // 2. OR hostname contains "dev"
  // 3. OR running in dev mode
  const isDev = version.includes("-dev") ||
                (typeof window !== "undefined" && window.location.hostname.includes("dev")) ||
                import.meta.env.MODE === "development" ||
                import.meta.env.DEV;

  if (!isDev || dismissed) return null;

  return (
    <Alert className="fixed top-0 left-0 right-0 z-[9999] h-14 rounded-none border-x-0 border-t-0 border-b-2 border-yellow-600 bg-yellow-500/20 text-yellow-600 dark:border-yellow-500 dark:bg-yellow-500/20 dark:text-yellow-500 shadow-lg">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between gap-4">
        <span className="font-semibold">
          ⚠️ Development Environment - Not for production use
        </span>
        <div className="flex items-center gap-3">
          <DevChangelog />
          <span className="text-xs opacity-75 font-mono">
            v{version} • {buildDate}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-yellow-600 hover:text-yellow-700 hover:bg-yellow-500/30 dark:text-yellow-500 dark:hover:text-yellow-400"
            onClick={() => setDismissed(true)}
            title="Dismiss (will reappear on page refresh)"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
