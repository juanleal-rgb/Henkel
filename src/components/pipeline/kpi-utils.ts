import type { StageData } from "./pipeline-types";
import { Phone, CheckCircle, AlertTriangle, DollarSign, type LucideIcon } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

export interface KPIData {
  id: string;
  label: string;
  value: string | number;
  displayValue: string;
  trend?: {
    value: number;
    direction: "up" | "down";
  };
  icon: LucideIcon;
  color: "primary" | "secondary" | "tertiary" | "muted";
  description: string;
}

export interface PipelineMetrics {
  totalBatches: number;
  queuedBatches: number;
  activeCalls: number;
  completedBatches: number;
  failedBatches: number;
  partialBatches: number;
  totalValue: number;
  queuedValue: number;
  completedValue: number;
  successRate: number;
}

// ============================================================================
// Calculation Functions
// ============================================================================

/**
 * Calculate all pipeline metrics from stage data
 */
export function calculatePipelineMetrics(stages: StageData[]): PipelineMetrics {
  let totalBatches = 0;
  let queuedBatches = 0;
  let activeCalls = 0;
  let completedBatches = 0;
  let failedBatches = 0;
  let partialBatches = 0;
  let totalValue = 0;
  let queuedValue = 0;
  let completedValue = 0;

  stages.forEach((stage) => {
    const stageValue = stage.totalValue || 0;

    switch (stage.stage) {
      case "QUEUED":
        queuedBatches = stage.count;
        queuedValue = stageValue;
        break;
      case "IN_PROGRESS":
        activeCalls = stage.count;
        break;
      case "COMPLETED":
        completedBatches = stage.count;
        completedValue = stageValue;
        break;
      case "FAILED":
        failedBatches = stage.count;
        break;
      case "PARTIAL":
        partialBatches = stage.count;
        break;
    }

    totalBatches += stage.count;
    totalValue += stageValue;
  });

  // Success Rate: Completed / (Completed + Failed) * 100
  const closedTotal = completedBatches + failedBatches;
  const successRate = closedTotal > 0 ? (completedBatches / closedTotal) * 100 : 0;

  return {
    totalBatches,
    queuedBatches,
    activeCalls,
    completedBatches,
    failedBatches,
    partialBatches,
    totalValue,
    queuedValue,
    completedValue,
    successRate,
  };
}

/**
 * Generate queue-focused KPIs from pipeline data
 */
export function generateKPIs(stages: StageData[], previousMetrics?: PipelineMetrics): KPIData[] {
  const metrics = calculatePipelineMetrics(stages);

  // Calculate trends (mock - would compare to previous period in real app)
  const trends = calculateMockTrends(metrics, previousMetrics);

  return [
    {
      id: "queued-batches",
      label: "In Queue",
      value: metrics.queuedBatches,
      displayValue: metrics.queuedBatches.toString(),
      trend: trends.queuedBatches,
      icon: Phone,
      color: "primary",
      description: "Batches waiting for call",
    },
    {
      id: "success-rate",
      label: "Success Rate",
      value: metrics.successRate,
      displayValue: `${metrics.successRate.toFixed(1)}%`,
      trend: trends.successRate,
      icon: CheckCircle,
      color: "secondary",
      description: "Completed vs failed batches",
    },
    {
      id: "active-calls",
      label: "Active Calls",
      value: metrics.activeCalls,
      displayValue: metrics.activeCalls.toString(),
      trend: trends.activeCalls,
      icon: AlertTriangle,
      color: "tertiary",
      description: "Calls currently in progress",
    },
    {
      id: "total-value",
      label: "Queue Value",
      value: metrics.queuedValue,
      displayValue: formatCurrency(metrics.queuedValue),
      trend: trends.totalValue,
      icon: DollarSign,
      color: "muted",
      description: "Total value in queue",
    },
  ];
}

/**
 * Calculate mock trends (comparison to previous period)
 */
function calculateMockTrends(
  current: PipelineMetrics,
  previous?: PipelineMetrics
): Record<string, { value: number; direction: "up" | "down" }> {
  if (!previous) {
    // Mock neutral/positive trends
    return {
      queuedBatches: { value: 0, direction: "up" },
      successRate: { value: 5, direction: "up" },
      activeCalls: { value: 0, direction: "up" },
      totalValue: { value: 8, direction: "up" },
    };
  }

  const calcTrend = (curr: number, prev: number, lowerIsBetter = false) => {
    if (prev === 0) return { value: 0, direction: "up" as const };
    const change = ((curr - prev) / prev) * 100;
    const direction = lowerIsBetter ? (change < 0 ? "up" : "down") : change >= 0 ? "up" : "down";
    return { value: Math.abs(Math.round(change)), direction: direction as "up" | "down" };
  };

  return {
    queuedBatches: calcTrend(current.queuedBatches, previous.queuedBatches, true), // Lower is better
    successRate: calcTrend(current.successRate, previous.successRate),
    activeCalls: calcTrend(current.activeCalls, previous.activeCalls),
    totalValue: calcTrend(current.queuedValue, previous.queuedValue),
  };
}

// ============================================================================
// Stats-based KPI Generation (for efficient API)
// ============================================================================

/**
 * Stats response from /api/batches/stats
 */
export interface StatsResponse {
  stages: Record<
    string,
    {
      count: number;
      totalValue: number;
    }
  >;
  totals: {
    batches: number;
    totalValue: number;
    totalPOs: number;
    uniqueSuppliers: number;
  };
  actionTypes: Record<string, { count: number; totalValue: number }>;
}

/**
 * Generate KPIs directly from stats API response
 * More efficient than fetching all batches
 */
export function generateKPIsFromStats(stats: StatsResponse): KPIData[] {
  const { stages, totals: _totals } = stats;

  const queuedBatches = stages["QUEUED"]?.count || 0;
  const queuedValue = stages["QUEUED"]?.totalValue || 0;
  const activeCalls = stages["IN_PROGRESS"]?.count || 0;
  const completedBatches = stages["COMPLETED"]?.count || 0;
  const failedBatches = stages["FAILED"]?.count || 0;

  // Success Rate: Completed / (Completed + Failed) * 100
  const closedTotal = completedBatches + failedBatches;
  const successRate = closedTotal > 0 ? (completedBatches / closedTotal) * 100 : 100;

  // Mock trends (would compare to previous period in real app)
  const trends = {
    queuedBatches: { value: 0, direction: "up" as const },
    successRate: { value: 5, direction: "up" as const },
    activeCalls: { value: 0, direction: "up" as const },
    totalValue: { value: 8, direction: "up" as const },
  };

  return [
    {
      id: "queued-batches",
      label: "In Queue",
      value: queuedBatches,
      displayValue: queuedBatches.toString(),
      trend: trends.queuedBatches,
      icon: Phone,
      color: "primary",
      description: "Batches waiting for call",
    },
    {
      id: "success-rate",
      label: "Success Rate",
      value: successRate,
      displayValue: `${successRate.toFixed(1)}%`,
      trend: trends.successRate,
      icon: CheckCircle,
      color: "secondary",
      description: "Completed vs failed batches",
    },
    {
      id: "active-calls",
      label: "Active Calls",
      value: activeCalls,
      displayValue: activeCalls.toString(),
      trend: trends.activeCalls,
      icon: AlertTriangle,
      color: "tertiary",
      description: "Calls currently in progress",
    },
    {
      id: "total-value",
      label: "Queue Value",
      value: queuedValue,
      displayValue: formatCurrency(queuedValue),
      trend: trends.totalValue,
      icon: DollarSign,
      color: "muted",
      description: "Total value in queue",
    },
  ];
}

// ============================================================================
// Formatting Utilities
// ============================================================================

/**
 * Format number as currency (USD for Henkel)
 */
export function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(0)}`;
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format count with suffix
 */
export function formatCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

// ============================================================================
// Color Classes
// ============================================================================

// Monochrome color classes with better contrast
export const kpiColorClasses: Record<
  KPIData["color"],
  { bg: string; icon: string; trend: string; accent: string }
> = {
  primary: {
    bg: "from-white/[0.12] to-white/[0.06]",
    icon: "text-white/25",
    trend: "text-white/85",
    accent: "text-white/95",
  },
  secondary: {
    bg: "from-white/10 to-white/5",
    icon: "text-white/20",
    trend: "text-white/80",
    accent: "text-white/90",
  },
  tertiary: {
    bg: "from-white/[0.08] to-white/[0.04]",
    icon: "text-white/[0.18]",
    trend: "text-white/75",
    accent: "text-white/85",
  },
  muted: {
    bg: "from-white/[0.06] to-white/[0.03]",
    icon: "text-white/15",
    trend: "text-white/65",
    accent: "text-white/75",
  },
};
