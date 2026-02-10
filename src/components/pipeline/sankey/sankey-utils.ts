import type { SankeyLinkLayout } from "./sankey-types";
import type { BatchStatus, StageData } from "../pipeline-types";
import { PIPELINE_STAGES, stageColors } from "../pipeline-types";
import type { SankeyInputData, SankeyFlowData } from "./sankey-types";

// ============================================================================
// Path Generation
// ============================================================================

/**
 * Generate a Bezier curve path for a Sankey flow link
 * Creates a smooth curved path from source node to target node
 */
export function generateFlowPath(link: SankeyLinkLayout): string {
  const { sourceX, sourceY0, sourceY1, targetX, targetY0, targetY1 } = link;

  // Control point X at midpoint for smooth curves
  const cpX = (sourceX + targetX) / 2;

  // Create closed path: top curve, right edge, bottom curve, left edge
  return `
    M ${sourceX},${sourceY0}
    C ${cpX},${sourceY0} ${cpX},${targetY0} ${targetX},${targetY0}
    L ${targetX},${targetY1}
    C ${cpX},${targetY1} ${cpX},${sourceY1} ${sourceX},${sourceY1}
    Z
  `
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Generate a curved path for outcome flows (going downward to COMPLETED/FAILED/PARTIAL)
 */
export function generateOutcomeFlowPath(
  sourceX: number,
  sourceY: number,
  sourceWidth: number,
  targetX: number,
  targetY: number,
  flowWidth: number
): string {
  const startX = sourceX + sourceWidth / 2 - flowWidth / 2;
  const endX = targetX - flowWidth / 2;

  // Control points for smooth S-curve downward
  const cpY1 = sourceY + (targetY - sourceY) * 0.4;
  const cpY2 = sourceY + (targetY - sourceY) * 0.6;

  return `
    M ${startX},${sourceY}
    C ${startX},${cpY1} ${endX},${cpY2} ${endX},${targetY}
    L ${endX + flowWidth},${targetY}
    C ${endX + flowWidth},${cpY2} ${startX + flowWidth},${cpY1} ${startX + flowWidth},${sourceY}
    Z
  `
    .trim()
    .replace(/\s+/g, " ");
}

// ============================================================================
// Color Utilities
// ============================================================================

/**
 * Parse RGBA color string to components
 */
export function parseRgba(color: string): { r: number; g: number; b: number; a: number } {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (match) {
    return {
      r: parseInt(match[1]),
      g: parseInt(match[2]),
      b: parseInt(match[3]),
      a: parseFloat(match[4] ?? "1"),
    };
  }
  return { r: 128, g: 128, b: 128, a: 0.5 };
}

/**
 * Convert RGBA components to CSS string
 */
export function toRgba(color: { r: number; g: number; b: number; a: number }): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
}

/**
 * Interpolate between two colors
 */
export function interpolateColor(color1: string, color2: string, t: number): string {
  const c1 = parseRgba(color1);
  const c2 = parseRgba(color2);

  return toRgba({
    r: Math.round(c1.r + (c2.r - c1.r) * t),
    g: Math.round(c1.g + (c2.g - c1.g) * t),
    b: Math.round(c1.b + (c2.b - c1.b) * t),
    a: c1.a + (c2.a - c1.a) * t,
  });
}

/**
 * Get gradient ID for a link between two stages
 */
export function getLinkGradientId(source: BatchStatus, target: BatchStatus): string {
  return `sankey-gradient-${source}-${target}`;
}

/**
 * Get colors for a stage
 */
export function getStageColorsById(stage: BatchStatus) {
  return stageColors[stage];
}

// ============================================================================
// Data Transformation
// ============================================================================

/**
 * Transform StageData[] into SankeyInputData
 * Creates flows for dual-pipeline visualization:
 * - Main Queue: PENDING → QUEUED → IN_PROGRESS
 * - Callback Queue: (scheduled batches) → IN_PROGRESS
 * - Outcomes: IN_PROGRESS → COMPLETED/FAILED/PARTIAL
 */
export function transformToSankeyData(stages: StageData[]): SankeyInputData {
  const mainQueueFlows: SankeyFlowData[] = [];
  const callbackFlows: SankeyFlowData[] = [];
  const outcomeFlows: SankeyFlowData[] = [];

  // Get stage data by ID
  const stageMap = new Map<BatchStatus, StageData>();
  stages.forEach((s) => {
    stageMap.set(s.stage, s);
  });

  // Calculate totals
  const totals = {
    batchCount: 0,
    totalValue: 0,
    completedCount: 0,
    completedValue: 0,
    failedCount: 0,
    failedValue: 0,
  };

  stages.forEach((s) => {
    totals.batchCount += s.count;
    totals.totalValue += s.totalValue || 0;

    if (s.stage === "COMPLETED") {
      totals.completedCount = s.count;
      totals.completedValue = s.totalValue || 0;
    }
    if (s.stage === "FAILED") {
      totals.failedCount = s.count;
      totals.failedValue = s.totalValue || 0;
    }
  });

  // Main queue flows: QUEUED → IN_PROGRESS
  const mainStages: BatchStatus[] = ["QUEUED", "IN_PROGRESS"];
  for (let i = 0; i < mainStages.length - 1; i++) {
    const sourceStage = stageMap.get(mainStages[i]);
    const targetStage = stageMap.get(mainStages[i + 1]);

    if (sourceStage && targetStage) {
      // Flow is based on downstream batches
      const flowCount = Math.min(sourceStage.count, targetStage.count);
      const avgValue =
        sourceStage.count > 0 ? (sourceStage.totalValue || 0) / sourceStage.count : 0;

      if (flowCount > 0) {
        mainQueueFlows.push({
          source: mainStages[i],
          target: mainStages[i + 1],
          batches: [],
          count: flowCount,
          value: flowCount * avgValue,
        });
      }
    }
  }

  // Outcome flows: IN_PROGRESS → COMPLETED/FAILED/PARTIAL
  const inProgressStage = stageMap.get("IN_PROGRESS");
  const outcomeStages: BatchStatus[] = ["COMPLETED", "FAILED", "PARTIAL"];

  outcomeStages.forEach((outcomeStage) => {
    const outcome = stageMap.get(outcomeStage);
    if (inProgressStage && outcome && outcome.count > 0) {
      outcomeFlows.push({
        source: "IN_PROGRESS",
        target: outcomeStage,
        batches: [],
        count: outcome.count,
        value: outcome.totalValue || 0,
      });
    }
  });

  return { stages, mainQueueFlows, callbackFlows, outcomeFlows, totals };
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format a number as currency (USD)
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
 * Format a count with suffix
 */
export function formatCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

/**
 * Get display value based on view mode
 */
export function getDisplayValue(count: number, value: number, viewMode: "count" | "value"): string {
  return viewMode === "count" ? formatCount(count) : formatCurrency(value);
}
