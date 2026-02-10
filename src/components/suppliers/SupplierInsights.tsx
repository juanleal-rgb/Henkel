"use client";

import {
  Package,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  DollarSign,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SupplierStats } from "./supplier-types";

interface SupplierInsightsProps {
  stats: SupplierStats;
  className?: string;
}

interface InsightCard {
  id: string;
  label: string;
  value: string | number;
  subValue?: string;
  icon: LucideIcon;
  color: "default" | "warning" | "success" | "danger" | "info";
}

// Semantic color classes (Vercel/Linear style)
const colorClasses = {
  default: {
    bg: "bg-white/[0.06]",
    icon: "text-white/60",
    value: "text-fg-primary",
  },
  warning: {
    bg: "bg-warning/10 border border-warning/20",
    icon: "text-warning",
    value: "text-warning",
  },
  success: {
    bg: "bg-success/10 border border-success/20",
    icon: "text-success",
    value: "text-success",
  },
  danger: {
    bg: "bg-danger/10 border border-danger/20",
    icon: "text-danger",
    value: "text-danger",
  },
  info: {
    bg: "bg-info/10 border border-info/20",
    icon: "text-info",
    value: "text-info",
  },
};

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

export function SupplierInsights({ stats, className }: SupplierInsightsProps) {
  // Calculate derived metrics
  const pendingCount = (stats.byStatus.PENDING?.count || 0) + (stats.byStatus.QUEUED?.count || 0);
  const pendingValue =
    (stats.byStatus.PENDING?.totalValue || 0) + (stats.byStatus.QUEUED?.totalValue || 0);
  const inProgressCount = stats.byStatus.IN_PROGRESS?.count || 0;
  const completedCount = stats.byStatus.COMPLETED?.count || 0;
  const failedCount = stats.byStatus.FAILED?.count || 0;
  const partialCount = stats.byStatus.PARTIAL?.count || 0;

  const totalProcessed = completedCount + failedCount + partialCount;
  const successRate =
    totalProcessed > 0 ? Math.round((completedCount / totalProcessed) * 100) : null;

  // Calculate PO counts from stats
  const pendingPOs = (stats.byStatus.PENDING?.count || 0) + (stats.byStatus.QUEUED?.count || 0);
  const inProgressPOs = stats.byStatus.IN_PROGRESS?.count || 0;
  const completedPOs = stats.byStatus.COMPLETED?.count || 0;
  const failedPOs = (stats.byStatus.FAILED?.count || 0) + (stats.byStatus.PARTIAL?.count || 0);

  const insights: InsightCard[] = [
    {
      id: "action-required",
      label: "Action Required",
      value: `${pendingPOs} POs`,
      subValue: formatCurrency(pendingValue),
      icon: Package,
      color: pendingPOs > 0 ? "warning" : "default",
    },
    {
      id: "in-progress",
      label: "In Progress",
      value: `${inProgressPOs} POs`,
      icon: Clock,
      color: inProgressPOs > 0 ? "info" : "default",
    },
    {
      id: "completed",
      label: "Completed",
      value: `${completedPOs} POs`,
      icon: CheckCircle2,
      color: completedPOs > 0 ? "success" : "default",
    },
    {
      id: "success-rate",
      label: "Success Rate",
      value: successRate !== null ? `${successRate}%` : "-",
      icon: TrendingUp,
      color: successRate !== null ? (successRate >= 80 ? "success" : "warning") : "default",
    },
    {
      id: "failed",
      label: "Needs Review",
      value: `${failedPOs} POs`,
      icon: AlertCircle,
      color: failedPOs > 0 ? "danger" : "default",
    },
    {
      id: "total-value",
      label: "Total Value",
      value: formatCurrency(stats.totalValue),
      subValue: `${stats.totalPOs} POs`,
      icon: DollarSign,
      color: "default",
    },
  ];

  return (
    <div className={cn("grid grid-cols-6 gap-3", className)}>
      {insights.map((insight) => {
        const Icon = insight.icon;
        const colors = colorClasses[insight.color];

        return (
          <div
            key={insight.id}
            className="rounded-lg border border-border-subtle bg-bg-surface p-4"
          >
            <div className="flex items-center gap-2">
              <div className={cn("rounded-md p-1.5", colors.bg)}>
                <Icon className={cn("h-4 w-4", colors.icon)} />
              </div>
              <span className="text-[12px] font-medium text-fg-muted">{insight.label}</span>
            </div>
            <div className="mt-2">
              <span className={cn("text-[24px] font-semibold", colors.value)}>{insight.value}</span>
              {insight.subValue && (
                <span className="ml-2 text-[12px] text-fg-muted">{insight.subValue}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
