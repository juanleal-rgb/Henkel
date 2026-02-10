"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type {
  SankeyDiagramProps,
  SankeyState,
  SankeyViewMode,
  SankeyLinkLayout,
  QueueType,
} from "./sankey-types";
import { INITIAL_SANKEY_STATE } from "./sankey-types";
import { useSankeyLayout } from "./useSankeyLayout";
import { useSankeyAnimation } from "./useSankeyAnimation";
import { SankeyNode } from "./SankeyNode";
import { SankeyLink } from "./SankeyLink";
import type { BatchStatus } from "../pipeline-types";
import { cn } from "@/lib/utils";
import { Hash, DollarSign } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

/**
 * SankeyDiagram - Main Sankey visualization for batch pipeline
 * Shows flow of batches through processing stages:
 * - Main row: PENDING → QUEUED → IN_PROGRESS
 * - Outcome row: COMPLETED, FAILED, PARTIAL
 */
export function SankeyDiagram({
  stages,
  selectedNodeKey,
  onNodeClick,
  onBatchClick: _onBatchClick,
  isCompressed = false,
  className,
}: SankeyDiagramProps) {
  // Theme
  const { theme } = useTheme();

  // Container dimensions
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Sankey state
  const [state, setState] = useState<SankeyState>({
    ...INITIAL_SANKEY_STATE,
    selectedNodeKey: selectedNodeKey || null,
  });

  // Update selected node when prop changes
  useEffect(() => {
    setState((prev) => ({ ...prev, selectedNodeKey: selectedNodeKey || null }));
  }, [selectedNodeKey]);

  // Observe container size
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Calculate layout
  const layout = useSankeyLayout(stages, {
    width: dimensions.width,
    height: dimensions.height,
    viewMode: state.viewMode,
    isCompressed,
  });

  // Animation
  const { containerRef: svgGroupRef, triggerViewModeTransition } = useSankeyAnimation({
    layout,
    viewMode: state.viewMode,
    enabled: true,
  });

  // Handlers
  const handleNodeClick = useCallback(
    (nodeKey: string, stage: BatchStatus, queueType: QueueType) => {
      if (onNodeClick) {
        onNodeClick(nodeKey, stage, queueType);
      }
    },
    [onNodeClick]
  );

  const handleNodeHover = useCallback((nodeKey: string | null) => {
    setState((prev) => ({ ...prev, hoveredNodeKey: nodeKey }));
  }, []);

  const handleLinkHover = useCallback(
    (link: { source: BatchStatus; target: BatchStatus } | null) => {
      setState((prev) => ({ ...prev, hoveredLink: link }));
    },
    []
  );

  // Flow hover handlers
  const handleFlowEnter = useCallback(
    (link: SankeyLinkLayout) => {
      handleLinkHover({ source: link.source, target: link.target });
    },
    [handleLinkHover]
  );

  const handleFlowLeave = useCallback(() => {
    handleLinkHover(null);
  }, [handleLinkHover]);

  const handleViewModeChange = useCallback(
    (mode: SankeyViewMode) => {
      setState((prev) => ({ ...prev, viewMode: mode }));
      triggerViewModeTransition(mode);
    },
    [triggerViewModeTransition]
  );

  // Determine dimmed state for elements
  const isDimmed = useCallback(
    (nodeKey: string, nodeId: BatchStatus): boolean => {
      // If a node is hovered, dim others
      if (state.hoveredNodeKey && state.hoveredNodeKey !== nodeKey) {
        return true;
      }
      // If a link is hovered, dim nodes not connected to it
      if (state.hoveredLink) {
        return nodeId !== state.hoveredLink.source && nodeId !== state.hoveredLink.target;
      }
      return false;
    },
    [state.hoveredNodeKey, state.hoveredLink]
  );

  const isLinkDimmed = useCallback(
    (source: BatchStatus, target: BatchStatus): boolean => {
      // If a node is hovered (by key), we need to check if any node with that stage is connected
      // For now, dim links not connected to the hovered node's stage
      if (state.hoveredNodeKey) {
        // Extract the stage from the nodeKey (e.g., "IN_PROGRESS_cancel" -> "IN_PROGRESS")
        const hoveredStage = state.hoveredNodeKey.split("_")[0] as BatchStatus;
        return hoveredStage !== source && hoveredStage !== target;
      }
      // If a link is hovered, dim other links
      if (state.hoveredLink) {
        return state.hoveredLink.source !== source || state.hoveredLink.target !== target;
      }
      return false;
    },
    [state.hoveredNodeKey, state.hoveredLink]
  );

  // Don't render until we have dimensions
  if (dimensions.width === 0 || dimensions.height === 0) {
    return <div ref={containerRef} className={cn("h-full w-full", className)} />;
  }

  return (
    <div ref={containerRef} className={cn("relative h-full w-full", className)}>
      {/* View mode toggle */}
      <div className="absolute right-4 top-4 z-10 flex gap-0.5 rounded-lg border border-border-subtle bg-glass-bg p-0.5 backdrop-blur-sm">
        <button
          onClick={() => handleViewModeChange("count")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-all",
            state.viewMode === "count"
              ? "bg-interactive-active text-fg-primary"
              : "text-fg-muted hover:text-fg-secondary"
          )}
        >
          <Hash className="h-3 w-3" />
          <span>Batches</span>
        </button>
        <button
          onClick={() => handleViewModeChange("value")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-all",
            state.viewMode === "value"
              ? "bg-interactive-active text-fg-primary"
              : "text-fg-muted hover:text-fg-secondary"
          )}
        >
          <DollarSign className="h-3 w-3" />
          <span>Value</span>
        </button>
      </div>

      {/* SVG Sankey diagram */}
      <svg width={dimensions.width} height={dimensions.height} className="overflow-visible">
        {/* Defs for shared filters */}
        <defs>
          <filter id="sankey-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Animated container group */}
        <g ref={svgGroupRef}>
          {/* Outcome flow links (render first, below main flows) */}
          {layout.outcomeLinks.map((link) => {
            // Check if hovered node is connected to this link
            const hoveredStage = state.hoveredNodeKey?.split("_")[0] as BatchStatus | undefined;
            const isNodeHovered = hoveredStage === link.source || hoveredStage === link.target;
            return (
              <SankeyLink
                key={link.id}
                link={link}
                isHovered={
                  isNodeHovered ||
                  (state.hoveredLink?.source === link.source &&
                    state.hoveredLink?.target === link.target)
                }
                isDimmed={isLinkDimmed(link.source, link.target)}
                isOutcomeFlow={true}
                theme={theme}
                onMouseEnter={() => handleFlowEnter(link)}
                onMouseLeave={handleFlowLeave}
              />
            );
          })}

          {/* Main flow links */}
          {layout.links.map((link) => (
            <SankeyLink
              key={link.id}
              link={link}
              isHovered={
                state.hoveredLink?.source === link.source &&
                state.hoveredLink?.target === link.target
              }
              isDimmed={isLinkDimmed(link.source, link.target)}
              theme={theme}
              onMouseEnter={() => handleFlowEnter(link)}
              onMouseLeave={handleFlowLeave}
            />
          ))}

          {/* Main stage nodes */}
          {layout.nodes.map((node) => (
            <SankeyNode
              key={node.nodeKey}
              node={node}
              isSelected={state.selectedNodeKey === node.nodeKey}
              isHovered={state.hoveredNodeKey === node.nodeKey}
              isDimmed={isDimmed(node.nodeKey, node.id)}
              isCompressed={isCompressed}
              theme={theme}
              onClick={() => handleNodeClick(node.nodeKey, node.id, node.queueType)}
              onMouseEnter={() => handleNodeHover(node.nodeKey)}
              onMouseLeave={() => handleNodeHover(null)}
            />
          ))}

          {/* Outcome nodes (COMPLETED, FAILED, PARTIAL) */}
          {layout.outcomeNodes.map((node) => (
            <SankeyNode
              key={node.nodeKey}
              node={node}
              isSelected={state.selectedNodeKey === node.nodeKey}
              isHovered={state.hoveredNodeKey === node.nodeKey}
              isDimmed={isDimmed(node.nodeKey, node.id)}
              isCompressed={isCompressed}
              theme={theme}
              onClick={() => handleNodeClick(node.nodeKey, node.id, node.queueType)}
              onMouseEnter={() => handleNodeHover(node.nodeKey)}
              onMouseLeave={() => handleNodeHover(null)}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

export default SankeyDiagram;
