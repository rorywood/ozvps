import type { ReactNode } from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[hsl(210_100%_65%)]">
          Admin Workspace
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function AdminPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.96)_0%,rgba(9,14,24,0.98)_100%)] shadow-[0_18px_48px_rgba(0,0,0,0.24)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AdminPanelHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-white/8 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {description ? <p className="mt-1 text-sm text-white/40">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function AdminStatGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("grid gap-4 md:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>;
}

export function AdminStatCard({
  label,
  value,
  icon,
  tone = "default",
  detail,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "primary" | "success" | "warning" | "danger";
  detail?: ReactNode;
}) {
  const toneClasses = {
    default: "border-white/8 bg-white/[0.03] text-white",
    primary: "border-[hsl(210_100%_50%)/18] bg-[hsl(210_100%_50%)/10] text-[hsl(210_100%_75%)]",
    success: "border-[hsl(160_84%_39%)/18] bg-[hsl(160_84%_39%)/10] text-[hsl(160_84%_60%)]",
    warning: "border-[hsl(45_100%_51%)/18] bg-[hsl(45_100%_51%)/10] text-[hsl(45_100%_60%)]",
    danger: "border-[hsl(0_84%_60%)/18] bg-[hsl(0_84%_60%)/10] text-[hsl(0_84%_70%)]",
  }[tone];

  return (
    <div className={cx("rounded-2xl border p-4", toneClasses)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/40">{label}</p>
          <div className="mt-2 text-2xl font-semibold leading-none">{value}</div>
          {detail ? <div className="mt-2 text-xs text-white/45">{detail}</div> : null}
        </div>
        {icon ? <div className="rounded-xl border border-white/10 bg-black/10 p-2.5">{icon}</div> : null}
      </div>
    </div>
  );
}

export function AdminEmptyState({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon ? <div className="mb-4 rounded-full border border-white/8 bg-white/[0.03] p-4 text-white/30">{icon}</div> : null}
      <h3 className="text-base font-medium text-white/75">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-sm text-white/35">{description}</p> : null}
    </div>
  );
}
