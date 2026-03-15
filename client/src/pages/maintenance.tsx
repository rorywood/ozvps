import logo from "@/assets/logo.png";
import { Wrench, RefreshCw } from "lucide-react";

export default function MaintenancePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <div className="max-w-md w-full space-y-8">
        {/* Logo */}
        <div className="flex justify-center">
          <img src={logo} alt="OzVPS" className="h-12 w-auto" />
        </div>

        {/* Icon */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/10 animate-pulse" />
            <div className="relative w-20 h-20 rounded-full border-2 border-primary/40 bg-primary/10 flex items-center justify-center">
              <Wrench className="h-9 w-9 text-primary" />
            </div>
          </div>
        </div>

        {/* Text */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-foreground">
            Platform Upgrade
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            We're performing scheduled maintenance to improve your experience.
            All existing servers and services are{" "}
            <span className="text-success font-medium">fully operational</span>{" "}
            — only the control panel is temporarily unavailable.
          </p>
        </div>

        {/* Status indicator */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Control Panel</span>
            <span className="flex items-center gap-1.5 text-warning font-medium">
              <span className="w-2 h-2 rounded-full bg-warning inline-block animate-pulse" />
              Maintenance
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Server Infrastructure</span>
            <span className="flex items-center gap-1.5 text-success font-medium">
              <span className="w-2 h-2 rounded-full bg-success inline-block" />
              Operational
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Network</span>
            <span className="flex items-center gap-1.5 text-success font-medium">
              <span className="w-2 h-2 rounded-full bg-success inline-block" />
              Operational
            </span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground/60">
          This page will automatically refresh when we're back online.
        </p>

        {/* Auto-refresh */}
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh page
        </button>
      </div>
    </div>
  );
}
