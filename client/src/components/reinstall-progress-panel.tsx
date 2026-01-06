import { useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Loader2, Eye, EyeOff, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import type { ReinstallTaskState, ReinstallStatus, TimelineEvent } from "@/hooks/use-reinstall-task";

interface ReinstallProgressPanelProps {
  state: ReinstallTaskState;
  onDismiss?: () => void;
}

const STATUS_LABELS: Record<ReinstallStatus, string> = {
  idle: 'Idle',
  queued: 'Queued',
  provisioning: 'Provisioning',
  imaging: 'Downloading Image',
  installing: 'Installing OS',
  configuring: 'Configuring',
  rebooting: 'Rebooting',
  complete: 'Complete',
  failed: 'Failed',
};

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function ReinstallProgressPanel({ state, onDismiss }: ReinstallProgressPanelProps) {
  const { status, percent, error, timeline, isActive, credentials } = state;
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<'ip' | 'username' | 'password' | null>(null);

  const isComplete = status === 'complete';
  const isFailed = status === 'failed';
  const isRunning = isActive && !isComplete && !isFailed;

  const handleCopy = async (value: string, field: 'ip' | 'username' | 'password') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isRunning && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
            {isComplete && <CheckCircle2 className="w-4 h-4 text-green-500" />}
            {isFailed && <AlertCircle className="w-4 h-4 text-red-500" />}
            <span className={cn(
              "font-medium",
              isComplete && "text-green-500",
              isFailed && "text-red-500",
              isRunning && "text-white"
            )}>
              {STATUS_LABELS[status]}
            </span>
          </div>
          <span className="text-sm text-muted-foreground">{percent}%</span>
        </div>
        
        <Progress 
          value={percent} 
          className={cn(
            "h-2",
            isFailed && "[&>div]:bg-red-500"
          )}
        />
        
        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}
      </div>

      {isComplete && credentials && (
        <div className="space-y-3 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
          <h4 className="text-sm font-medium text-green-400">Login Credentials</h4>
          <p className="text-xs text-muted-foreground">Save these credentials - they won't be shown again.</p>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 bg-black/20 rounded px-3 py-2">
              <div className="flex-1 min-w-0">
                <span className="text-xs text-muted-foreground">Server IP</span>
                <p className="text-sm font-mono text-white truncate" data-testid="text-credentials-ip">
                  {credentials.serverIp}
                </p>
              </div>
              <button
                onClick={() => handleCopy(credentials.serverIp, 'ip')}
                className="p-1.5 hover:bg-white/10 rounded transition-colors"
                data-testid="button-copy-ip"
              >
                {copiedField === 'ip' ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            </div>
            
            <div className="flex items-center justify-between gap-2 bg-black/20 rounded px-3 py-2">
              <div className="flex-1 min-w-0">
                <span className="text-xs text-muted-foreground">Username</span>
                <p className="text-sm font-mono text-white truncate" data-testid="text-credentials-username">
                  {credentials.username}
                </p>
              </div>
              <button
                onClick={() => handleCopy(credentials.username, 'username')}
                className="p-1.5 hover:bg-white/10 rounded transition-colors"
                data-testid="button-copy-username"
              >
                {copiedField === 'username' ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            </div>
            
            <div className="flex items-center justify-between gap-2 bg-black/20 rounded px-3 py-2">
              <div className="flex-1 min-w-0">
                <span className="text-xs text-muted-foreground">Password</span>
                <p className="text-sm font-mono text-white truncate" data-testid="text-credentials-password">
                  {showPassword ? credentials.password : '••••••••••••'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1.5 hover:bg-white/10 rounded transition-colors"
                  data-testid="button-toggle-password"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
                <button
                  onClick={() => handleCopy(credentials.password, 'password')}
                  className="p-1.5 hover:bg-white/10 rounded transition-colors"
                  data-testid="button-copy-password"
                >
                  {copiedField === 'password' ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {timeline.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Timeline</h4>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {timeline.map((event, index) => (
              <TimelineRow key={index} event={event} isLatest={index === timeline.length - 1} />
            ))}
          </div>
        </div>
      )}

      {(isComplete || isFailed) && onDismiss && (
        <button
          onClick={onDismiss}
          className={cn(
            "w-full py-2 text-white rounded-lg font-medium transition-colors",
            isComplete ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
          )}
          data-testid="button-dismiss-progress"
        >
          {isComplete ? 'Done' : 'Close'}
        </button>
      )}
    </div>
  );
}

function TimelineRow({ event, isLatest }: { event: TimelineEvent; isLatest: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-3 text-sm py-1.5 px-2 rounded",
      isLatest ? "bg-white/5" : ""
    )}>
      <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      <span className="text-muted-foreground">{formatTimestamp(event.timestamp)}</span>
      <span className={cn(
        "font-medium",
        event.status === 'complete' && "text-green-500",
        event.status === 'failed' && "text-red-500",
        !['complete', 'failed'].includes(event.status) && "text-white"
      )}>
        {STATUS_LABELS[event.status]}
      </span>
      {event.message && (
        <span className="text-muted-foreground truncate">{event.message}</span>
      )}
    </div>
  );
}
