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
  LifeBuoy,
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
    emphasisClassName: string;
  }
> = {
  new: {
    label: "New",
    icon: CircleDot,
    badgeClassName: "border-blue-500/20 bg-blue-500/10 text-blue-300",
    emphasisClassName: "text-blue-300",
  },
  open: {
    label: "Open",
    icon: CircleDot,
    badgeClassName: "border-cyan-500/20 bg-cyan-500/10 text-cyan-300",
    emphasisClassName: "text-cyan-300",
  },
  waiting_user: {
    label: "Action Needed",
    icon: Timer,
    badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    emphasisClassName: "text-amber-300",
  },
  waiting_admin: {
    label: "With Support",
    icon: Clock3,
    badgeClassName: "border-violet-500/20 bg-violet-500/10 text-violet-300",
    emphasisClassName: "text-violet-300",
  },
  resolved: {
    label: "Resolved",
    icon: CheckCircle2,
    badgeClassName: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    emphasisClassName: "text-emerald-300",
  },
  closed: {
    label: "Closed",
    icon: CheckCircle2,
    badgeClassName: "border-white/10 bg-white/5 text-muted-foreground",
    emphasisClassName: "text-muted-foreground",
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
        "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] shadow-[0_20px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl",
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
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
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
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", tone)}>
      <AlertTriangle className="h-3.5 w-3.5" />
      {SUPPORT_PRIORITY_LABELS[priority]}
    </span>
  );
}

export function SupportCategoryBadge({ category }: { category: TicketCategory }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-muted-foreground">
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
  const displayName = isSupport
    ? supportLabel
    : message.authorName || message.authorEmail.split("@")[0];

  return (
    <div className={cn("flex gap-3 sm:gap-4", isSupport ? "justify-start" : "justify-end")}>
      {isSupport && (
        <div className="mt-1 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          <ShieldCheck className="h-4.5 w-4.5" />
        </div>
      )}

      <div className={cn("max-w-[92%] sm:max-w-[78%]", !isSupport && "order-first")}>
        <div className={cn("mb-2 flex items-center gap-2 text-xs", isSupport ? "justify-start" : "justify-end")}>
          <span className="font-semibold text-foreground">{displayName}</span>
          {isSupport && (
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
              Team
            </span>
          )}
          <span className="text-muted-foreground">{formatSupportRelativeTime(message.createdAt)}</span>
        </div>

        <div
          className={cn(
            "rounded-[22px] border px-4 py-3.5 text-sm leading-relaxed shadow-[0_10px_30px_rgba(0,0,0,0.14)]",
            isSupport
              ? "rounded-tl-md border-primary/15 bg-primary/10 text-foreground"
              : "rounded-tr-md border-white/10 bg-[rgba(255,255,255,0.04)] text-foreground",
          )}
        >
          <p className="whitespace-pre-wrap break-words">{message.message}</p>
        </div>

        <p className={cn("mt-2 text-[11px] text-muted-foreground", isSupport ? "text-left" : "text-right")}>
          {formatSupportDateTime(message.createdAt)}
        </p>
      </div>

      {!isSupport && (
        <div className="mt-1 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-muted-foreground">
          <UserRound className="h-4.5 w-4.5" />
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(0,133,255,0.18),transparent_36%),radial-gradient(circle_at_18%_20%,rgba(34,211,238,0.1),transparent_24%),linear-gradient(180deg,hsl(222_50%_4%)_0%,hsl(222_44%_6%)_100%)] text-foreground">
      <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:26px_26px] opacity-30 pointer-events-none" />

      <header className="sticky top-0 z-40 border-b border-white/10 bg-[rgba(6,10,18,0.78)] backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 lg:px-8">
          <a href="https://ozvps.com.au" className="flex items-center gap-3">
            <img src={logo} alt="OzVPS" className="h-9 w-auto brightness-0 invert" />
            <span className="hidden text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground sm:inline">
              Support Desk
            </span>
          </a>

          <div className="flex items-center gap-3">
            <a
              href="/login"
              className="inline-flex items-center justify-center rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary/40 hover:bg-primary/10"
            >
              Sign In
            </a>
            <a
              href="/register"
              className="hidden items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(0,133,255,0.35)] transition hover:bg-primary/90 sm:inline-flex"
            >
              Create Account
            </a>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-6 py-10 lg:px-8 lg:py-14">
        <SupportPanel className="overflow-hidden border-primary/15 bg-[linear-gradient(140deg,rgba(0,133,255,0.18),rgba(255,255,255,0.04)_45%,rgba(255,255,255,0.03))]">
          <div className="grid gap-8 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:px-8 lg:py-10">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                <LifeBuoy className="h-3.5 w-3.5" />
                {eyebrow}
              </div>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                {title}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
                {description}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {meta?.map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.05)] px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">{item.label}</p>
                  <p className="mt-2 text-lg font-semibold text-white">{item.value}</p>
                </div>
              ))}
              {!meta?.length && (
                <div className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.05)] px-4 py-4 text-sm leading-6 text-white/70">
                  Replies arrive by email and on your secure ticket page.
                </div>
              )}
            </div>
          </div>
        </SupportPanel>

        <div className="mt-8">{children}</div>
      </main>

      <footer className="border-t border-white/10 bg-[rgba(6,10,18,0.55)]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-white/55 sm:flex-row lg:px-8">
          <p>© {new Date().getFullYear()} OzVPS Pty Ltd</p>
          <div className="flex items-center gap-4">
            <a href="https://ozvps.com.au" className="transition hover:text-white">
              ozvps.com.au
            </a>
            <a href="/contact" className="inline-flex items-center gap-1 transition hover:text-white">
              Open another enquiry
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
