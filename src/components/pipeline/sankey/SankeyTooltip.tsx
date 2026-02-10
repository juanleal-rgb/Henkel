"use client";

import { memo } from "react";
import type { SankeyViewMode } from "./sankey-types";
import type { BatchStatus } from "../pipeline-types";
import { STAGE_CONFIG, stageColors } from "../pipeline-types";
import { formatCurrency, formatCount } from "./sankey-utils";

interface SankeyTooltipProps {
  type: "node" | "link" | "outcome";
  sourceStage?: BatchStatus;
  targetStage?: BatchStatus;
  count: number;
  value: number;
  viewMode: SankeyViewMode;
  position: { x: number; y: number };
}

/**
 * SankeyTooltip - Floating tooltip for nodes and links
 */
export const SankeyTooltip = memo(function SankeyTooltip({
  type,
  sourceStage,
  targetStage,
  count,
  value,
  viewMode,
  position,
}: SankeyTooltipProps) {
  const sourceConfig = sourceStage ? STAGE_CONFIG[sourceStage] : null;
  const targetConfig = targetStage ? STAGE_CONFIG[targetStage] : null;
  const sourceColors = sourceStage ? stageColors[sourceStage] : null;

  // Determine tooltip content
  let title = "";
  let subtitle = "";

  if (type === "outcome" && sourceConfig && targetConfig) {
    title = `${sourceConfig.label} → ${targetConfig.label}`;
    subtitle =
      viewMode === "count"
        ? `${formatCount(count)} batches`
        : `${formatCurrency(value)} total value`;
  } else if (type === "link" && sourceConfig && targetConfig) {
    title = `${sourceConfig.label} → ${targetConfig.label}`;
    subtitle = viewMode === "count" ? `${formatCount(count)} batches` : formatCurrency(value);
  } else if (type === "node" && sourceConfig) {
    title = sourceConfig.label;
    subtitle = viewMode === "count" ? `${formatCount(count)} batches` : formatCurrency(value);
  }

  return (
    <div
      className="pointer-events-none absolute z-50 rounded-lg border border-white/10 bg-slate-900/95 px-3 py-2 shadow-xl backdrop-blur-sm"
      style={{
        left: position.x,
        top: position.y,
        transform: "translate(-50%, -100%) translateY(-8px)",
      }}
    >
      {/* Arrow */}
      <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900/95" />

      {/* Content */}
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium" style={{ color: sourceColors?.text || "white" }}>
          {title}
        </span>
        <span className="text-xs text-slate-400">{subtitle}</span>
      </div>
    </div>
  );
});

export default SankeyTooltip;
