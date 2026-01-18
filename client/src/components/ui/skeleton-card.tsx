import { Skeleton } from "./skeleton";
import { cn } from "@/lib/utils";

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-6 space-y-4", className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-2 w-3/4" />
      </div>
    </div>
  );
}

export function SkeletonServerCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-6 space-y-4", className)}>
      {/* Status indicator */}
      <div className="absolute left-0 top-6 bottom-6 w-1 rounded-r-full bg-muted" />

      {/* Header */}
      <div className="flex items-start justify-between pl-3">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>

      {/* Resource bars */}
      <div className="space-y-3 pl-3">
        <div className="space-y-1">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
        <div className="space-y-1">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
        <div className="space-y-1">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
      </div>

      {/* Action button */}
      <div className="flex justify-end pl-3">
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonServerGrid({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonServerCard key={i} className="relative" />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}
