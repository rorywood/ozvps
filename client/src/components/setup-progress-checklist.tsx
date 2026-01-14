import { useState, useEffect, useRef } from "react";
import { CheckCircle2, Circle, Loader2, AlertCircle, Eye, EyeOff, Copy, Check, Rocket, Server, HardDrive, Settings, Power, Shield, Clock, X } from "lucide-react";
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

// Credentials now shown immediately upon completion

interface ChecklistStep {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  statuses: ReinstallStatus[];
}

const SETUP_STEPS: ChecklistStep[] = [
  {
    id: 'queued',
    label: 'Server Queued',
    description: 'Your setup request has been submitted',
    icon: <Server className="h-5 w-5" />,
    statuses: ['queued'],
  },
  {
    id: 'provisioning',
    label: 'Provisioning Resources',
    description: 'Allocating CPU, memory, and storage',
    icon: <Settings className="h-5 w-5" />,
    statuses: ['provisioning'],
  },
  {
    id: 'imaging',
    label: 'Downloading OS Image',
    description: 'Fetching the operating system',
    icon: <HardDrive className="h-5 w-5" />,
    statuses: ['imaging'],
  },
  {
    id: 'installing',
    label: 'Installing Operating System',
    description: 'Setting up your selected OS',
    icon: <Rocket className="h-5 w-5" />,
    statuses: ['installing'],
  },
  {
    id: 'configuring',
    label: 'Configuring Server',
    description: 'Applying network and security settings',
    icon: <Shield className="h-5 w-5" />,
    statuses: ['configuring'],
  },
  {
    id: 'rebooting',
    label: 'Starting Server',
    description: 'Booting up and finalizing setup',
    icon: <Power className="h-5 w-5" />,
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
      {/* Header with minimize/close button */}
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
        {onClose && (isComplete || isFailed) && (
          <button
            onClick={onClose}
            className="absolute top-0 right-0 p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
            title="Close"
            data-testid="button-close-setup"
          >
            <X className="h-5 w-5" />
          </button>
        )}
        <div className="text-center space-y-2">
          <div className={cn(
            "mx-auto w-16 h-16 rounded-full flex items-center justify-center",
            isComplete ? "bg-green-500/20" : isFailed ? "bg-red-500/20" : "bg-primary/20"
          )}>
            {isComplete ? (
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            ) : isFailed ? (
              <AlertCircle className="h-8 w-8 text-red-500" />
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
            isComplete ? "text-green-500" : isFailed ? "text-red-500" : "text-foreground"
          )}>{percent}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className={cn(
              "h-full transition-all duration-500 ease-out rounded-full",
              isComplete ? "bg-green-500" : isFailed ? "bg-red-500" : "bg-primary"
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Checklist Steps */}
      <div className="space-y-1">
        {SETUP_STEPS.map((step, index) => {
          const stepState = getStepState(step, status);
          
          return (
            <div
              key={step.id}
              className={cn(
                "flex items-center gap-4 p-4 rounded-lg transition-all",
                stepState === 'active' && "bg-primary/10 border border-primary/20",
                stepState === 'complete' && "bg-green-500/5",
                stepState === 'pending' && "opacity-50"
              )}
              data-testid={`setup-step-${step.id}`}
            >
              {/* Step Icon/Status */}
              <div className={cn(
                "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                stepState === 'complete' && "bg-green-500/20 border-green-500 text-green-500",
                stepState === 'active' && "bg-primary/20 border-primary text-primary",
                stepState === 'pending' && "bg-muted/50 border-border text-foreground/40"
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
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "font-medium",
                    stepState === 'complete' && "text-green-400",
                    stepState === 'active' && "text-foreground",
                    stepState === 'pending' && "text-foreground/40"
                  )}>
                    {step.label}
                  </span>
                  {stepState === 'complete' && (
                    <span className="text-xs text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">
                      Done
                    </span>
                  )}
                </div>
                <p className={cn(
                  "text-sm",
                  stepState === 'pending' ? "text-foreground/30" : "text-muted-foreground"
                )}>
                  {step.description}
                </p>
              </div>

              {/* Decorative Icon */}
              <div className={cn(
                "hidden sm:flex",
                stepState === 'complete' && "text-green-500/50",
                stepState === 'active' && "text-primary/50",
                stepState === 'pending' && "text-foreground/10"
              )}>
                {step.icon}
              </div>
            </div>
          );
        })}
      </div>

      {/* Credentials Section - Show immediately on completion */}
      {isComplete && credentials && (
        <div className="space-y-4 p-5 bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <Shield className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <h4 className="font-medium text-green-400">SSH Login Credentials</h4>
              <p className="text-xs text-muted-foreground">Save these credentials - they won't be shown again</p>
            </div>
          </div>
          
          <div className="space-y-3">
            {/* Server IP */}
            <div className="flex items-center justify-between gap-3 bg-card/30 rounded-lg px-4 py-3">
              <div className="flex-1 min-w-0">
                <span className="text-xs text-muted-foreground block">Server IP</span>
                <p className="text-sm font-mono text-foreground truncate" data-testid="text-credentials-ip">
                  {credentials.serverIp}
                </p>
              </div>
              <button
                onClick={() => handleCopy(credentials.serverIp, 'ip')}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
                data-testid="button-copy-ip"
              >
                {copiedField === 'ip' ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            </div>
            
            {/* Username */}
            <div className="flex items-center justify-between gap-3 bg-card/30 rounded-lg px-4 py-3">
              <div className="flex-1 min-w-0">
                <span className="text-xs text-muted-foreground block">Username</span>
                <p className="text-sm font-mono text-foreground truncate" data-testid="text-credentials-username">
                  {credentials.username}
                </p>
              </div>
              <button
                onClick={() => handleCopy(credentials.username, 'username')}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
                data-testid="button-copy-username"
              >
                {copiedField === 'username' ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            </div>
            
            {/* Password */}
            <div className="flex items-center justify-between gap-3 bg-card/30 rounded-lg px-4 py-3">
              <div className="flex-1 min-w-0">
                <span className="text-xs text-muted-foreground block">Password</span>
                <p className="text-sm font-mono text-foreground truncate" data-testid="text-credentials-password">
                  {showPassword ? credentials.password : '••••••••••••'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-2 hover:bg-muted rounded-lg transition-colors"
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
                  className="p-2 hover:bg-muted rounded-lg transition-colors"
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

          {/* SSH Command with Copy Button */}
          <div className="pt-2 border-t border-border space-y-3">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Quick Connect:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono text-green-400 bg-card/30 px-3 py-2 rounded">
                  ssh {credentials.username}@{credentials.serverIp}
                </code>
                <button
                  onClick={handleCopySshCommand}
                  className="p-2 hover:bg-muted rounded-lg transition-colors shrink-0"
                  title="Copy SSH command"
                  data-testid="button-copy-ssh-command"
                >
                  {copiedSshCommand ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
              </div>
            </div>

            {/* SSH Connection Guide */}
            <div className="bg-card/30 rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-foreground">How to Connect:</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Copy the SSH command above</li>
                <li>Open your terminal or SSH client</li>
                <li>Paste and run the command</li>
                <li>Enter the password when prompted</li>
                <li>Change your password after first login</li>
              </ol>
            </div>

            {/* Confirmation Checkbox */}
            <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <input
                type="checkbox"
                id="confirm-saved"
                checked={confirmedSaved}
                onChange={(e) => setConfirmedSaved(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-amber-500/50 bg-card text-amber-500 focus:ring-amber-500 focus:ring-offset-0"
                data-testid="checkbox-confirm-saved"
              />
              <label htmlFor="confirm-saved" className="text-xs text-amber-300 cursor-pointer">
                I've saved these credentials securely. I understand they won't be shown again unless I reset the password.
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Action Button - Only show after credentials are acknowledged or on failure */}
      {((isComplete && credentials && confirmedSaved) || isFailed) && onDismiss && (
        <Button
          onClick={onDismiss}
          className={cn(
            "w-full",
            isComplete 
              ? "bg-green-600 hover:bg-green-700 text-white" 
              : "bg-red-600 hover:bg-red-700 text-white"
          )}
          data-testid="button-dismiss-setup"
        >
          {isComplete ? 'Continue to Server' : 'Close'}
        </Button>
      )}
    </div>
  );
}
