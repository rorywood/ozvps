import { useState, useEffect } from "react";
import { AlertCircle, CheckCircle2, Clock, Loader2, Eye, EyeOff, Copy, Check, Terminal, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReinstallTaskState, ReinstallStatus, TimelineEvent } from "@/hooks/use-reinstall-task";

const AUTO_DISMISS_MS = 2 * 60 * 1000; // 2 minutes

interface ReinstallProgressPanelProps {
  state: ReinstallTaskState;
  onDismiss?: () => void;
}

const STATUS_CONFIG: Record<ReinstallStatus, { label: string; color: string; bgColor: string }> = {
  idle: { label: 'Idle', color: 'text-slate-400', bgColor: 'bg-slate-500/10' },
  queued: { label: 'Queued', color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  provisioning: { label: 'Provisioning', color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  imaging: { label: 'Downloading Image', color: 'text-cyan-400', bgColor: 'bg-cyan-500/10' },
  installing: { label: 'Installing OS', color: 'text-amber-400', bgColor: 'bg-amber-500/10' },
  configuring: { label: 'Configuring', color: 'text-cyan-400', bgColor: 'bg-cyan-500/10' },
  rebooting: { label: 'Rebooting', color: 'text-orange-400', bgColor: 'bg-orange-500/10' },
  complete: { label: 'Complete', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  failed: { label: 'Failed', color: 'text-red-400', bgColor: 'bg-red-500/10' },
};

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function ReinstallProgressPanel({ state, onDismiss }: ReinstallProgressPanelProps) {
  const { status, percent, error, timeline, isActive, credentials } = state;
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<'ip' | 'username' | 'password' | 'ssh' | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  const isComplete = status === 'complete';
  const isFailed = status === 'failed';
  const isRunning = isActive && !isComplete && !isFailed;
  const config = STATUS_CONFIG[status];

  // Auto-dismiss credentials after 2 minutes
  useEffect(() => {
    if (isComplete && credentials && onDismiss) {
      const startTime = Date.now();
      setTimeRemaining(AUTO_DISMISS_MS);

      const countdownInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, AUTO_DISMISS_MS - elapsed);
        setTimeRemaining(remaining);

        if (remaining <= 0) {
          clearInterval(countdownInterval);
          onDismiss();
        }
      }, 1000);

      return () => clearInterval(countdownInterval);
    }
  }, [isComplete, credentials, onDismiss]);

  const handleCopy = async (value: string, field: 'ip' | 'username' | 'password' | 'ssh') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const sshCommand = credentials ? `ssh ${credentials.username}@${credentials.serverIp}` : '';

  return (
    <div className="space-y-5">
      {/* Status Header */}
      <div className={cn(
        "rounded-xl p-4 border",
        "bg-gradient-to-r from-blue-500/10 to-blue-600/5 border-blue-500/20", // Default
        isComplete && "from-emerald-500/10 to-emerald-600/5 border-emerald-500/20",
        isFailed && "from-red-500/10 to-red-600/5 border-red-500/20"
      )}>
        <div className="flex items-center gap-3 mb-3">
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center",
            "bg-blue-500/20", // Default
            isComplete && "bg-emerald-500/20",
            isFailed && "bg-red-500/20"
          )}>
            {isComplete ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : isFailed ? (
              <AlertCircle className="w-5 h-5 text-red-400" />
            ) : (
              <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
            )}
          </div>
          <div className="flex-1">
            <h3 className={cn("font-semibold", config.color)}>
              {config.label}
            </h3>
            <p className="text-sm text-muted-foreground">
              {isRunning && "Your server is being set up..."}
              {isComplete && "Server is ready to use!"}
              {isFailed && "Installation encountered an error"}
            </p>
          </div>
          <div className={cn(
            "px-3 py-1.5 rounded-full text-sm font-medium",
            config.bgColor, config.color
          )}>
            {percent}%
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-2.5 bg-black/30 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500 ease-out",
              "bg-gradient-to-r from-blue-500 to-blue-400", // Default
              isComplete && "from-emerald-500 to-emerald-400",
              isFailed && "from-red-500 to-red-400"
            )}
            style={{ width: `${Math.max(percent, 2)}%` }}
          />
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </p>
        )}
      </div>

      {/* Credentials Section */}
      {isComplete && credentials && (
        <div className="rounded-xl overflow-hidden border border-emerald-500/20">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-white" />
              <h4 className="font-semibold text-white text-sm">SSH Login Credentials</h4>
            </div>
            {timeRemaining !== null && timeRemaining > 0 && (
              <span className="text-xs text-white/70">
                Auto-hides in {Math.ceil(timeRemaining / 1000)}s
              </span>
            )}
          </div>

          <div className="bg-card/50 p-4 space-y-3">
            <p className="text-xs text-amber-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              Save these credentials - they won't be shown again
            </p>

            {/* IP Address */}
            <div className="flex items-center justify-between gap-3 bg-black/20 rounded-lg px-4 py-3">
              <div className="min-w-0">
                <span className="text-xs text-muted-foreground block mb-0.5">IP Address</span>
                <p className="text-sm font-mono text-blue-400 truncate" data-testid="text-credentials-ip">
                  {credentials.serverIp}
                </p>
              </div>
              <button
                onClick={() => handleCopy(credentials.serverIp, 'ip')}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors flex-shrink-0"
                data-testid="button-copy-ip"
              >
                {copiedField === 'ip' ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            </div>

            {/* Username */}
            <div className="flex items-center justify-between gap-3 bg-black/20 rounded-lg px-4 py-3">
              <div className="min-w-0">
                <span className="text-xs text-muted-foreground block mb-0.5">Username</span>
                <p className="text-sm font-mono text-foreground truncate" data-testid="text-credentials-username">
                  {credentials.username}
                </p>
              </div>
              <button
                onClick={() => handleCopy(credentials.username, 'username')}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors flex-shrink-0"
                data-testid="button-copy-username"
              >
                {copiedField === 'username' ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            </div>

            {/* Password */}
            <div className="flex items-center justify-between gap-3 bg-black/20 rounded-lg px-4 py-3">
              <div className="min-w-0 flex-1">
                <span className="text-xs text-muted-foreground block mb-0.5">Password</span>
                <p className="text-sm font-mono text-amber-400 truncate" data-testid="text-credentials-password">
                  {showPassword ? credentials.password : '••••••••••••'}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-2 hover:bg-white/5 rounded-lg transition-colors"
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
                  className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                  data-testid="button-copy-password"
                >
                  {copiedField === 'password' ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
              </div>
            </div>

            {/* Quick Connect Command */}
            <div className="mt-4 pt-3 border-t border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Quick Connect</span>
              </div>
              <div className="flex items-center justify-between gap-3 bg-black rounded-lg px-4 py-3 font-mono text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-emerald-400">$</span>
                  <span className="text-foreground truncate">{sshCommand}</span>
                </div>
                <button
                  onClick={() => handleCopy(sshCommand, 'ssh')}
                  className="p-2 hover:bg-white/5 rounded-lg transition-colors flex-shrink-0"
                >
                  {copiedField === 'ssh' ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      {timeline.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <h4 className="text-sm font-medium text-muted-foreground">Activity Timeline</h4>
          </div>
          <div className="space-y-1 max-h-36 overflow-y-auto rounded-lg bg-black/20 p-2">
            {timeline.map((event, index) => (
              <TimelineRow key={index} event={event} isLatest={index === timeline.length - 1} />
            ))}
          </div>
        </div>
      )}

      {/* Action Button */}
      {(isComplete || isFailed) && onDismiss && (
        <button
          onClick={onDismiss}
          className={cn(
            "w-full py-3 rounded-xl font-semibold transition-all",
            isComplete && "bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-lg shadow-emerald-500/20",
            isFailed && "bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white shadow-lg shadow-red-500/20"
          )}
          data-testid="button-dismiss-progress"
        >
          {isComplete ? 'Continue to Server' : 'Close'}
        </button>
      )}
    </div>
  );
}

function TimelineRow({ event, isLatest }: { event: TimelineEvent; isLatest: boolean }) {
  const config = STATUS_CONFIG[event.status];

  return (
    <div className={cn(
      "flex items-center gap-3 text-xs py-2 px-3 rounded-lg transition-colors",
      isLatest ? "bg-white/5" : "hover:bg-white/5"
    )}>
      <div className={cn(
        "w-2 h-2 rounded-full flex-shrink-0",
        event.status === 'complete' && "bg-emerald-400",
        event.status === 'failed' && "bg-red-400",
        !['complete', 'failed'].includes(event.status) && "bg-blue-400"
      )} />
      <span className="text-muted-foreground font-mono">{formatTimestamp(event.timestamp)}</span>
      <span className={cn("font-medium", config.color)}>
        {config.label}
      </span>
      {event.message && (
        <span className="text-muted-foreground truncate flex-1">{event.message}</span>
      )}
    </div>
  );
}
