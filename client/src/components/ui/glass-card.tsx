import { Card, type CardProps } from "./card";
import { forwardRef } from "react";

interface GlassCardProps extends CardProps {
  variant?: "default" | "panel" | "interactive";
}

/**
 * @deprecated Use Card component directly with appropriate variants instead.
 * This component exists for backwards compatibility only.
 */
const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ variant = "default", ...props }, ref) => {
    // Map old glass-card variants to new Card variants
    const cardVariant =
      variant === "panel" ? "elevated" :
      variant === "interactive" ? "default" :
      "default";

    const interactive = variant === "interactive";

    return (
      <Card
        ref={ref}
        variant={cardVariant}
        interactive={interactive}
        {...props}
      />
    );
  }
);
GlassCard.displayName = "GlassCard";

export { GlassCard };
