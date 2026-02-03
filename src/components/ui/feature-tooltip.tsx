"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface FeatureTooltipProps {
  children: React.ReactNode;
  title: string;
  description: string;
  steps?: string[];
  className?: string;
  tooltipClassName?: string;
  position?: "top" | "bottom";
}

/**
 * FeatureTooltip - A hover tooltip for feature buttons
 *
 * Displays helpful instructions on hover with:
 * - Clean Apple-style design
 * - Title, description, and optional steps
 * - Smooth animations
 * - Automatic positioning
 */
export function FeatureTooltip({
  children,
  title,
  description,
  steps,
  className,
  tooltipClassName,
  position = "top",
}: FeatureTooltipProps) {
  const [isVisible, setIsVisible] = React.useState(false);
  const [actualPosition, setActualPosition] = React.useState(position);
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Calculate optimal position based on available space
  React.useEffect(() => {
    if (isVisible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      const tooltipHeight = 150; // Estimated height

      if (position === "top" && spaceAbove < tooltipHeight && spaceBelow > spaceAbove) {
        setActualPosition("bottom");
      } else if (position === "bottom" && spaceBelow < tooltipHeight && spaceAbove > spaceBelow) {
        setActualPosition("top");
      } else {
        setActualPosition(position);
      }
    }
  }, [isVisible, position]);

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    // Small delay to prevent accidental triggers
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, 200);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={triggerRef}
      className={cn("relative inline-flex", className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        role="tooltip"
        className={cn(
          "absolute z-50 w-72 sm:w-80",
          // Positioning
          actualPosition === "top" ? "bottom-full mb-3" : "top-full mt-3",
          "left-1/2 -translate-x-1/2",
          // Apple-style appearance
          "p-4",
          "bg-popover/98 backdrop-blur-xl",
          "border border-border/60",
          "rounded-2xl",
          "shadow-xl shadow-black/15",
          // Animation
          "transition-all duration-250 ease-out",
          isVisible
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-95 pointer-events-none",
          actualPosition === "top"
            ? isVisible ? "translate-y-0" : "translate-y-2"
            : isVisible ? "translate-y-0" : "-translate-y-2",
          tooltipClassName
        )}
      >
        {/* Arrow */}
        <div
          className={cn(
            "absolute left-1/2 -translate-x-1/2",
            "w-3 h-3",
            "bg-popover/98 border-border/60",
            "rotate-45",
            actualPosition === "top"
              ? "bottom-[-6px] border-r border-b"
              : "top-[-6px] border-l border-t"
          )}
        />

        {/* Content */}
        <div className="relative space-y-2">
          <h4 className="font-semibold text-foreground text-sm">
            {title}
          </h4>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {description}
          </p>

          {/* Steps */}
          {steps && steps.length > 0 && (
            <div className="pt-2 mt-2 border-t border-border/40">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                How to use
              </p>
              <ol className="space-y-1.5">
                {steps.map((step, index) => (
                  <li key={index} className="flex items-start gap-2 text-xs text-foreground/90">
                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-primary/10 text-primary text-[10px] font-medium flex items-center justify-center">
                      {index + 1}
                    </span>
                    <span className="leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
