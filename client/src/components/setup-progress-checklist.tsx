import { useState } from "react";
import {
  CheckCircle2, AlertCircle, Eye, EyeOff, Copy, Check,
  Clock, Cpu, Download, HardDrive, Settings2, Terminal, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReinstallTaskState, ReinstallStatus } from "@/hooks/use-reinstall-task";
import { Button } from "@/components/ui/button";

interface SetupProgressChecklistProps {
  state: ReinstallTaskState;
  serverName?: string;
  isReinstall?: boolean;
  onDismiss?: () => void;
  onClose?: () => void;
}

const PHASES = [
  {
    key: "queued" as ReinstallStatus,
    shortLabel: "Queue",
    label: "Server Queued",
    description: "Your request is in the queue",
    Icon: Clock,
  },
  {
    key: "provisioning" as ReinstallStatus,
    shortLabel: "Provision",
    label: "Provisioning",
    description: "Allocating CPU, memory, and storage",
    Icon: Cpu,
  },
  {
    key: "imaging" as ReinstallStatus,
    shortLabel: "Image",
    label: "Downloading Image",
    description: "Fetching the operating system",
    Icon: Download,
  },
  {
    key: "installing" as ReinstallStatus,
    shortLabel: "Install",
    label: "Installing OS",
    description: "Setting up your selected operating system",
    Icon: HardDrive,
  },
  {
    key: "configuring" as ReinstallStatus,
    shortLabel: "Configure",
    label: "Configuring",
    description: "Applying network and security settings",
    Icon: Settings2,
  },
];

// Map rebooting → configuring so it shows naturally in the stepper
const DISPLAY_STATUS_MAP: Partial<Record<ReinstallStatus, ReinstallStatus>> = {
  rebooting: "configuring",
};

// Order used for "phase complete" comparisons
const PHASE_ORDER: ReinstallStatus[] = [
  "queued", "provisioning", "imaging", "installing", "configuring",
];

export function SetupProgressChecklist({
  state,
  serverName,
  isReinstall = false,
  onDismiss,
  onClose,
}: SetupProgressChecklistProps) {
  const { status: rawStatus, percent, error, credentials } = state;
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const status = DISPLAY_STATUS_MAP[rawStatus] ?? rawStatus;

  const isComplete = rawStatus === "complete";
  const isFailed = rawStatus === "failed";
  const isRunning = !isComplete && !isFailed;

  const currentPhase =
    PHASES.find((p) => p.key === status) ??
    (isComplete ? PHASES[PHASES.length - 1] : PHASES[0]);
  const CurrentIcon = currentPhase.Icon;

  const handleCopy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  };

  const sshCommand = credentials
    ? `ssh ${credentials.username}@${credentials.serverIp}`
    : "";

  return (
    <div className="space-y-10">
      {/* ── Central animated status ── */}
      <div className="flex flex-col items-center gap-5 py-2">
        {/* Icon ring */}
        <div className="relative flex items-center justify-center">
          {isRunning && (
            <div className="absolute w-40 h-40 rounded-full border border-primary/20 animate-ping" />
          )}
          {isRunning && (
            <div className="absolute w-32 h-32 rounded-full bg-primary/5 animate-pulse" />
          )}
          <div
            className={cn(
              "relative w-28 h-28 rounded-full border-2 flex items-center justify-center transition-all duration-700",
              isRunning && "border-primary/50 bg-primary/10",
              isComplete && "border-success/50 bg-success/10",
              isFailed && "border-destructive/50 bg-destructive/10"
            )}
          >
            {isComplete ? (
              <CheckCircle2 className="h-12 w-12 text-success" />
            ) : isFailed ? (
              <AlertCircle className="h-12 w-12 text-destructive" />
            ) : (
              <CurrentIcon className="h-12 w-12 text-primary" />
            )}
          </div>
        </div>

        {/* Status text */}
        <div className="text-center space-y-1.5">
          <h2
            className={cn(
              "text-2xl font-bold",
              isComplete
                ? "text-success"
                : isFailed
                ? "text-destructive"
                : "text-foreground"
            )}
          >
            {isComplete
              ? isReinstall
                ? "Reinstall Complete!"
                : "Server Ready!"
              : isFailed
              ? "Setup Failed"
              : currentPhase.label}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isComplete
              ? "Your server is up and running"
              : isFailed
              ? error || "Something went wrong during setup"
              : currentPhase.description}
          </p>
        </div>

        {/* Progress bar */}
        {!isComplete && (
          <div className="w-full max-w-xs space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Progress</span>
              <span
                className={cn(
                  "font-medium tabular-nums",
                  isFailed ? "text-destructive" : "text-foreground"
                )}
              >
                {percent}%
              </span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700 ease-out",
                  isFailed ? "bg-destructive" : "bg-primary"
                )}
                style={{ width: `${Math.max(percent, 2)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Stage stepper ── */}
      {!isFailed && (
        <div className="flex w-full px-2">
          {PHASES.map((phase, i) => {
            const phaseIdx = PHASE_ORDER.indexOf(phase.key);
            const currentIdx = PHASE_ORDER.indexOf(status as ReinstallStatus);
            const isPhaseComplete = isComplete || currentIdx > phaseIdx;
            const isPhaseActive = status === phase.key;

            return (
              <div key={phase.key} className="flex-1 flex flex-col items-center relative">
                {/* Left half connecting line */}
                {i > 0 && (
                  <div
                    className={cn(
                      "absolute top-2 right-1/2 w-1/2 h-px transition-colors duration-500",
                      isPhaseComplete || isPhaseActive
                        ? "bg-primary/50"
                        : "bg-border"
                    )}
                  />
                )}
                {/* Right half connecting line */}
                {i < PHASES.length - 1 && (
                  <div
                    className={cn(
                      "absolute top-2 left-1/2 w-1/2 h-px transition-colors duration-500",
                      isPhaseComplete ? "bg-primary/50" : "bg-border"
                    )}
                  />
                )}
                {/* Dot */}
                <div
                  className={cn(
                    "relative z-10 w-4 h-4 rounded-full transition-all duration-300 flex items-center justify-center",
                    isPhaseComplete && "bg-success",
                    isPhaseActive && "bg-primary ring-4 ring-primary/20",
                    !isPhaseComplete && !isPhaseActive && "bg-muted border border-border"
                  )}
                >
                  {isPhaseComplete && (
                    <Check className="h-2.5 w-2.5 text-white" />
                  )}
                </div>
                {/* Label */}
                <span
                  className={cn(
                    "text-[10px] font-medium mt-2 whitespace-nowrap transition-colors duration-300",
                    isPhaseComplete
                      ? "text-success/70"
                      : isPhaseActive
                      ? "text-primary"
                      : "text-muted-foreground/40"
                  )}
                >
                  {phase.shortLabel}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Credentials (slide in on complete) ── */}
      {isComplete && credentials && (
        <div className="space-y-3 animate-in slide-in-from-bottom-4 fade-in duration-500">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-success" />
            <span className="font-semibold text-success text-sm">
              SSH Credentials
            </span>
            <span className="text-xs text-muted-foreground ml-auto">
              Sent to your email — save them now
            </span>
          </div>

          {/* 3-column grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <CredentialCard
              label="IP Address"
              value={credentials.serverIp}
              mono
              valueColor="text-primary"
              isCopied={copied === "ip"}
              onCopy={() => handleCopy(credentials.serverIp, "ip")}
              testIdValue="text-credentials-ip"
              testIdCopy="button-copy-ip"
            />
            <CredentialCard
              label="Username"
              value={credentials.username}
              mono
              isCopied={copied === "username"}
              onCopy={() => handleCopy(credentials.username, "username")}
              testIdValue="text-credentials-username"
              testIdCopy="button-copy-username"
            />
            <CredentialCard
              label="Password"
              value={showPassword ? credentials.password : "••••••••••••"}
              mono
              valueColor="text-warning"
              showPasswordToggle
              isPasswordVisible={showPassword}
              onTogglePassword={() => setShowPassword((v) => !v)}
              isCopied={copied === "password"}
              onCopy={() => handleCopy(credentials.password, "password")}
              testIdValue="text-credentials-password"
              testIdCopy="button-copy-password"
            />
          </div>

          {/* SSH quick-connect */}
          <div className="bg-black/40 border border-border rounded-lg px-4 py-3 flex items-center gap-3">
            <Terminal className="h-4 w-4 text-muted-foreground shrink-0" />
            <code className="flex-1 text-sm font-mono text-success truncate">
              {sshCommand}
            </code>
            <button
              onClick={() => handleCopy(sshCommand, "ssh")}
              className="p-1.5 hover:bg-muted rounded-lg transition-colors shrink-0"
              data-testid="button-copy-ssh-command"
            >
              {copied === "ssh" ? (
                <Check className="w-4 h-4 text-success" />
              ) : (
                <Copy className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          </div>

          <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 text-xs text-muted-foreground">
            <strong className="text-warning">Important:</strong> These
            credentials won't be shown again. Save them in a password manager
            before continuing.
          </div>
        </div>
      )}

      {/* ── Action buttons ── */}
      {isComplete && onDismiss && (
        <Button
          onClick={onDismiss}
          className="w-full bg-success hover:bg-success/90 text-white font-semibold"
          data-testid="button-continue-to-server"
        >
          Continue to Server
        </Button>
      )}
      {isFailed && onClose && (
        <Button
          variant="outline"
          onClick={onClose}
          className="w-full"
          data-testid="button-dismiss-setup"
        >
          Close
        </Button>
      )}
    </div>
  );
}

// ── Credential card sub-component ──

interface CredentialCardProps {
  label: string;
  value: string;
  mono?: boolean;
  valueColor?: string;
  isCopied: boolean;
  onCopy: () => void;
  showPasswordToggle?: boolean;
  isPasswordVisible?: boolean;
  onTogglePassword?: () => void;
  testIdValue?: string;
  testIdCopy?: string;
}

function CredentialCard({
  label,
  value,
  mono,
  valueColor,
  isCopied,
  onCopy,
  showPasswordToggle,
  isPasswordVisible,
  onTogglePassword,
  testIdValue,
  testIdCopy,
}: CredentialCardProps) {
  return (
    <div className="bg-card border border-border rounded-lg p-3 space-y-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "text-sm flex-1 min-w-0 truncate",
            mono && "font-mono",
            valueColor ?? "text-foreground"
          )}
          data-testid={testIdValue}
        >
          {value}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          {showPasswordToggle && onTogglePassword && (
            <button
              onClick={onTogglePassword}
              className="p-1.5 hover:bg-muted rounded-md transition-colors"
              data-testid="button-toggle-password"
            >
              {isPasswordVisible ? (
                <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
              ) : (
                <Eye className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </button>
          )}
          <button
            onClick={onCopy}
            className="p-1.5 hover:bg-muted rounded-md transition-colors"
            data-testid={testIdCopy}
          >
            {isCopied ? (
              <Check className="w-3.5 h-3.5 text-success" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
