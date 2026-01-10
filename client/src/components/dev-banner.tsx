import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function DevBanner() {
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

  if (!isDev) return null;

  return (
    <>
      {/* Spacer to prevent content from going under the banner */}
      <div className="h-14" aria-hidden="true" />

      {/* Fixed banner at top */}
      <Alert className="fixed top-0 left-0 right-0 z-[9999] rounded-none border-x-0 border-t-0 border-b-2 border-yellow-600 bg-yellow-500/20 text-yellow-600 dark:border-yellow-500 dark:bg-yellow-500/20 dark:text-yellow-500 shadow-lg">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between gap-4">
          <span className="font-semibold">
            ⚠️ Development Environment - Not for production use
          </span>
          <span className="text-xs opacity-75 font-mono">
            v{version} • {buildDate}
          </span>
        </AlertDescription>
      </Alert>
    </>
  );
}
