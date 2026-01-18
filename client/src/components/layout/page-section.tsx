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
    <section className={className}>
      {(title || description) && (
        <div className={cn("mb-6", headerClassName)}>
          {title && (
            <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          )}
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      )}
      <div className={contentClassName}>{children}</div>
    </section>
  );
}
