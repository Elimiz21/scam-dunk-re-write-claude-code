"use client";

import { cn } from "@/lib/utils";
import { Check, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

export interface Step {
  label: string;
  status: "pending" | "loading" | "complete";
  detail?: string;
  subSteps?: {
    label: string;
    status: "pending" | "loading" | "complete";
  }[];
}

interface LoadingStepperProps {
  steps: Step[];
  currentTip?: string;
}

export function LoadingStepper({ steps, currentTip }: LoadingStepperProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const toggleStep = (index: number) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedSteps(newExpanded);
  };

  const hasSubSteps = (step: Step) => step.subSteps && step.subSteps.length > 0;
  const completedCount = steps.filter(s => s.status === "complete").length;
  const progressPercent = (completedCount / steps.length) * 100;

  const getStepClass = (status: string) => {
    switch (status) {
      case "complete":
        return "scan-step-complete";
      case "loading":
        return "scan-step-active";
      default:
        return "scan-step-fuzzy";
    }
  };

  return (
    <div className="space-y-6">
      {/* Overall progress bar */}
      <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full rounded-full gradient-brand transition-all duration-700 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Steps - all visible from start */}
      <div className="space-y-2">
        {steps.map((step, index) => (
          <div key={index} className="space-y-1">
            <div
              className={cn(
                "flex items-center gap-3 p-2.5 rounded-xl transition-all duration-500",
                getStepClass(step.status),
                step.status === "loading" && "bg-primary/5",
                hasSubSteps(step) && step.status !== "pending" && "cursor-pointer hover:bg-secondary/80"
              )}
              onClick={() => hasSubSteps(step) && step.status !== "pending" && toggleStep(index)}
            >
              {/* Step indicator */}
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-500",
                  step.status === "complete" && "bg-emerald-500 shadow-sm shadow-emerald-500/25",
                  step.status === "loading" && "gradient-brand shadow-sm shadow-primary/25",
                  step.status === "pending" && "bg-secondary/60 border border-border/30"
                )}
              >
                {step.status === "complete" ? (
                  <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                ) : step.status === "loading" ? (
                  <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
                ) : (
                  <span className="text-xs font-medium text-muted-foreground/40">{index + 1}</span>
                )}
              </div>

              {/* Label */}
              <div className="flex-1 flex items-center gap-2">
                <span
                  className={cn(
                    "text-sm transition-all duration-500",
                    step.status === "complete" && "text-emerald-600 dark:text-emerald-400 font-medium",
                    step.status === "loading" && "text-foreground font-semibold",
                    step.status === "pending" && "text-muted-foreground/30"
                  )}
                >
                  {step.label}
                </span>
                {hasSubSteps(step) && step.status !== "pending" && (
                  <span className="text-muted-foreground/40">
                    {expandedSteps.has(index) ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </span>
                )}
              </div>
            </div>

            {/* Step detail */}
            {step.detail && step.status === "complete" && (
              <div className="ml-12 text-xs text-emerald-600 dark:text-emerald-400 animate-fade-in">
                {step.detail}
              </div>
            )}

            {/* Sub-steps - always visible when parent is not pending */}
            {hasSubSteps(step) && (
              <div
                className={cn(
                  "ml-12 mt-1 space-y-1 transition-all duration-500",
                  step.status === "pending" ? "scan-step-fuzzy" : "animate-fade-in"
                )}
              >
                {step.subSteps!.map((subStep, subIndex) => (
                  <div
                    key={subIndex}
                    className={cn(
                      "flex items-center gap-2.5 py-1 transition-all duration-500",
                      subStep.status === "pending" && step.status !== "pending" ? "scan-step-fuzzy" : "",
                      subStep.status === "complete" ? "scan-step-complete" : "",
                      subStep.status === "loading" ? "scan-step-active" : ""
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-md transition-all duration-500",
                        subStep.status === "complete" && "bg-emerald-500",
                        subStep.status === "loading" && "gradient-brand",
                        subStep.status === "pending" && "bg-secondary/40 border border-border/30"
                      )}
                    >
                      {subStep.status === "complete" ? (
                        <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                      ) : subStep.status === "loading" ? (
                        <Loader2 className="h-2.5 w-2.5 text-white animate-spin" />
                      ) : null}
                    </div>
                    <span
                      className={cn(
                        "text-xs transition-all duration-500",
                        subStep.status === "complete" && "text-emerald-600 dark:text-emerald-400",
                        subStep.status === "loading" && "text-foreground font-medium",
                        subStep.status === "pending" && "text-muted-foreground/25"
                      )}
                    >
                      {subStep.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Rotating tip */}
      {currentTip && (
        <div className="p-4 rounded-xl gradient-brand-subtle border border-primary/10 animate-fade-in">
          <p className="text-sm text-muted-foreground text-center leading-relaxed">
            {currentTip}
          </p>
        </div>
      )}
    </div>
  );
}
