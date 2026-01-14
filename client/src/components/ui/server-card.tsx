import { StatusBadge, type StatusType } from "./status-badge";
import { Button } from "./button";
import { Progress } from "./progress";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Server } from "@/lib/types";

interface ServerCardProps {
  server: Server;
  onClick: () => void;
}

export function ServerCard({ server, onClick }: ServerCardProps) {
  // Map server status to StatusBadge status type
  const getStatusBadgeStatus = (): StatusType => {
    if (server.suspended) return "suspended";
    if (server.status === "provisioning") return "pending";
    if (server.status === "error") return "stopped";
    return server.status as StatusType;
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
          server.status === "running" && !server.suspended && "bg-success",
          server.status === "stopped" && "bg-destructive",
          server.suspended && "bg-warning",
          server.status === "provisioning" && "bg-info"
        )}
      />

      {/* Header */}
      <div className="flex items-start justify-between mb-4 pl-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors truncate">
            {server.name}
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5 truncate">
            {server.plan?.name || "Unknown Plan"}
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
