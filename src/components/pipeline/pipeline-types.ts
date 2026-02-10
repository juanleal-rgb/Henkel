// Pipeline State Types - Henkel PO Caller Batch Pipeline

import type { BatchStatus, POActionType } from "@/lib/validators";

// Re-export for convenience
export type { BatchStatus, POActionType };

// Stage configuration for batch pipeline
export interface StageConfig {
  id: BatchStatus;
  label: string;
  labelShort: string;
  description: string;
}

export const STAGE_CONFIG: Record<BatchStatus, StageConfig> = {
  QUEUED: {
    id: "QUEUED",
    label: "Queued",
    labelShort: "Queue",
    description: "Batches in queue, waiting for call",
  },
  IN_PROGRESS: {
    id: "IN_PROGRESS",
    label: "In Progress",
    labelShort: "Active",
    description: "Calls currently in progress",
  },
  COMPLETED: {
    id: "COMPLETED",
    label: "Completed",
    labelShort: "Done",
    description: "Successfully processed batches",
  },
  FAILED: {
    id: "FAILED",
    label: "Failed",
    labelShort: "Failed",
    description: "Batches that failed after max retries",
  },
  PARTIAL: {
    id: "PARTIAL",
    label: "Partial",
    labelShort: "Partial",
    description: "Some POs resolved, others need retry",
  },
};

// Query params for fetching batches
export type BatchSortField = "poCount" | "totalValue" | "supplier" | "createdAt" | "priority";
export type SortOrder = "asc" | "desc";

export interface BatchQueryParams {
  status: BatchStatus;
  page?: number;
  limit?: number;
  sort?: BatchSortField;
  order?: SortOrder;
  search?: string;
  actionType?: POActionType;
}

export interface BatchPagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

export interface BatchResponse {
  batches: PipelineBatch[];
  pagination: BatchPagination;
}

// Pipeline batch interface (matches SupplierBatch from Prisma)
export interface PipelineBatch {
  id: string;
  supplierId: string;
  supplier: {
    supplierNumber: string;
    name: string;
    phone: string;
  };
  status: BatchStatus;
  actionTypes: POActionType[];
  totalValue: number;
  poCount: number;
  priority: number;
  attemptCount: number;
  maxAttempts: number;
  scheduledFor?: string;
  lastOutcome?: string;
  lastOutcomeReason?: string;
  happyRobotRunId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// Stage data with batches
export interface StageData {
  stage: BatchStatus;
  config: StageConfig;
  count: number;
  totalValue?: number;
  batches: PipelineBatch[];
}

// Pipeline stages in order (main flow)
export const PIPELINE_STAGES: BatchStatus[] = ["QUEUED", "IN_PROGRESS", "COMPLETED"];

// Terminal stages (separate visualization)
export const TERMINAL_STAGES: BatchStatus[] = ["FAILED", "PARTIAL"];

// ============================================================================
// Color Palette - Monochrome Professional Theme
// Status differentiation via opacity levels
// ============================================================================

export interface StageColors {
  fill: string;
  border: string;
  gradient: { start: string; end: string };
  accent: string;
  text: string;
  opacity: number;
}

// Dark mode colors (default) - Monochrome base with subtle semantic accents
export const stageColors: Record<BatchStatus, StageColors> = {
  QUEUED: {
    // Neutral white - waiting state
    fill: "rgba(255, 255, 255, 0.06)",
    border: "rgba(255, 255, 255, 0.15)",
    gradient: { start: "rgba(255, 255, 255, 0.10)", end: "rgba(255, 255, 255, 0.04)" },
    accent: "rgba(255, 255, 255, 0.70)",
    text: "rgba(255, 255, 255, 0.80)",
    opacity: 0.7,
  },
  IN_PROGRESS: {
    // Blue tint - active/processing (like Vercel's blue links)
    fill: "rgba(59, 130, 246, 0.12)",
    border: "rgba(59, 130, 246, 0.35)",
    gradient: { start: "rgba(59, 130, 246, 0.18)", end: "rgba(59, 130, 246, 0.06)" },
    accent: "rgba(96, 165, 250, 0.95)",
    text: "rgba(147, 197, 253, 0.95)",
    opacity: 0.9,
  },
  COMPLETED: {
    // Green tint - success (like Vercel's green status)
    fill: "rgba(34, 197, 94, 0.12)",
    border: "rgba(34, 197, 94, 0.35)",
    gradient: { start: "rgba(34, 197, 94, 0.18)", end: "rgba(34, 197, 94, 0.06)" },
    accent: "rgba(74, 222, 128, 0.95)",
    text: "rgba(134, 239, 172, 0.95)",
    opacity: 1.0,
  },
  FAILED: {
    // Red tint - error/failed (like Vercel's red delete)
    fill: "rgba(239, 68, 68, 0.10)",
    border: "rgba(239, 68, 68, 0.30)",
    gradient: { start: "rgba(239, 68, 68, 0.14)", end: "rgba(239, 68, 68, 0.04)" },
    accent: "rgba(248, 113, 113, 0.90)",
    text: "rgba(252, 165, 165, 0.90)",
    opacity: 0.8,
  },
  PARTIAL: {
    // Amber tint - warning/partial
    fill: "rgba(245, 158, 11, 0.10)",
    border: "rgba(245, 158, 11, 0.30)",
    gradient: { start: "rgba(245, 158, 11, 0.14)", end: "rgba(245, 158, 11, 0.04)" },
    accent: "rgba(251, 191, 36, 0.90)",
    text: "rgba(253, 224, 71, 0.90)",
    opacity: 0.85,
  },
};

// Light mode colors - Monochrome with opacity levels
export const stageColorsLight: Record<BatchStatus, StageColors> = {
  QUEUED: {
    fill: "rgba(0, 0, 0, 0.03)",
    border: "rgba(0, 0, 0, 0.08)",
    gradient: { start: "rgba(0, 0, 0, 0.05)", end: "rgba(0, 0, 0, 0.02)" },
    accent: "rgba(0, 0, 0, 0.40)",
    text: "rgba(0, 0, 0, 0.50)",
    opacity: 0.4,
  },
  IN_PROGRESS: {
    fill: "rgba(0, 0, 0, 0.06)",
    border: "rgba(0, 0, 0, 0.15)",
    gradient: { start: "rgba(0, 0, 0, 0.10)", end: "rgba(0, 0, 0, 0.04)" },
    accent: "rgba(0, 0, 0, 0.70)",
    text: "rgba(0, 0, 0, 0.80)",
    opacity: 0.7,
  },
  COMPLETED: {
    fill: "rgba(0, 0, 0, 0.08)",
    border: "rgba(0, 0, 0, 0.18)",
    gradient: { start: "rgba(0, 0, 0, 0.12)", end: "rgba(0, 0, 0, 0.05)" },
    accent: "rgba(0, 0, 0, 0.90)",
    text: "rgba(0, 0, 0, 0.95)",
    opacity: 1.0,
  },
  FAILED: {
    fill: "rgba(0, 0, 0, 0.03)",
    border: "rgba(0, 0, 0, 0.12)",
    gradient: { start: "rgba(0, 0, 0, 0.05)", end: "rgba(0, 0, 0, 0.02)" },
    accent: "rgba(0, 0, 0, 0.50)",
    text: "rgba(0, 0, 0, 0.60)",
    opacity: 0.5,
  },
  PARTIAL: {
    fill: "rgba(0, 0, 0, 0.04)",
    border: "rgba(0, 0, 0, 0.10)",
    gradient: { start: "rgba(0, 0, 0, 0.06)", end: "rgba(0, 0, 0, 0.03)" },
    accent: "rgba(0, 0, 0, 0.55)",
    text: "rgba(0, 0, 0, 0.65)",
    opacity: 0.6,
  },
};

// Helper function to get colors based on theme
export function getStageColors(theme: "light" | "dark" = "dark"): Record<BatchStatus, StageColors> {
  return theme === "light" ? stageColorsLight : stageColors;
}

// ============================================================================
// Action Type Colors (for badges) - Monochrome with different opacities
// ============================================================================

export const actionTypeColors: Record<POActionType, { bg: string; text: string; border: string }> =
  {
    CANCEL: {
      // Red - destructive action
      bg: "rgba(239, 68, 68, 0.12)",
      text: "rgba(248, 113, 113, 0.95)",
      border: "rgba(239, 68, 68, 0.30)",
    },
    EXPEDITE: {
      // Amber - urgent action
      bg: "rgba(245, 158, 11, 0.12)",
      text: "rgba(251, 191, 36, 0.95)",
      border: "rgba(245, 158, 11, 0.30)",
    },
    PUSH_OUT: {
      // Blue - standard action
      bg: "rgba(59, 130, 246, 0.10)",
      text: "rgba(96, 165, 250, 0.95)",
      border: "rgba(59, 130, 246, 0.25)",
    },
  };

// ============================================================================
// Animation Configuration
// ============================================================================

export const stageAnimationSpeeds: Record<BatchStatus, { speed: number; amplitude: number }> = {
  QUEUED: { speed: 0.2, amplitude: 10 },
  IN_PROGRESS: { speed: 0.35, amplitude: 14 }, // Most active - fastest animation
  COMPLETED: { speed: 0.1, amplitude: 6 },
  FAILED: { speed: 0.05, amplitude: 4 },
  PARTIAL: { speed: 0.15, amplitude: 8 },
};

// ============================================================================
// Priority Display - Monochrome
// ============================================================================

export function getPriorityLabel(priority: number): {
  label: string;
  color: string;
  opacity: number;
} {
  if (priority >= 80) return { label: "Critical", color: "rgba(255, 255, 255, 0.95)", opacity: 1 };
  if (priority >= 60) return { label: "High", color: "rgba(255, 255, 255, 0.80)", opacity: 0.8 };
  if (priority >= 40) return { label: "Medium", color: "rgba(255, 255, 255, 0.65)", opacity: 0.65 };
  return { label: "Normal", color: "rgba(255, 255, 255, 0.50)", opacity: 0.5 };
}

// ============================================================================
// Attempt Status - Monochrome
// ============================================================================

export function getAttemptStatus(
  attemptCount: number,
  maxAttempts: number
): {
  label: string;
  color: string;
  isWarning: boolean;
} {
  const remaining = maxAttempts - attemptCount;
  if (remaining <= 0)
    return { label: "Max reached", color: "rgba(255, 255, 255, 0.90)", isWarning: true };
  if (remaining === 1)
    return { label: "Last attempt", color: "rgba(255, 255, 255, 0.75)", isWarning: true };
  return { label: `${remaining} left`, color: "rgba(255, 255, 255, 0.50)", isWarning: false };
}
