import { useState, useEffect } from "react";
import { CheckCircle2, Circle, Loader2, AlertCircle, Eye, EyeOff, Copy, Check, Shield, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReinstallTaskState, ReinstallStatus } from "@/hooks/use-reinstall-task";
import { Button } from "@/components/ui/button";

interface SetupProgressChecklistProps {
  state: ReinstallTaskState;
  serverName?: string;
  onDismiss?: () => void;
  onMinimize?: () => void;
  onClose?: () => void;
}

interface ChecklistStep {
  id: string;
  label: string;
  description: string;
  statuses: ReinstallStatus[];
}

const SETUP_STEPS: ChecklistStep[] = [
  {
    id: 'queued',
    label: 'Server Queued',
    description: 'Your setup request has been submitted',
    statuses: ['queued'],
  },
  {
    id: 'provisioning',
    label: 'Provisioning Resources',
    description: 'Allocating CPU, memory, and storage',
    statuses: ['provisioning'],
  },
  {
    id: 'imaging',
    label: 'Downloading OS Image',
    description: 'Fetching the operating system',
    statuses: ['imaging'],
  },
  {
    id: 'installing',
    label: 'Installing Operating System',
    description: 'Setting up your selected OS',
    statuses: ['installing'],
  },
  {
    id: 'configuring',
    label: 'Configuring Server',
    description: 'Applying network and security settings',
    statuses: ['configuring'],
  },
  {
    id: 'rebooting',
    label: 'Starting Server',
    description: 'Booting up and finalizing setup',
    statuses: ['rebooting', 'complete'],
  },
];

const STATUS_ORDER: ReinstallStatus[] = ['idle', 'queued', 'provisioning', 'imaging', 'installing', 'configuring', 'rebooting', 'complete'];

function getStepState(step: ChecklistStep, currentStatus: ReinstallStatus): 'pending' | 'active' | 'complete' {
  const currentIndex = STATUS_ORDER.indexOf(currentStatus);
  const stepStartStatuses = step.statuses;

  const stepMaxIndex = Math.max(...stepStartStatuses.map(s => STATUS_ORDER.indexOf(s)));
  const stepMinIndex = Math.min(...stepStartStatuses.map(s => STATUS_ORDER.indexOf(s)));

  if (currentStatus === 'complete') return 'complete';
  if (currentStatus === 'failed') {
    if (currentIndex >= stepMinIndex) return 'active';
    return 'pending';
  }

  if (currentIndex > stepMaxIndex) return 'complete';
  if (step.statuses.includes(currentStatus)) return 'active';
  return 'pending';
}

export function SetupProgressChecklist({ state, serverName, onDismiss, onMinimize, onClose }: SetupProgressChecklistProps) {
  const { status, percent, error, credentials, isActive } = state;
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<'ip' | 'username' | 'password' | null>(null);
  const [copiedSshCommand, setCopiedSshCommand] = useState(false);
  const [confirmedSaved, setConfirmedSaved] = useState(false);

  const isComplete = status === 'complete';
  const isFailed = status === 'failed';

  const handleCopy = async (value: string, field: 'ip' | 'username' | 'password') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleCopySshCommand = async () => {
    if (!credentials) return;
    const sshCommand = `ssh ${credentials.username}@${credentials.serverIp}`;
    try {
      await navigator.clipboard.writeText(sshCommand);
      setCopiedSshCommand(true);
      setTimeout(() => setCopiedSshCommand(false), 2000);
    } catch (err) {
      console.error('Failed to copy SSH command:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with minimize button (only during active setup, not on complete) */}
      <div className="relative">
        {onMinimize && !isComplete && !isFailed && (
          <button
            onClick={onMinimize}
            className="absolute top-0 right-0 p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
            title="Minimize - continue in background"
            data-testid="button-minimize-setup"
          >
            <X className="h-5 w-5" />
          </button>
        )}
        {/* REMOVED: Close button - now auto-dismisses after completion */}
        <div className="text-center space-y-2">
          <div className={cn(
            "mx-auto w-16 h-16 rounded-full flex items-center justify-center",
            isComplete ? "bg-success/10" : isFailed ? "bg-destructive/10" : "bg-primary/10"
          )}>
            {isComplete ? (
              <CheckCircle2 className="h-8 w-8 text-success" />
            ) : isFailed ? (
              <AlertCircle className="h-8 w-8 text-destructive" />
            ) : (
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            )}
          </div>
          <h3 className="text-xl font-display font-semibold text-foreground">
            {isComplete ? 'Setup Complete!' : isFailed ? 'Setup Failed' : 'Setting Up Server'}
          </h3>
          {serverName && (
            <p className="text-sm text-muted-foreground">{serverName}</p>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Progress</span>
          <span className={cn(
            "font-medium",
            isComplete ? "text-success" : isFailed ? "text-destructive" : "text-foreground"
          )}>{percent}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-500 ease-out rounded-full",
              isComplete ? "bg-success" : isFailed ? "bg-destructive" : "bg-primary"
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Checklist Steps - DO Style: Minimal, Clean */}
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        {SETUP_STEPS.map((step, index) => {
          const stepState = getStepState(step, status);

          return (
            <div
              key={step.id}
              className={cn(
                "flex items-center gap-4 px-4 py-3 transition-colors",
                index !== 0 && "border-t border-border",
                stepState === 'active' && "bg-primary/5"
              )}
              data-testid={`setup-step-${step.id}`}
            >
              {/* Step Icon/Status - Minimal */}
              <div className={cn(
                "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all",
                stepState === 'complete' && "bg-success/20 text-success",
                stepState === 'active' && "bg-primary/20 text-primary",
                stepState === 'pending' && "bg-muted text-muted-foreground"
              )}>
                {stepState === 'complete' ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : stepState === 'active' ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Circle className="h-5 w-5" />
                )}
              </div>

              {/* Step Content */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground">
                  {step.label}
                </div>
                <div className="text-sm text-muted-foreground">
                  {step.description}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Credentials Section - Show immediately when complete */}
      {isComplete && credentials && (
        <div className="space-y-4 p-5 bg-success/10 border border-success/20 rounded-lg">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-success" />
            <div>
              <h4 className="font-medium text-success">SSH Login Credentials</h4>
              <p className="text-xs text-muted-foreground">Save these credentials - they won't be shown again</p>
            </div>
          </div>

          <div className="space-y-2">
            {/* Server IP */}
            <div className="flex items-center justify-between gap-3 bg-card/30 rounded-lg px-3 py-2">
              <div className="flex-1 min-w-0">
                <span className="text-xs text-muted-foreground block">Server IP</span>
                <p className="text-sm font-mono text-foreground truncate" data-testid="text-credentials-ip">
                  {credentials.serverIp}
                </p>
              </div>
              <button
                onClick={() => handleCopy(credentials.serverIp, 'ip')}
                className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                data-testid="button-copy-ip"
              >
                {copiedField === 'ip' ? (
                  <Check className="w-4 h-4 text-success" />
                ) : (
                  <Copy className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            </div>

            {/* Username */}
            <div className="flex items-center justify-between gap-3 bg-card/30 rounded-lg px-3 py-2">
              <div className="flex-1 min-w-0">
                <span className="text-xs text-muted-foreground block">Username</span>
                <p className="text-sm font-mono text-foreground truncate" data-testid="text-credentials-username">
                  {credentials.username}
                </p>
              </div>
              <button
                onClick={() => handleCopy(credentials.username, 'username')}
                className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                data-testid="button-copy-username"
              >
                {copiedField === 'username' ? (
                  <Check className="w-4 h-4 text-success" />
                ) : (
                  <Copy className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            </div>

            {/* Password */}
            <div className="flex items-center justify-between gap-3 bg-card/30 rounded-lg px-3 py-2">
              <div className="flex-1 min-w-0">
                <span className="text-xs text-muted-foreground block">Password</span>
                <p className="text-sm font-mono text-foreground truncate" data-testid="text-credentials-password">
                  {showPassword ? credentials.password : '••••••••••••'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1.5 hover:bg-muted rounded-lg transition-colors"
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
                  className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                  data-testid="button-copy-password"
                >
                  {copiedField === 'password' ? (
                    <Check className="w-4 h-4 text-success" />
                  ) : (
                    <Copy className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* SSH Command with Copy Button */}
          <div className="pt-2 border-t border-border space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Quick Connect:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono text-success bg-card/30 px-3 py-2 rounded">
                ssh {credentials.username}@{credentials.serverIp}
              </code>
              <button
                onClick={handleCopySshCommand}
                className="p-2 hover:bg-muted rounded-lg transition-colors shrink-0"
                title="Copy SSH command"
                data-testid="button-copy-ssh-command"
              >
                {copiedSshCommand ? (
                  <Check className="w-4 h-4 text-success" />
                ) : (
                  <Copy className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            </div>

            {/* Confirmation Checkbox */}
            <div className="flex items-start gap-3 bg-warning/10 border border-warning/20 rounded-lg p-3 mt-3">
              <input
                type="checkbox"
                id="confirm-saved"
                checked={confirmedSaved}
                onChange={(e) => setConfirmedSaved(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-warning/50 bg-card text-warning focus:ring-warning focus:ring-offset-0"
                data-testid="checkbox-confirm-saved"
              />
              <label htmlFor="confirm-saved" className="text-xs text-muted-foreground cursor-pointer">
                I've saved these credentials securely. I understand they won't be shown again unless I reset the password.
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Auto-redirect message for completion */}
      {isComplete && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-3 bg-success/10 border border-success/20 rounded-lg">
          <Loader2 className="h-4 w-4 animate-spin text-success" />
          <span>
            {credentials && !confirmedSaved
              ? 'Please confirm you saved the credentials above'
              : 'Redirecting to server overview...'}
          </span>
        </div>
      )}

      {/* Action Button - Only show for failed state */}
      {isFailed && onDismiss && (
        <Button
          onClick={onDismiss}
          className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          data-testid="button-dismiss-setup"
        >
          Close
        </Button>
      )}
    </div>
  );
}
