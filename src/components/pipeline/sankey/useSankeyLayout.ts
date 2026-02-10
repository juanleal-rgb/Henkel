"use client";

import { useMemo } from "react";
import type {
  SankeyLayout,
  SankeyNodeLayout,
  SankeyLinkLayout,
  SankeyLayoutConfig,
  SankeyInputData,
  SankeyViewMode,
} from "./sankey-types";
import { DEFAULT_LAYOUT_CONFIG } from "./sankey-types";
import type { BatchStatus, StageData } from "../pipeline-types";
import { generateFlowPath, getDisplayValue, transformToSankeyData } from "./sankey-utils";

interface UseSankeyLayoutOptions {
  width: number;
  height: number;
  viewMode: SankeyViewMode;
  isCompressed?: boolean;
}

/**
 * Calculate Sankey diagram layout from stage data
 * Single-row layout with 4 equal-spaced columns:
 * - Column 1: PENDING
 * - Column 2: QUEUED
 * - Column 3: IN_PROGRESS
 * - Column 4: Outcomes (COMPLETED, FAILED, PARTIAL stacked)
 */
export function useSankeyLayout(
  stages: StageData[],
  options: UseSankeyLayoutOptions
): SankeyLayout {
  const { width, height, viewMode, isCompressed = false } = options;

  return useMemo(() => {
    if (width <= 0 || height <= 0) {
      return {
        nodes: [],
        links: [],
        outcomeLinks: [],
        outcomeNodes: [],
        bounds: { width: 0, height: 0, mainHeight: 0, outcomeY: 0 },
      };
    }

    // Get config based on compression state
    const config: SankeyLayoutConfig = {
      ...DEFAULT_LAYOUT_CONFIG,
      width,
      height,
      viewMode,
      isCompressed,
      nodeWidth: isCompressed ? 80 : 120,
      horizontalPadding: isCompressed ? 60 : 80,
    };

    // Transform data
    const sankeyData = transformToSankeyData(stages);

    // Calculate layout
    return calculateSingleRowLayout(sankeyData, config);
  }, [stages, width, height, viewMode, isCompressed]);
}

/**
 * Single-row layout calculation with 3 equal-spaced columns
 * QUEUED → IN_PROGRESS → Outcomes (COMPLETED/FAILED/PARTIAL)
 */
function calculateSingleRowLayout(data: SankeyInputData, config: SankeyLayoutConfig): SankeyLayout {
  const { width, height, nodeWidth, horizontalPadding, verticalPadding } = config;

  // 3 columns with equal spacing
  const numColumns = 3;
  const availableWidth = width - 2 * horizontalPadding - nodeWidth;
  const columnSpacing = availableWidth / (numColumns - 1);

  // Column X positions
  const columnX = [
    horizontalPadding, // QUEUED
    horizontalPadding + columnSpacing, // IN_PROGRESS
    horizontalPadding + columnSpacing * 2, // Outcomes
  ];

  // Pipeline stages for columns 1-2
  const pipelineStages: BatchStatus[] = ["QUEUED", "IN_PROGRESS"];

  // Outcome stages for column 3
  const outcomeStageIds: BatchStatus[] = ["COMPLETED", "FAILED", "PARTIAL"];

  // Calculate main pipeline nodes (single row, vertically centered)
  const mainNodes = calculateMainNodes(data, config, pipelineStages, height, columnX);

  // Calculate links between main nodes
  const links = calculateMainLinks(mainNodes, nodeWidth);

  // Calculate outcome nodes (column 3, stacked vertically)
  const outcomeNodes = calculateOutcomeNodes(data, config, outcomeStageIds, height, columnX[2]);

  // Calculate outcome links from IN_PROGRESS to outcomes
  const outcomeLinks = calculateOutcomeLinks(mainNodes, outcomeNodes, nodeWidth);

  return {
    nodes: mainNodes,
    links,
    outcomeLinks,
    outcomeNodes,
    bounds: {
      width,
      height,
      mainHeight: height,
      outcomeY: 0,
    },
  };
}

/**
 * Calculate main pipeline nodes (single row)
 */
function calculateMainNodes(
  data: SankeyInputData,
  config: SankeyLayoutConfig,
  stages: BatchStatus[],
  availableHeight: number,
  columnX: number[]
): SankeyNodeLayout[] {
  const { nodeWidth, viewMode, verticalPadding } = config;

  // Node height - larger since we have one row
  const nodeHeight = Math.min(availableHeight - verticalPadding * 2, 100);

  const nodes: SankeyNodeLayout[] = [];

  stages.forEach((stageId, index) => {
    const stageData = data.stages.find((s) => s.stage === stageId);
    const count = stageData?.count || 0;
    const value = stageData?.totalValue || 0;

    // Position at column X, centered vertically
    const x = columnX[index];
    const y = (availableHeight - nodeHeight) / 2;

    // Unique key for this node
    const nodeKey = `${stageId}_main`;

    nodes.push({
      id: stageId,
      nodeKey,
      queueType: "main",
      x,
      y,
      width: nodeWidth,
      height: nodeHeight,
      count,
      value,
      displayValue: getDisplayValue(count, value, viewMode),
      index,
      row: "main",
    });
  });

  return nodes;
}

/**
 * Calculate links between main pipeline nodes
 */
function calculateMainLinks(nodes: SankeyNodeLayout[], nodeWidth: number): SankeyLinkLayout[] {
  const links: SankeyLinkLayout[] = [];

  // Create links between consecutive nodes
  for (let i = 0; i < nodes.length - 1; i++) {
    const sourceNode = nodes[i];
    const targetNode = nodes[i + 1];

    // Flow width - proportional to node height for visual balance
    const flowWidth = Math.min(sourceNode.height * 0.4, 40);

    // Calculate Y positions (centered within node)
    const sourceY0 = sourceNode.y + (sourceNode.height - flowWidth) / 2;
    const sourceY1 = sourceY0 + flowWidth;
    const targetY0 = targetNode.y + (targetNode.height - flowWidth) / 2;
    const targetY1 = targetY0 + flowWidth;

    const link: SankeyLinkLayout = {
      id: `${sourceNode.id}-${targetNode.id}`,
      source: sourceNode.id,
      target: targetNode.id,
      sourceX: sourceNode.x + nodeWidth,
      sourceY0,
      sourceY1,
      targetX: targetNode.x,
      targetY0,
      targetY1,
      width: flowWidth,
      count: sourceNode.count,
      value: sourceNode.value,
      path: "",
      flowType: "main",
    };

    link.path = generateFlowPath(link);
    links.push(link);
  }

  return links;
}

/**
 * Calculate outcome node positions (column 4, stacked vertically)
 */
function calculateOutcomeNodes(
  data: SankeyInputData,
  config: SankeyLayoutConfig,
  stages: BatchStatus[],
  availableHeight: number,
  columnX: number
): SankeyNodeLayout[] {
  const { nodeWidth, viewMode } = config;

  // Outcome nodes
  const outcomeNodeWidth = nodeWidth;
  const outcomeNodeHeight = 70;
  const verticalSpacing = 40;

  // Calculate total height of outcome nodes
  const totalOutcomeHeight =
    stages.length * outcomeNodeHeight + (stages.length - 1) * verticalSpacing;
  const startY = (availableHeight - totalOutcomeHeight) / 2;

  const nodes: SankeyNodeLayout[] = [];

  stages.forEach((stageId, index) => {
    const stageData = data.stages.find((s) => s.stage === stageId);
    const count = stageData?.count || 0;
    const value = stageData?.totalValue || 0;

    const x = columnX;
    const y = startY + index * (outcomeNodeHeight + verticalSpacing);

    nodes.push({
      id: stageId,
      nodeKey: `${stageId}_outcome`,
      queueType: "outcome",
      x,
      y,
      width: outcomeNodeWidth,
      height: outcomeNodeHeight,
      count,
      value,
      displayValue: getDisplayValue(count, value, viewMode),
      index: index + 100,
      row: "outcome",
    });
  });

  return nodes;
}

/**
 * Calculate links from IN_PROGRESS to outcome stages
 */
function calculateOutcomeLinks(
  mainNodes: SankeyNodeLayout[],
  outcomeNodes: SankeyNodeLayout[],
  nodeWidth: number
): SankeyLinkLayout[] {
  const links: SankeyLinkLayout[] = [];

  // Get IN_PROGRESS node
  const inProgressNode = mainNodes.find((n) => n.id === "IN_PROGRESS");
  if (!inProgressNode) return links;

  // Calculate flow widths proportionally based on outcome counts
  const totalOutcomeCount = outcomeNodes.reduce((sum, n) => sum + n.count, 0);
  const baseFlowWidth = 16;

  // Track vertical offset for source connections
  let sourceYOffset = 0;
  const totalFlowHeight = outcomeNodes.length * baseFlowWidth + (outcomeNodes.length - 1) * 4;
  const sourceStartY = inProgressNode.y + (inProgressNode.height - totalFlowHeight) / 2;

  outcomeNodes.forEach((targetNode, index) => {
    const flowWidth = baseFlowWidth;

    const sourceX = inProgressNode.x + nodeWidth;
    const sourceY0 = sourceStartY + sourceYOffset;
    const sourceY1 = sourceY0 + flowWidth;

    // Target centered in outcome node
    const targetY0 = targetNode.y + (targetNode.height - flowWidth) / 2;
    const targetY1 = targetY0 + flowWidth;

    links.push({
      id: `IN_PROGRESS-${targetNode.id}`,
      source: "IN_PROGRESS",
      target: targetNode.id,
      sourceX,
      sourceY0,
      sourceY1,
      targetX: targetNode.x,
      targetY0,
      targetY1,
      width: flowWidth,
      count: targetNode.count,
      value: targetNode.value,
      path: generateFlowPath({
        sourceX,
        sourceY0,
        sourceY1,
        targetX: targetNode.x,
        targetY0,
        targetY1,
      } as SankeyLinkLayout),
      flowType: "outcome",
    });

    sourceYOffset += flowWidth + 4;
  });

  return links;
}

export default useSankeyLayout;
