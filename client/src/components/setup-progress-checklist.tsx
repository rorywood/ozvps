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
}

const CREDENTIAL_REVEAL_DELAY = 15;

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

export function SetupProgressChecklist({ state, serverName, onDismiss, onMinimize }: SetupProgressChecklistProps) {
  const { status, percent, error, credentials, isActive } = state;
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<'ip' | 'username' | 'password' | null>(null);
  const [credentialCountdown, setCredentialCountdown] = useState(CREDENTIAL_REVEAL_DELAY);
  const [credentialsRevealed, setCredentialsRevealed] = useState(false);
  const countdownStarted = useRef(false);

  const isComplete = status === 'complete';
  const isFailed = status === 'failed';
  
  useEffect(() => {
    if (isComplete && credentials && !countdownStarted.current) {
      countdownStarted.current = true;
      setCredentialCountdown(CREDENTIAL_REVEAL_DELAY);
      
      const interval = setInterval(() => {
        setCredentialCountdown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            setCredentialsRevealed(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [isComplete, credentials]);

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
      {/* Header with minimize button */}
      <div className="relative">
        {onMinimize && !isComplete && !isFailed && (
          <button
            onClick={onMinimize}
            className="absolute top-0 right-0 p-2 hover:bg-white/10 rounded-lg transition-colors text-muted-foreground hover:text-white"
            title="Minimize - continue in background"
            data-testid="button-minimize-setup"
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
          <h3 className="text-xl font-display font-semibold text-white">
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
            isComplete ? "text-green-500" : isFailed ? "text-red-500" : "text-white"
          )}>{percent}%</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
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
                stepState === 'pending' && "bg-white/5 border-white/20 text-white/40"
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
                    stepState === 'active' && "text-white",
                    stepState === 'pending' && "text-white/40"
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
                  stepState === 'pending' ? "text-white/30" : "text-muted-foreground"
                )}>
                  {step.description}
                </p>
              </div>

              {/* Decorative Icon */}
              <div className={cn(
                "hidden sm:flex",
                stepState === 'complete' && "text-green-500/50",
                stepState === 'active' && "text-primary/50",
                stepState === 'pending' && "text-white/10"
              )}>
                {step.icon}
              </div>
            </div>
          );
        })}
      </div>

      {/* Credentials Section - Only show on completion after countdown */}
      {isComplete && credentials && !credentialsRevealed && (
        <div className="space-y-4 p-5 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-blue-500/20">
              <Clock className="h-6 w-6 text-blue-400" />
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-blue-400">Server Starting Up</h4>
              <p className="text-xs text-muted-foreground">Please wait while your server finishes booting...</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-4 py-4">
            <div className="relative w-20 h-20">
              <svg className="w-20 h-20 transform -rotate-90">
                <circle
                  cx="40"
                  cy="40"
                  r="35"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                  className="text-white/10"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="35"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                  strokeDasharray={220}
                  strokeDashoffset={220 - (220 * (CREDENTIAL_REVEAL_DELAY - credentialCountdown) / CREDENTIAL_REVEAL_DELAY)}
                  className="text-blue-500 transition-all duration-1000"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-white">{credentialCountdown}</span>
              </div>
            </div>
          </div>
          <p className="text-sm text-center text-muted-foreground">
            Credentials will appear in {credentialCountdown} seconds
          </p>
        </div>
      )}
      
      {isComplete && credentials && credentialsRevealed && (
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
            <div className="flex items-center justify-between gap-3 bg-black/30 rounded-lg px-4 py-3">
              <div className="flex-1 min-w-0">
                <span className="text-xs text-muted-foreground block">Server IP</span>
                <p className="text-sm font-mono text-white truncate" data-testid="text-credentials-ip">
                  {credentials.serverIp}
                </p>
              </div>
              <button
                onClick={() => handleCopy(credentials.serverIp, 'ip')}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
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
            <div className="flex items-center justify-between gap-3 bg-black/30 rounded-lg px-4 py-3">
              <div className="flex-1 min-w-0">
                <span className="text-xs text-muted-foreground block">Username</span>
                <p className="text-sm font-mono text-white truncate" data-testid="text-credentials-username">
                  {credentials.username}
                </p>
              </div>
              <button
                onClick={() => handleCopy(credentials.username, 'username')}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
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
            <div className="flex items-center justify-between gap-3 bg-black/30 rounded-lg px-4 py-3">
              <div className="flex-1 min-w-0">
                <span className="text-xs text-muted-foreground block">Password</span>
                <p className="text-sm font-mono text-white truncate" data-testid="text-credentials-password">
                  {showPassword ? credentials.password : '••••••••••••'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
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
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
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

          {/* SSH Command Help */}
          <div className="pt-2 border-t border-white/10">
            <p className="text-xs text-muted-foreground mb-2">Connect via SSH:</p>
            <code className="text-xs font-mono text-green-400 bg-black/30 px-3 py-2 rounded block">
              ssh {credentials.username}@{credentials.serverIp}
            </code>
          </div>
        </div>
      )}

      {/* Action Button - Only show after credentials revealed or on failure */}
      {((isComplete && credentialsRevealed) || isFailed) && onDismiss && (
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
