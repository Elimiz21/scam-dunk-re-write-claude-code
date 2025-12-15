"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface InfoTooltipProps {
  term: string;
  definition: string;
  className?: string;
}

/**
 * InfoTooltip - An Apple-style tooltip component for explaining technical terms
 *
 * Displays an info icon that reveals a definition on hover.
 * Follows Apple Human Interface Guidelines with:
 * - Clean, minimal design
 * - Smooth animations
 * - Subtle shadows and vibrancy effects
 * - Responsive positioning
 */
export function InfoTooltip({ term, definition, className }: InfoTooltipProps) {
  const [isVisible, setIsVisible] = React.useState(false);
  const [position, setPosition] = React.useState<"top" | "bottom">("top");
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);

  // Calculate optimal position based on available space
  React.useEffect(() => {
    if (isVisible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;

      // Prefer top, but use bottom if not enough space
      setPosition(spaceAbove < 120 && spaceBelow > spaceAbove ? "bottom" : "top");
    }
  }, [isVisible]);

  // Handle click outside to close on mobile
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (
        tooltipRef.current &&
        triggerRef.current &&
        !tooltipRef.current.contains(event.target as Node) &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsVisible(false);
      }
    }

    if (isVisible) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isVisible]);

  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "inline-flex items-center justify-center",
          "ml-1 p-0.5 rounded-full",
          "text-muted-foreground/60 hover:text-muted-foreground",
          "hover:bg-secondary/80",
          "transition-all duration-200 ease-out",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          "cursor-help"
        )}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsVisible(!isVisible);
        }}
        aria-label={`Learn more about ${term}`}
        aria-describedby={isVisible ? `tooltip-${term.replace(/\s+/g, "-")}` : undefined}
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        id={`tooltip-${term.replace(/\s+/g, "-")}`}
        role="tooltip"
        className={cn(
          "absolute z-50 w-64 sm:w-72",
          // Positioning
          position === "top" ? "bottom-full mb-2" : "top-full mt-2",
          "left-1/2 -translate-x-1/2",
          // Apple-style appearance
          "px-3 py-2.5",
          "bg-popover/95 backdrop-blur-xl",
          "border border-border/50",
          "rounded-xl",
          "shadow-lg shadow-black/10",
          // Typography
          "text-sm text-popover-foreground",
          // Animation
          "transition-all duration-200 ease-out",
          "origin-bottom",
          isVisible
            ? "opacity-100 scale-100 translate-y-0"
            : "opacity-0 scale-95 pointer-events-none",
          position === "top"
            ? isVisible ? "translate-y-0" : "translate-y-1"
            : isVisible ? "translate-y-0" : "-translate-y-1"
        )}
      >
        {/* Arrow */}
        <div
          className={cn(
            "absolute left-1/2 -translate-x-1/2",
            "w-2.5 h-2.5",
            "bg-popover/95 border-border/50",
            "rotate-45",
            position === "top"
              ? "bottom-[-5px] border-r border-b"
              : "top-[-5px] border-l border-t"
          )}
        />

        {/* Content */}
        <div className="relative">
          <p className="font-medium text-foreground mb-1">{term}</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {definition}
          </p>
        </div>
      </div>
    </span>
  );
}

/**
 * TermWithTooltip - Inline wrapper that displays a term with an info tooltip
 */
interface TermWithTooltipProps {
  children: React.ReactNode;
  term: string;
  definition: string;
  className?: string;
}

export function TermWithTooltip({ children, term, definition, className }: TermWithTooltipProps) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <span>{children}</span>
      <InfoTooltip term={term} definition={definition} />
    </span>
  );
}
