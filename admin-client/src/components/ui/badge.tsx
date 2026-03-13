import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-[hsl(210_100%_50%)/30] bg-[hsl(210_100%_50%)/20] text-[hsl(210_100%_70%)]",
        secondary:
          "border-white/10 bg-white/10 text-white/70",
        destructive:
          "border-[hsl(0_84%_60%)/30] bg-[hsl(0_84%_60%)/20] text-[hsl(0_84%_70%)]",
        success:
          "border-[hsl(160_84%_39%)/30] bg-[hsl(160_84%_39%)/20] text-[hsl(160_84%_60%)]",
        warning:
          "border-[hsl(14_100%_60%)/30] bg-[hsl(14_100%_60%)/20] text-[hsl(14_100%_70%)]",
        outline:
          "border-white/20 text-white/70",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
