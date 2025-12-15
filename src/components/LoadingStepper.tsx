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

  return (
    <div className="space-y-4">
      {/* Progress steps */}
      <div className="space-y-3">
        {steps.map((step, index) => (
          <div key={index} className="space-y-1">
            <div
              className={cn(
                "flex items-center gap-3",
                hasSubSteps(step) && "cursor-pointer"
              )}
              onClick={() => hasSubSteps(step) && toggleStep(index)}
            >
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors",
                  step.status === "complete" && "bg-green-500 border-green-500",
                  step.status === "loading" && "border-primary bg-primary/10",
                  step.status === "pending" && "border-muted-foreground/30"
                )}
              >
                {step.status === "complete" ? (
                  <Check className="h-4 w-4 text-white" />
                ) : step.status === "loading" ? (
                  <Loader2 className="h-4 w-4 text-primary animate-spin" />
                ) : (
                  <span className="text-sm text-muted-foreground/50">{index + 1}</span>
                )}
              </div>
              <div className="flex-1 flex items-center gap-2">
                <span
                  className={cn(
                    "text-sm transition-colors",
                    step.status === "complete" && "text-green-600",
                    step.status === "loading" && "text-primary font-medium",
                    step.status === "pending" && "text-muted-foreground/50"
                  )}
                >
                  {step.label}
                </span>
                {hasSubSteps(step) && (
                  <span className="text-muted-foreground/50">
                    {expandedSteps.has(index) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </span>
                )}
              </div>
            </div>

            {/* Step detail */}
            {step.detail && step.status !== "pending" && (
              <div className="ml-11 text-xs text-muted-foreground animate-fade-in">
                {step.detail}
              </div>
            )}

            {/* Sub-steps (expandable) */}
            {hasSubSteps(step) && (step.status === "loading" || expandedSteps.has(index)) && (
              <div className="ml-11 mt-2 space-y-1.5 animate-fade-in">
                {step.subSteps!.map((subStep, subIndex) => (
                  <div key={subIndex} className="flex items-center gap-2">
                    <div
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded-full border",
                        subStep.status === "complete" && "bg-green-500 border-green-500",
                        subStep.status === "loading" && "border-primary",
                        subStep.status === "pending" && "border-muted-foreground/30"
                      )}
                    >
                      {subStep.status === "complete" ? (
                        <Check className="h-2.5 w-2.5 text-white" />
                      ) : subStep.status === "loading" ? (
                        <Loader2 className="h-2.5 w-2.5 text-primary animate-spin" />
                      ) : null}
                    </div>
                    <span
                      className={cn(
                        "text-xs",
                        subStep.status === "complete" && "text-green-600",
                        subStep.status === "loading" && "text-primary",
                        subStep.status === "pending" && "text-muted-foreground/40"
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

      {/* Rotating humorous tip */}
      {currentTip && (
        <div className="mt-6 p-3 rounded-lg bg-muted/50 border border-border/50 animate-fade-in">
          <p className="text-sm text-muted-foreground italic text-center">
            {currentTip}
          </p>
        </div>
      )}
    </div>
  );
}
