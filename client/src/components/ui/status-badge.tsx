import { Badge } from "./badge";
import { Circle } from "lucide-react";

const statusConfig = {
  // Server statuses
  running: { label: "Running", variant: "default" as const, icon: true, pulse: true },
  stopped: { label: "Stopped", variant: "destructive" as const, icon: false, pulse: false },
  suspended: { label: "Suspended", variant: "secondary" as const, icon: false, pulse: false },
  pending: { label: "Pending", variant: "secondary" as const, icon: true, pulse: true },
  deleting: { label: "Deleting", variant: "destructive" as const, icon: true, pulse: true },
  removing: { label: "Removing", variant: "destructive" as const, icon: true, pulse: true },
  scheduled: { label: "Scheduled", variant: "warning" as const, icon: true, pulse: false },

  // Billing statuses
  paid: { label: "Paid", variant: "default" as const, icon: false, pulse: false },
  unpaid: { label: "Unpaid", variant: "destructive" as const, icon: false, pulse: false },
  "pending-payment": { label: "Pending", variant: "secondary" as const, icon: false, pulse: false },

  // Support ticket statuses
  open: { label: "Open", variant: "default" as const, icon: true, pulse: true },
  closed: { label: "Closed", variant: "secondary" as const, icon: false, pulse: false },
  waiting: { label: "Waiting", variant: "secondary" as const, icon: true, pulse: true },
} as const;

export type StatusType = keyof typeof statusConfig;

interface StatusBadgeProps {
  status: StatusType;
  showIcon?: boolean;
  className?: string;
}

export function StatusBadge({
  status,
  showIcon = true,
  className,
}: StatusBadgeProps) {
  const config = statusConfig[status];
  if (!config) {
    console.warn(`Unknown status: ${status}`);
    return null;
  }

  return (
    <Badge variant={config.variant} className={className}>
      {showIcon && config.icon && (
        <Circle
          className={`h-2 w-2 fill-current ${config.pulse ? "animate-pulse" : ""}`}
        />
      )}
      {config.label}
    </Badge>
  );
}
