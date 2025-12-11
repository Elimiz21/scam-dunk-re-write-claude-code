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
    bgColor: "bg-red-50",
    borderColor: "border-red-400",
    textColor: "text-red-800",
    iconColor: "text-red-400",
  },
  warning: {
    icon: AlertTriangle,
    bgColor: "bg-yellow-50",
    borderColor: "border-yellow-400",
    textColor: "text-yellow-800",
    iconColor: "text-yellow-400",
  },
  success: {
    icon: CheckCircle,
    bgColor: "bg-green-50",
    borderColor: "border-green-400",
    textColor: "text-green-800",
    iconColor: "text-green-400",
  },
  info: {
    icon: Info,
    bgColor: "bg-blue-50",
    borderColor: "border-blue-400",
    textColor: "text-blue-800",
    iconColor: "text-blue-400",
  },
};

export default function AlertBanner({ type, title, message, onDismiss }: AlertBannerProps) {
  const config = typeConfig[type];
  const Icon = config.icon;

  return (
    <div className={`rounded-md ${config.bgColor} border ${config.borderColor} p-4`}>
      <div className="flex">
        <div className="flex-shrink-0">
          <Icon className={`h-5 w-5 ${config.iconColor}`} />
        </div>
        <div className="ml-3 flex-1">
          <p className={`text-sm font-medium ${config.textColor}`}>{title}</p>
          {message && <p className={`mt-1 text-sm ${config.textColor} opacity-90`}>{message}</p>}
        </div>
        {onDismiss && (
          <div className="ml-auto pl-3">
            <button
              onClick={onDismiss}
              className={`inline-flex ${config.textColor} hover:opacity-70`}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
