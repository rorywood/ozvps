import { cn } from "@/lib/utils";

interface PageSectionProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
}

export function PageSection({
  title,
  description,
  children,
  className,
  headerClassName,
  contentClassName,
}: PageSectionProps) {
  return (
    <section className={cn("space-y-6", className)}>
      {(title || description) && (
        <div className={cn("space-y-1", headerClassName)}>
          {title && (
            <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          )}
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      <div className={contentClassName}>{children}</div>
    </section>
  );
}
