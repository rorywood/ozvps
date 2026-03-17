import type { ReactNode } from "react";
import logo from "@/assets/logo.png";
import { TicketCategory, TicketPriority, TicketStatus, TicketMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleDot,
  Clock3,
  Timer,
  UserRound,
  ShieldCheck,
} from "lucide-react";

export const SUPPORT_CATEGORY_LABELS: Record<TicketCategory, string> = {
  sales: "Sales",
  accounts: "Accounts",
  support: "Support",
  abuse: "Abuse",
};

export const SUPPORT_PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const SUPPORT_STATUS_META: Record<
  TicketStatus,
  {
    label: string;
    icon: typeof CircleDot;
    badgeClassName: string;
  }
> = {
  new: {
    label: "New",
    icon: CircleDot,
    badgeClassName: "border-blue-500/20 bg-blue-500/10 text-blue-300",
  },
  open: {
    label: "Open",
    icon: CircleDot,
    badgeClassName: "border-cyan-500/20 bg-cyan-500/10 text-cyan-300",
  },
  waiting_user: {
    label: "Action Needed",
    icon: Timer,
    badgeClassName: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  },
  waiting_admin: {
    label: "With Support",
    icon: Clock3,
    badgeClassName: "border-violet-500/20 bg-violet-500/10 text-violet-300",
  },
  resolved: {
    label: "Resolved",
    icon: CheckCircle2,
    badgeClassName: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  },
  closed: {
    label: "Closed",
    icon: CheckCircle2,
    badgeClassName: "border-white/10 bg-white/5 text-muted-foreground",
  },
};

export function formatSupportRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    timeZone: "Australia/Brisbane",
  });
}

export function formatSupportDateTime(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Australia/Brisbane",
  });
}

export function SupportPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.03)] shadow-[0_10px_30px_rgba(0,0,0,0.18)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SupportStatusBadge({ status }: { status: TicketStatus }) {
  const meta = SUPPORT_STATUS_META[status];
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        meta.badgeClassName,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

export function SupportPriorityBadge({ priority }: { priority: TicketPriority }) {
  const tone = {
    low: "border-white/10 bg-white/5 text-muted-foreground",
    normal: "border-white/10 bg-white/5 text-foreground",
    high: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    urgent: "border-red-500/20 bg-red-500/10 text-red-300",
  }[priority];

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium", tone)}>
      <AlertTriangle className="h-3.5 w-3.5" />
      {SUPPORT_PRIORITY_LABELS[priority]}
    </span>
  );
}

export function SupportCategoryBadge({ category }: { category: TicketCategory }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
      {SUPPORT_CATEGORY_LABELS[category]}
    </span>
  );
}

export function SupportThreadMessage({
  message,
  supportLabel = "OzVPS Support",
}: {
  message: {
    authorType: TicketMessage["authorType"] | string;
    authorEmail: string;
    authorName: string | null;
    message: string;
    createdAt: string;
  };
  supportLabel?: string;
}) {
  const isSupport = message.authorType === "admin";
  const displayName = isSupport ? supportLabel : message.authorName || message.authorEmail.split("@")[0];

  return (
    <div className={cn("flex gap-3", isSupport ? "justify-start" : "justify-end")}>
      {isSupport && (
        <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
          <ShieldCheck className="h-4 w-4" />
        </div>
      )}

      <div className={cn("max-w-[92%] sm:max-w-[78%]", !isSupport && "order-first")}>
        <div className={cn("mb-1.5 flex items-center gap-2 text-xs", isSupport ? "justify-start" : "justify-end")}>
          <span className="font-medium text-foreground">{displayName}</span>
          <span className="text-muted-foreground">{formatSupportRelativeTime(message.createdAt)}</span>
        </div>

        <div
          className={cn(
            "rounded-2xl border px-4 py-3 text-sm leading-6",
            isSupport
              ? "rounded-tl-md border-primary/15 bg-primary/10 text-foreground"
              : "rounded-tr-md border-white/10 bg-white/[0.04] text-foreground",
          )}
        >
          <p className="whitespace-pre-wrap break-words">{message.message}</p>
        </div>
      </div>

      {!isSupport && (
        <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-muted-foreground">
          <UserRound className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

export function SupportPublicShell({
  eyebrow,
  title,
  description,
  meta,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  meta?: Array<{ label: string; value: string }>;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(0,133,255,0.12),transparent_30%),linear-gradient(180deg,hsl(222_50%_4%)_0%,hsl(222_44%_6%)_100%)] text-foreground">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[rgba(6,10,18,0.84)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <a href="https://ozvps.com.au" className="flex items-center gap-3">
            <img src={logo} alt="OzVPS" className="h-8 w-auto brightness-0 invert" />
            <span className="hidden text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground sm:inline">
              Support
            </span>
          </a>

          <div className="flex items-center gap-3">
            <a
              href="/login"
              className="inline-flex items-center justify-center rounded-full border border-white/10 px-3.5 py-1.5 text-sm font-medium text-foreground transition hover:border-primary/40 hover:bg-primary/10"
            >
              Sign In
            </a>
            <a
              href="/register"
              className="hidden items-center justify-center rounded-full bg-primary px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-primary/90 sm:inline-flex"
            >
              Create Account
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-10">
        <div className="mb-6">
          <div className="mb-3 inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
            {eyebrow}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70 sm:text-base">{description}</p>

          {meta?.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {meta.map((item) => (
                <div key={item.label} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-white/80">
                  <span className="text-white/45">{item.label}:</span> {item.value}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {children}
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-5 py-6 text-sm text-white/55 sm:flex-row lg:px-8">
          <p>© {new Date().getFullYear()} OzVPS Pty Ltd</p>
          <div className="flex items-center gap-4">
            <a href="https://ozvps.com.au" className="transition hover:text-white">
              ozvps.com.au
            </a>
            <a href="/contact" className="inline-flex items-center gap-1 transition hover:text-white">
              Contact
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
