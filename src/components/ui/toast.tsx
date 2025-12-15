"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast = { ...toast, id };
    setToasts((prev) => [...prev, newToast]);

    // Auto-remove after duration (default 4 seconds)
    const duration = toast.duration ?? 4000;
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const icons = {
    success: <CheckCircle className="h-5 w-5 text-green-500" />,
    error: <AlertCircle className="h-5 w-5 text-red-500" />,
    info: <Info className="h-5 w-5 text-blue-500" />,
    warning: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
  };

  const bgColors = {
    success: "bg-green-50 dark:bg-green-950/50 border-green-200 dark:border-green-800",
    error: "bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800",
    info: "bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800",
    warning: "bg-yellow-50 dark:bg-yellow-950/50 border-yellow-200 dark:border-yellow-800",
  };

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-lg animate-slide-in-right",
        bgColors[toast.type]
      )}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex-shrink-0">{icons[toast.type]}</div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{toast.title}</p>
        {toast.description && (
          <p className="mt-1 text-sm text-muted-foreground">{toast.description}</p>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="flex-shrink-0 p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  );
}

// Convenience hooks for common toast types
export function useSuccessToast() {
  const { addToast } = useToast();
  return useCallback(
    (title: string, description?: string) => addToast({ type: "success", title, description }),
    [addToast]
  );
}

export function useErrorToast() {
  const { addToast } = useToast();
  return useCallback(
    (title: string, description?: string) => addToast({ type: "error", title, description }),
    [addToast]
  );
}

export function useInfoToast() {
  const { addToast } = useToast();
  return useCallback(
    (title: string, description?: string) => addToast({ type: "info", title, description }),
    [addToast]
  );
}

export function useWarningToast() {
  const { addToast } = useToast();
  return useCallback(
    (title: string, description?: string) => addToast({ type: "warning", title, description }),
    [addToast]
  );
}
