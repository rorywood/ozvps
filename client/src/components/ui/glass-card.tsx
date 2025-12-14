import { cn } from "@/lib/utils";
import { HTMLAttributes, forwardRef } from "react";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "panel" | "interactive";
}

const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl border shadow-sm transition-all duration-200",
          variant === "default" && "bg-card/40 backdrop-blur-xl border-white/5",
          variant === "panel" && "bg-black/40 backdrop-blur-2xl border-white/5",
          variant === "interactive" && "bg-card/40 backdrop-blur-xl border-white/5 hover:bg-card/50 hover:border-white/10 cursor-pointer hover:shadow-lg hover:-translate-y-0.5",
          className
        )}
        {...props}
      />
    );
  }
);
GlassCard.displayName = "GlassCard";

export { GlassCard };
