import { useState } from "react";
import { useLocation } from "wouter";
import { Loader2, CheckCircle2, ChevronDown, ChevronUp, X, Server, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProvisionTracker, type ActiveProvision } from "@/contexts/provision-tracker";

const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued...',
  provisioning: 'Provisioning resources...',
  imaging: 'Downloading OS image...',
  installing: 'Installing OS...',
  configuring: 'Configuring server...',
  complete: 'Server ready!',
  failed: 'Setup failed',
};

function ProvisionItem({ provision, onDismiss }: { provision: ActiveProvision; onDismiss: () => void }) {
  const [, navigate] = useLocation();
  const isComplete = provision.status === 'complete';
  const isFailed = provision.status === 'failed';

  return (
    <div className={cn(
      "group relative p-3 rounded-lg border transition-colors",
      isComplete
        ? "bg-success/10 border-success/20"
        : isFailed
        ? "bg-destructive/10 border-destructive/20"
        : "bg-card border-border"
    )}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn(
          "mt-0.5 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center",
          isComplete ? "bg-success/20" : isFailed ? "bg-destructive/20" : "bg-primary/10"
        )}>
          {isComplete ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : isFailed ? (
            <X className="h-4 w-4 text-destructive" />
          ) : (
            <Loader2 className="h-4 w-4 text-primary animate-spin" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground truncate">{provision.serverName}</p>
            <button
              onClick={onDismiss}
              className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-foreground transition-all"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className={cn(
            "text-xs mt-0.5",
            isComplete ? "text-success" : isFailed ? "text-destructive" : "text-muted-foreground"
          )}>
            {STATUS_LABELS[provision.status] || provision.status}
          </p>

          {/* Progress bar */}
          {!isComplete && !isFailed && (
            <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${provision.percent}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Go to server button */}
      {(isComplete || !isFailed) && (
        <button
          onClick={() => navigate(`/servers/${provision.serverId}`)}
          className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground bg-white/5 hover:bg-white/10 rounded-md transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          View Server
        </button>
      )}
    </div>
  );
}

export function ProvisionProgressWidget() {
  const { provisions, dismissProvision, hasActiveProvisions } = useProvisionTracker();
  const [collapsed, setCollapsed] = useState(false);

  const provisionList = Object.values(provisions);

  if (provisionList.length === 0) return null;

  const activeCount = provisionList.filter(p => p.status !== 'complete' && p.status !== 'failed').length;
  const completedCount = provisionList.filter(p => p.status === 'complete').length;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-72 shadow-2xl">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 bg-card border border-border rounded-t-xl text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <Server className="h-4 w-4 text-primary" />
            {activeCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse" />
            )}
          </div>
          <span>
            {activeCount > 0
              ? `Provisioning ${activeCount} server${activeCount > 1 ? 's' : ''}...`
              : `${completedCount} server${completedCount > 1 ? 's' : ''} ready`}
          </span>
        </div>
        {collapsed ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="bg-card border-x border-b border-border rounded-b-xl p-2 space-y-2 max-h-80 overflow-y-auto">
          {provisionList.map(provision => (
            <ProvisionItem
              key={provision.serverId}
              provision={provision}
              onDismiss={() => dismissProvision(provision.serverId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
