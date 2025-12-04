"use client";

import { cn } from "@/lib/utils";
import { Check, Loader2 } from "lucide-react";

interface Step {
  label: string;
  status: "pending" | "loading" | "complete";
}

interface LoadingStepperProps {
  steps: Step[];
}

export function LoadingStepper({ steps }: LoadingStepperProps) {
  return (
    <div className="space-y-3">
      {steps.map((step, index) => (
        <div key={index} className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border-2",
              step.status === "complete" && "bg-green-500 border-green-500",
              step.status === "loading" && "border-primary",
              step.status === "pending" && "border-gray-300"
            )}
          >
            {step.status === "complete" ? (
              <Check className="h-4 w-4 text-white" />
            ) : step.status === "loading" ? (
              <Loader2 className="h-4 w-4 text-primary animate-spin" />
            ) : (
              <span className="text-sm text-gray-400">{index + 1}</span>
            )}
          </div>
          <span
            className={cn(
              "text-sm",
              step.status === "complete" && "text-green-600",
              step.status === "loading" && "text-primary font-medium",
              step.status === "pending" && "text-gray-400"
            )}
          >
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}
