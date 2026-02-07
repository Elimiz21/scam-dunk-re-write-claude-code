"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-bold font-mono transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 uppercase tracking-wider",
  {
    variants: {
      variant: {
        default:
          "border-primary/30 bg-primary/10 text-primary shadow-sm",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-destructive/30 bg-destructive/10 text-destructive shadow-sm",
        outline: "text-foreground border-border",
        low: "border-emerald-400/30 bg-emerald-400/10 text-emerald-500 dark:border-emerald-400/20 dark:bg-emerald-400/8 dark:text-emerald-400",
        medium: "border-amber-400/30 bg-amber-400/10 text-amber-600 dark:border-amber-400/20 dark:bg-amber-400/8 dark:text-amber-400",
        high: "border-red-400/30 bg-red-400/10 text-red-600 dark:border-red-400/20 dark:bg-red-400/8 dark:text-red-400",
        insufficient: "border-gray-400/30 bg-gray-400/10 text-gray-500 dark:border-gray-500/20 dark:bg-gray-500/8 dark:text-gray-400",
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
