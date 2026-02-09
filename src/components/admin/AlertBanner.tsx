"use client";

import { AlertTriangle, X, AlertCircle, CheckCircle, Info } from "lucide-react";

interface AlertBannerProps {
  type: "error" | "warning" | "success" | "info";
  title: string;
  message?: string;
  onDismiss?: () => void;
}

const typeConfig = {
  error: {
    icon: AlertCircle,
    bgColor: "bg-destructive/10",
    borderColor: "border-destructive/30",
    textColor: "text-destructive",
    iconColor: "text-destructive",
  },
  warning: {
    icon: AlertTriangle,
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    textColor: "text-amber-700 dark:text-amber-400",
    iconColor: "text-amber-500",
  },
  success: {
    icon: CheckCircle,
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    textColor: "text-emerald-700 dark:text-emerald-400",
    iconColor: "text-emerald-500",
  },
  info: {
    icon: Info,
    bgColor: "bg-primary/10",
    borderColor: "border-primary/30",
    textColor: "text-primary",
    iconColor: "text-primary",
  },
};

export default function AlertBanner({ type, title, message, onDismiss }: AlertBannerProps) {
  const config = typeConfig[type];
  const Icon = config.icon;

  return (
    <div className={`rounded-2xl ${config.bgColor} border ${config.borderColor} p-4`}>
      <div className="flex">
        <div className="flex-shrink-0">
          <Icon className={`h-5 w-5 ${config.iconColor}`} />
        </div>
        <div className="ml-3 flex-1">
          <p className={`text-sm font-medium ${config.textColor}`}>{title}</p>
          {message && <p className={`mt-1 text-sm ${config.textColor} opacity-80`}>{message}</p>}
        </div>
        {onDismiss && (
          <div className="ml-auto pl-3">
            <button
              onClick={onDismiss}
              className={`inline-flex ${config.textColor} hover:opacity-70 transition-opacity`}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
