"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { SankeyNodeProps } from "./sankey-types";
import { getStageColors, STAGE_CONFIG } from "../pipeline-types";
import type { BatchStatus } from "../pipeline-types";
import { Clock, Tally4, Phone, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { PhoneHappyRobotMorph } from "@/components/animations";

// Icon mapping for batch stages
const stageIcons: Record<BatchStatus, typeof Phone> = {
  QUEUED: Tally4,
  IN_PROGRESS: Phone,
  COMPLETED: CheckCircle,
  FAILED: XCircle,
  PARTIAL: AlertTriangle,
};

/**
 * SankeyNode - Individual stage node in the Sankey diagram
 * Glass-morphism style with gradient fill
 * Includes subtle pulse animation when count changes
 */
export const SankeyNode = memo(function SankeyNode({
  node,
  isSelected,
  isHovered,
  isDimmed,
  isCompressed,
  theme = "dark",
  onClick,
  onMouseEnter,
  onMouseLeave,
}: SankeyNodeProps) {
  // Track value changes for pulse animation
  const prevValueRef = useRef(node.displayValue);
  const [isPulsing, setIsPulsing] = useState(false);

  useEffect(() => {
    if (prevValueRef.current !== node.displayValue) {
      prevValueRef.current = node.displayValue;
      setIsPulsing(true);
      const timer = setTimeout(() => setIsPulsing(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [node.displayValue]);
  const stageColorMap = getStageColors(theme);
  const colors = stageColorMap[node.id];
  const config = STAGE_CONFIG[node.id];
  const Icon = stageIcons[node.id];

  // Theme-aware text colors - better contrast
  const labelColor = theme === "light" ? "rgba(0, 0, 0, 0.7)" : "rgba(255, 255, 255, 0.75)";
  const valueColor = theme === "light" ? "rgba(0, 0, 0, 0.95)" : "rgba(255, 255, 255, 0.98)";
  const innerStrokeColor = theme === "light" ? "rgba(0, 0, 0, 0.10)" : "rgba(255, 255, 255, 0.15)";
  const hoverFillColor = theme === "light" ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.08)";

  // Use shorter labels when compressed, full labels when expanded
  const labelText = isCompressed ? config.labelShort : config.label;

  // Calculate font size based on compression and value length
  const isValueMode = node.displayValue.startsWith("$");
  const baseFontSize = isCompressed ? 14 : 18;
  const valueFontSize = isValueMode
    ? Math.min(baseFontSize, node.width * 0.18)
    : Math.min(baseFontSize + 4, node.width * 0.25);

  // Generate gradient ID
  const gradientId = `node-gradient-${node.id}`;
  const glowFilterId = `node-glow-${node.id}`;

  // Opacity based on state
  const opacity = isDimmed ? 0.4 : 1;

  return (
    <g
      data-sankey-node={node.id}
      className="cursor-pointer"
      style={{
        opacity,
        transform: `translate(${node.x}px, ${node.y}px)`,
        transition: "opacity 0.2s ease-out",
      }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Definitions */}
      <defs>
        {/* Gradient fill */}
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={colors.gradient.start} />
          <stop offset="100%" stopColor={colors.gradient.end} />
        </linearGradient>
      </defs>

      {/* Outer border when selected */}
      {isSelected && (
        <rect
          x={-3}
          y={-3}
          width={node.width + 6}
          height={node.height + 6}
          rx={13}
          ry={13}
          fill="none"
          stroke={colors.accent}
          strokeWidth={2}
        />
      )}

      {/* Pulsing border when receiving new data */}
      {isPulsing && !isSelected && (
        <rect
          x={-2}
          y={-2}
          width={node.width + 4}
          height={node.height + 4}
          rx={12}
          ry={12}
          fill="none"
          stroke={colors.border}
          strokeWidth={1.5}
          style={{
            animation: "pulse-live 1.2s ease-out",
          }}
        />
      )}

      {/* Main node rectangle */}
      <rect
        width={node.width}
        height={node.height}
        rx={10}
        ry={10}
        fill={`url(#${gradientId})`}
        stroke={colors.border}
        strokeWidth={isSelected ? 1.5 : 1}
        strokeDasharray={node.id === "FAILED" ? "4 2" : undefined}
        className="transition-all duration-200"
      />

      {/* Inner highlight for glass depth */}
      <rect
        x={2}
        y={2}
        width={node.width - 4}
        height={node.height - 4}
        rx={8}
        ry={8}
        fill="none"
        stroke={innerStrokeColor}
        strokeWidth={0.5}
      />

      {/* Stage label above node */}
      <text
        x={node.width / 2}
        y={-8}
        textAnchor="middle"
        fontSize={isCompressed ? 9 : 11}
        fontWeight={500}
        fontFamily="Inter, system-ui, sans-serif"
        letterSpacing="0.05em"
        fill={labelColor}
        className="uppercase"
      >
        {labelText}
      </text>

      {/* Value display - centered */}
      <text
        x={node.width / 2}
        y={node.height / 2 - 6}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={valueFontSize}
        fontWeight={600}
        fontFamily="JetBrains Mono, Menlo, monospace"
        fill={valueColor}
      >
        {node.displayValue}
      </text>

      {/* Icon at bottom */}
      <foreignObject x={(node.width - 20) / 2} y={node.height / 2 + 4} width={20} height={20}>
        <div
          className="flex h-full w-full items-center justify-center"
          style={{
            animation: isPulsing ? "icon-pulse 0.6s ease-in-out 2" : undefined,
          }}
        >
          {node.id === "IN_PROGRESS" ? (
            <PhoneHappyRobotMorph
              size={16}
              cycle={true}
              cycleInterval={3000}
              variant="flip"
              logoColor="adaptive"
              color={colors.text}
            />
          ) : (
            <Icon className="h-4 w-4" style={{ color: colors.text }} strokeWidth={2} />
          )}
        </div>
      </foreignObject>

      {/* Hover highlight overlay */}
      {isHovered && !isSelected && (
        <rect
          width={node.width}
          height={node.height}
          rx={10}
          ry={10}
          fill={hoverFillColor}
          pointerEvents="none"
        />
      )}
    </g>
  );
});

export default SankeyNode;
