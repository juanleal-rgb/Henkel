"use client";

import {
  Clock,
  Phone,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Calendar,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  stageColors,
  actionTypeColors,
  getAttemptStatus,
} from "@/components/pipeline/pipeline-types";
import type { SupplierBatch } from "./supplier-types";
import type { BatchStatus, POActionType } from "@/lib/validators";

interface BatchCardProps {
  batch: SupplierBatch;
  onClick: () => void;
  className?: string;
}

const statusConfig: Record<BatchStatus, { label: string; icon: typeof Clock }> = {
  QUEUED: { label: "Queued", icon: Clock },
  IN_PROGRESS: { label: "In Progress", icon: Phone },
  COMPLETED: { label: "Completed", icon: CheckCircle2 },
  FAILED: { label: "Failed", icon: XCircle },
  PARTIAL: { label: "Partial", icon: AlertTriangle },
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getActionTypeLabel(type: POActionType): string {
  switch (type) {
    case "CANCEL":
      return "Cancel";
    case "EXPEDITE":
      return "Expedite";
    case "PUSH_OUT":
      return "Push Out";
    default:
      return type;
  }
}

export function BatchCard({ batch, onClick, className }: BatchCardProps) {
  const status = statusConfig[batch.status];
  const StatusIcon = status.icon;
  const colors = stageColors[batch.status];
  const attemptStatus = getAttemptStatus(batch.attemptCount, batch.maxAttempts);

  // Determine what to show in the timing section
  const getTimingInfo = () => {
    if (batch.status === "QUEUED" && batch.scheduledFor) {
      return {
        label: "Scheduled",
        value: formatDate(batch.scheduledFor),
        icon: Calendar,
      };
    }
    if (batch.status === "IN_PROGRESS" && batch.lastAgentRun?.startedAt) {
      return {
        label: "Started",
        value: formatDate(batch.lastAgentRun.startedAt),
        icon: Phone,
      };
    }
    if (batch.status === "COMPLETED" && batch.completedAt) {
      return {
        label: "Completed",
        value: formatDate(batch.completedAt),
        icon: CheckCircle2,
      };
    }
    return {
      label: "Created",
      value: formatDate(batch.createdAt),
      icon: Clock,
    };
  };

  const timing = getTimingInfo();
  const TimingIcon = timing.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex h-full flex-col rounded-xl border border-border-subtle bg-bg-surface p-4",
        "text-left transition-all duration-200",
        "hover:border-border-default hover:bg-bg-elevated",
        className
      )}
    >
      {/* Top row: Status badge + ID */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Status badge */}
          <div
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
            style={{ backgroundColor: colors.fill }}
          >
            <StatusIcon className="h-3.5 w-3.5" style={{ color: colors.text }} />
            <span className="text-[12px] font-medium" style={{ color: colors.text }}>
              {status.label}
            </span>
          </div>
        </div>
        {/* Arrow indicator */}
        <ChevronRight className="h-4 w-4 text-fg-disabled transition-transform group-hover:translate-x-0.5 group-hover:text-fg-muted" />
      </div>

      {/* Middle row: PO count + value */}
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-[20px] font-semibold text-fg-primary">{batch.poCount} POs</span>
        <span className="text-[14px] text-fg-muted">{formatCurrency(batch.totalValue)}</span>
      </div>

      {/* Action types */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {batch.actionTypes.map((type) => {
          const typeColors = actionTypeColors[type];
          return (
            <span
              key={type}
              className="rounded px-2 py-0.5 text-[11px] font-medium"
              style={{
                backgroundColor: typeColors.bg,
                color: typeColors.text,
                border: `1px ${type === "CANCEL" ? "dashed" : "solid"} ${typeColors.border}`,
              }}
            >
              {getActionTypeLabel(type)}
            </span>
          );
        })}
      </div>

      {/* Spacer to push bottom content down */}
      <div className="flex-1" />

      {/* Bottom row: Timing + Attempts */}
      <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3 text-[11px]">
        {/* Timing */}
        <div className="flex items-center gap-1 text-fg-muted">
          <TimingIcon className="h-3 w-3" />
          <span>{timing.value}</span>
        </div>
        {/* Attempt count */}
        <span
          className={cn("font-medium", attemptStatus.isWarning ? "text-white/80" : "text-fg-muted")}
        >
          {batch.attemptCount}/{batch.maxAttempts}
        </span>
      </div>
    </button>
  );
}
