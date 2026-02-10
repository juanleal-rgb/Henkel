import type { BatchStatus, StageData, PipelineBatch } from "../pipeline-types";

// ============================================================================
// View Mode
// ============================================================================

export type SankeyViewMode = "count" | "value";

// ============================================================================
// Layout Configuration
// ============================================================================

export interface SankeyLayoutConfig {
  width: number;
  height: number;
  nodeWidth: number;
  nodeMinHeight: number;
  nodePadding: number;
  horizontalPadding: number;
  verticalPadding: number;
  outcomeSectionHeight: number;
  viewMode: SankeyViewMode;
  isCompressed: boolean;
}

export const DEFAULT_LAYOUT_CONFIG: Omit<SankeyLayoutConfig, "width" | "height"> = {
  nodeWidth: 100,
  nodeMinHeight: 50,
  nodePadding: 12,
  horizontalPadding: 40,
  verticalPadding: 40,
  outcomeSectionHeight: 100,
  viewMode: "count",
  isCompressed: false,
};

// ============================================================================
// Flow Data (Input)
// ============================================================================

export interface SankeyFlowData {
  source: BatchStatus;
  target: BatchStatus;
  batches: PipelineBatch[];
  count: number;
  value: number;
}

export interface SankeyInputData {
  stages: StageData[];
  mainQueueFlows: SankeyFlowData[]; // PENDING → QUEUED → IN_PROGRESS
  callbackFlows: SankeyFlowData[]; // SCHEDULED → IN_PROGRESS
  outcomeFlows: SankeyFlowData[]; // IN_PROGRESS → COMPLETED/FAILED/PARTIAL
  totals: {
    batchCount: number;
    totalValue: number;
    completedCount: number;
    completedValue: number;
    failedCount: number;
    failedValue: number;
  };
}

// ============================================================================
// Layout Output
// ============================================================================

export type QueueType = "main" | "outcome";

export interface SankeyNodeLayout {
  id: BatchStatus;
  nodeKey: string; // Unique key: "PENDING_cancel", "IN_PROGRESS_reschedule", etc.
  queueType: QueueType;
  x: number;
  y: number;
  width: number;
  height: number;
  count: number;
  value: number;
  displayValue: string;
  index: number;
  row?: "main" | "callback" | "outcome"; // Which row the node belongs to
}

export interface SankeyLinkLayout {
  id: string;
  source: BatchStatus;
  target: BatchStatus;
  sourceX: number;
  sourceY0: number;
  sourceY1: number;
  targetX: number;
  targetY0: number;
  targetY1: number;
  width: number;
  count: number;
  value: number;
  path: string;
  flowType?: "main" | "callback" | "outcome";
}

export interface SankeyLayout {
  nodes: SankeyNodeLayout[];
  links: SankeyLinkLayout[];
  outcomeLinks: SankeyLinkLayout[];
  outcomeNodes: SankeyNodeLayout[];
  bounds: {
    width: number;
    height: number;
    mainHeight: number;
    outcomeY: number;
  };
}

// ============================================================================
// Component State
// ============================================================================

export interface SankeyState {
  viewMode: SankeyViewMode;
  selectedNodeKey: string | null; // e.g., "IN_PROGRESS_cancel"
  hoveredNodeKey: string | null;
  hoveredLink: { source: BatchStatus; target: BatchStatus } | null;
}

export const INITIAL_SANKEY_STATE: SankeyState = {
  viewMode: "count",
  selectedNodeKey: null,
  hoveredNodeKey: null,
  hoveredLink: null,
};

// ============================================================================
// Component Props
// ============================================================================

export interface SankeyDiagramProps {
  stages: StageData[];
  selectedNodeKey?: string | null;
  onNodeClick?: (nodeKey: string, stage: BatchStatus, queueType: QueueType) => void;
  /** Callback when a batch is clicked - navigates to supplier page */
  onBatchClick?: (batchId: string, supplierId: string) => void;
  isCompressed?: boolean;
  className?: string;
}

export interface SankeyNodeProps {
  node: SankeyNodeLayout;
  isSelected: boolean;
  isHovered: boolean;
  isDimmed: boolean;
  isCompressed: boolean;
  theme?: "light" | "dark";
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export interface SankeyLinkProps {
  link: SankeyLinkLayout;
  isHovered: boolean;
  isDimmed: boolean;
  isOutcomeFlow?: boolean;
  theme?: "light" | "dark";
  onClick?: () => void;
  onMouseEnter: (event: React.MouseEvent) => void;
  onMouseLeave: () => void;
}

export interface SankeyTooltipProps {
  type: "node" | "link";
  data: SankeyNodeLayout | SankeyLinkLayout;
  position: { x: number; y: number };
  viewMode: SankeyViewMode;
}
