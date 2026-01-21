import { StatusBadge, type StatusType } from "./status-badge";
import { Button } from "./button";
import { Progress } from "./progress";
import { ChevronRight, Ban, AlertTriangle, Gift, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Server } from "@/lib/types";
import { usePowerActions } from "@/hooks/use-power-actions";
import { Badge } from "./badge";

// Helper to check if billing is due today, tomorrow, or overdue (uses UTC to avoid timezone/DST issues)
function getBillingDueStatus(nextBillAt?: string): 'overdue' | 'today' | 'tomorrow' | null {
  if (!nextBillAt) return null;
  const billDate = new Date(nextBillAt);
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const billDateUTC = Date.UTC(billDate.getFullYear(), billDate.getMonth(), billDate.getDate());
  const daysUntil = Math.round((billDateUTC - todayUTC) / (1000 * 60 * 60 * 24));
  if (daysUntil < 0) return 'overdue';
  if (daysUntil === 0) return 'today';
  if (daysUntil === 1) return 'tomorrow';
  return null;
}

interface BillingStatus {
  status: string;
  nextBillAt?: string;
  suspendAt?: string | null;
  monthlyPriceCents?: number;
  freeServer?: boolean;
  adminSuspended?: boolean;
  adminSuspendedReason?: string | null;
  planId?: number;
  planName?: string | null;
}

interface ServerCardProps {
  server: Server;
  cancellation?: { scheduledDeletionAt: string; reason: string | null; mode: string; status: string };
  billingStatus?: BillingStatus;
  onClick: () => void;
}

export function ServerCard({ server, cancellation, billingStatus, onClick }: ServerCardProps) {
  const { getDisplayStatus } = usePowerActions();
  const billingDue = billingStatus?.freeServer ? null : getBillingDueStatus(billingStatus?.nextBillAt);

  // Get the display status (with deletion/power action states)
  const displayStatus = getDisplayStatus(
    server.id,
    server.status,
    cancellation,
    server.needsSetup
  );

  // Map display status to StatusBadge status type
  const getStatusBadgeStatus = (): StatusType => {
    // Check deletion states first
    if (displayStatus === 'destroying' || displayStatus === 'queued_deletion') return "removing";
    if (displayStatus === 'scheduled_deletion') return "scheduled";

    // Check provisioning states
    if (displayStatus === 'setting up') return "setting up";

    if (server.suspended) return "suspended";
    if (displayStatus === "provisioning") return "pending";
    if (displayStatus === "error") return "stopped";
    return displayStatus as StatusType;
  };

  // Get status bar color
  const getStatusBarColor = () => {
    if (displayStatus === 'destroying' || displayStatus === 'queued_deletion') return "bg-red-500";
    if (displayStatus === 'scheduled_deletion') return "bg-orange-500";
    if (displayStatus === 'setting up') return "bg-blue-500";
    if (displayStatus === "running" && !server.suspended) return "bg-success";
    if (displayStatus === "stopped") return "bg-destructive";
    if (server.suspended) return "bg-warning";
    if (displayStatus === "provisioning") return "bg-info";
    return "bg-muted-foreground";
  };

  // Calculate percentages for resource usage
  const cpuPercentage = server.stats.cpu_usage || 0;
  const ramPercentage = server.plan.specs.ram
    ? (server.stats.ram_usage / server.plan.specs.ram) * 100
    : 0;
  const diskPercentage = server.plan.specs.disk
    ? (server.stats.disk_usage / server.plan.specs.disk) * 100
    : 0;

  return (
    <div
      onClick={onClick}
      className="group relative rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/50 hover:shadow-lg cursor-pointer"
    >
      {/* Status indicator - left edge */}
      <div
        className={cn(
          "absolute left-0 top-6 bottom-6 w-1 rounded-r-full",
          getStatusBarColor()
        )}
      />

      {/* Header */}
      <div className="flex items-start justify-between mb-4 pl-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors truncate">
              {server.name}
            </h3>
            {billingStatus?.freeServer && (
              <Badge variant="info" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                <Gift className="h-2.5 w-2.5 mr-0.5" />
                FREE
              </Badge>
            )}
            {billingStatus?.adminSuspended && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                <Ban className="h-2.5 w-2.5 mr-0.5" />
                SUSPENDED
              </Badge>
            )}
            {billingStatus?.status === 'suspended' && !billingStatus?.adminSuspended && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                PAYMENT DUE
              </Badge>
            )}
            {billingStatus?.status === 'unpaid' && !billingStatus?.freeServer && (
              <Badge variant="warning" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                UNPAID
              </Badge>
            )}
            {billingDue === 'overdue' && billingStatus?.status !== 'unpaid' && billingStatus?.status !== 'suspended' && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                OVERDUE
              </Badge>
            )}
            {billingDue === 'today' && billingStatus?.status !== 'unpaid' && billingStatus?.status !== 'suspended' && (
              <Badge variant="warning" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                <Clock className="h-2.5 w-2.5 mr-0.5" />
                DUE TODAY
              </Badge>
            )}
            {billingDue === 'tomorrow' && billingStatus?.status !== 'unpaid' && billingStatus?.status !== 'suspended' && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0 border-amber-500/50 text-amber-500">
                <Clock className="h-2.5 w-2.5 mr-0.5" />
                DUE TOMORROW
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5 truncate">
            {billingStatus?.planName || server.plan?.name || "Unknown Plan"}
          </p>
        </div>
        <StatusBadge status={getStatusBadgeStatus()} />
      </div>

      {/* Resource usage */}
      <div className="space-y-3 pl-3">
        <ResourceBar
          label="CPU"
          value={cpuPercentage}
          max={100}
          unit="%"
        />
        <ResourceBar
          label="RAM"
          value={server.stats.ram_usage}
          max={server.plan.specs.ram}
          unit="MB"
        />
        <ResourceBar
          label="Storage"
          value={server.stats.disk_usage}
          max={server.plan.specs.disk}
          unit="GB"
        />
      </div>

      {/* Action */}
      <div className="mt-4 flex items-center justify-end pl-3">
        <Button
          variant="ghost"
          size="sm"
          className="group-hover:text-primary"
        >
          Manage
          <ChevronRight className="h-4 w-4 ml-1 transition-transform group-hover:translate-x-1" />
        </Button>
      </div>
    </div>
  );
}

interface ResourceBarProps {
  label: string;
  value: number;
  max: number;
  unit: string;
}

function ResourceBar({ label, value, max, unit }: ResourceBarProps) {
  const percentage = max > 0 ? (value / max) * 100 : 0;
  const displayPercentage = Math.min(Math.max(percentage, 0), 100);

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {displayPercentage.toFixed(0)}%
          <span className="text-muted-foreground ml-1">
            ({value.toFixed(unit === "MB" ? 0 : 1)} / {max.toFixed(unit === "GB" ? 0 : 0)} {unit})
          </span>
        </span>
      </div>
      <Progress value={displayPercentage} className="h-1.5" />
    </div>
  );
}
