"use client";

import { useEffect, useCallback } from "react";
import { useUIStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";

const TOAST_DURATION = 5000; // 5 seconds auto-dismiss

const iconMap = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle,
};

const colorMap = {
  info: {
    bg: "bg-[var(--color-info-muted)]",
    border: "border-[var(--color-info)]",
    icon: "text-[var(--color-info)]",
  },
  success: {
    bg: "bg-[var(--color-success-muted)]",
    border: "border-[var(--color-success)]",
    icon: "text-[var(--color-success)]",
  },
  warning: {
    bg: "bg-[var(--color-warning-muted)]",
    border: "border-[var(--color-warning)]",
    icon: "text-[var(--color-warning)]",
  },
  error: {
    bg: "bg-[var(--color-danger-muted)]",
    border: "border-[var(--color-danger)]",
    icon: "text-[var(--color-danger)]",
  },
};

interface ToastProps {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message?: string;
  onDismiss: (id: string) => void;
}

function Toast({ id, type, title, message, onDismiss }: ToastProps) {
  const Icon = iconMap[type];
  const colors = colorMap[type];

  // Auto-dismiss after duration
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(id);
    }, TOAST_DURATION);

    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm",
        "animate-in slide-in-from-right-full duration-300",
        colors.bg,
        colors.border
      )}
      role="alert"
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", colors.icon)} />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-fg-primary">{title}</p>
        {message && <p className="mt-0.5 text-[13px] text-fg-secondary">{message}</p>}
      </div>
      <button
        onClick={() => onDismiss(id)}
        className="shrink-0 text-fg-muted transition-colors hover:text-fg-primary"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Toaster() {
  const { notifications, removeNotification } = useUIStore();

  const handleDismiss = useCallback(
    (id: string) => {
      removeNotification(id);
    },
    [removeNotification]
  );

  // Only show the 5 most recent notifications
  const visibleNotifications = notifications.slice(-5);

  if (visibleNotifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed right-4 top-4 z-50 flex max-w-sm flex-col gap-2">
      {visibleNotifications.map((notification) => (
        <Toast
          key={notification.id}
          id={notification.id}
          type={notification.type}
          title={notification.title}
          message={notification.message}
          onDismiss={handleDismiss}
        />
      ))}
    </div>
  );
}

// Helper hook for easy toast creation
export function useToast() {
  const { addNotification } = useUIStore();

  return {
    toast: (options: {
      type: "info" | "success" | "warning" | "error";
      title: string;
      message?: string;
    }) => {
      addNotification(options);
    },
    success: (title: string, message?: string) => {
      addNotification({ type: "success", title, message });
    },
    error: (title: string, message?: string) => {
      addNotification({ type: "error", title, message });
    },
    warning: (title: string, message?: string) => {
      addNotification({ type: "warning", title, message });
    },
    info: (title: string, message?: string) => {
      addNotification({ type: "info", title, message });
    },
  };
}
