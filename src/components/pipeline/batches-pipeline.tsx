"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Clock,
  Tally4,
  Phone,
  CheckCircle,
  XCircle,
  AlertTriangle,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  ArrowUpDown,
  Zap,
  Loader2,
} from "lucide-react";
import Image from "next/image";
import { useToast } from "@/components/ui/toaster";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { ExpandableGrid, ExpandableGridItem, type ExpandableGridRef } from "@/components/ui/gsap";
import {
  type BatchStatus,
  type StageData,
  type PipelineBatch,
  type BatchQueryParams,
  type BatchResponse,
  type BatchSortField,
  type SortOrder,
  STAGE_CONFIG,
  stageColors,
} from "./pipeline-types";
import type { QueueType } from "./sankey/sankey-types";
import { SankeyDiagram } from "./sankey";
import { BatchesTableSkeleton } from "./pipeline-skeleton";

// Icons for each stage
const stageIcons: Record<BatchStatus, typeof Phone> = {
  QUEUED: Tally4,
  IN_PROGRESS: Phone,
  COMPLETED: CheckCircle,
  FAILED: XCircle,
  PARTIAL: AlertTriangle,
};

// Mock batch data - will be replaced with API call
function getMockBatches(stage: BatchStatus): PipelineBatch[] {
  const baseCount = Math.floor(Math.random() * 8) + 3;
  const actionTypes: ("CANCEL" | "EXPEDITE" | "PUSH_OUT")[] = ["CANCEL", "EXPEDITE", "PUSH_OUT"];

  return Array.from({ length: baseCount }, (_, i) => {
    const supplierId = `sup-${i}`;
    const createdAt = new Date(Date.now() - Math.random() * 86400000 * 3).toISOString();
    // Random action types for each batch
    const batchActionTypes = actionTypes.filter(() => Math.random() > 0.5);
    if (batchActionTypes.length === 0) batchActionTypes.push("CANCEL");

    return {
      id: `batch-${stage.toLowerCase()}-${i + 1}`,
      supplierId,
      supplier: {
        name: `Supplier ${String.fromCharCode(65 + i)}`,
        supplierNumber: `SUP-${1000 + i}`,
        phone: `+1-555-${String(1000 + i).padStart(4, "0")}`,
      },
      poCount: Math.floor(Math.random() * 10) + 1,
      totalValue: Math.floor(Math.random() * 50000) + 5000,
      actionTypes: batchActionTypes,
      status: stage,
      priority: Math.floor(Math.random() * 100),
      attemptCount: stage === "IN_PROGRESS" ? Math.floor(Math.random() * 3) + 1 : 0,
      maxAttempts: 5,
      createdAt,
      updatedAt: createdAt,
      scheduledFor:
        stage === "QUEUED"
          ? new Date(Date.now() + Math.random() * 3600000).toISOString()
          : undefined,
    };
  });
}

interface BatchesPipelineProps {
  stages: StageData[];
  className?: string;
  /** Callback when a batch row is clicked - navigates to supplier page */
  onBatchClick?: (batchId: string, supplierId: string) => void;
  /** Callback to lazy-load batches for a stage with query params (server-side filtering) */
  onLoadBatches?: (params: BatchQueryParams) => Promise<BatchResponse>;
  /** Active filter label to show in split-view */
  activeFilterLabel?: string;
  /** Whether data is being refreshed */
  isRefreshing?: boolean;
  /** Callback when a call is triggered successfully */
  onCallTriggered?: () => void;
}

/** Supplier override structure from localStorage */
interface SupplierOverride {
  supplierNumber: string;
  name?: string;
  phone: string;
  email: string;
}

const BATCHES_PER_PAGE = 20;

// Action type filter options
const ACTION_TYPE_OPTIONS = [
  { value: "CANCEL", label: "Cancel" },
  { value: "EXPEDITE", label: "Expedite" },
  { value: "PUSH_OUT", label: "Push Out" },
];

// Sort options
const SORT_OPTIONS = [
  { value: "poCount_desc", label: "POs (High to Low)" },
  { value: "poCount_asc", label: "POs (Low to High)" },
  { value: "totalValue_desc", label: "Value (High to Low)" },
  { value: "totalValue_asc", label: "Value (Low to High)" },
  { value: "supplier_asc", label: "Supplier (A-Z)" },
  { value: "supplier_desc", label: "Supplier (Z-A)" },
  { value: "createdAt_desc", label: "Newest First" },
  { value: "createdAt_asc", label: "Oldest First" },
];

export function BatchesPipeline({
  stages,
  className,
  onBatchClick,
  onLoadBatches,
  activeFilterLabel,
  isRefreshing,
  onCallTriggered,
}: BatchesPipelineProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useToast();

  // Initialize from URL params for state persistence
  const initialStage = searchParams.get("stage") as BatchStatus | null;
  const initialNodeKey = initialStage ? `${initialStage}-primary` : null;

  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(initialNodeKey);
  const [selectedStage, setSelectedStage] = useState<BatchStatus | null>(initialStage);
  const [currentPage, setCurrentPage] = useState(1);
  const [stageBatches, setStageBatches] = useState<PipelineBatch[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false); // For filter/sort changes
  const gridRef = useRef<ExpandableGridRef>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Search, filter, and sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [sortValue, setSortValue] = useState("totalValue_desc"); // Default: Value high to low

  // Track which batches are being triggered
  const [triggeringBatches, setTriggeringBatches] = useState<Set<string>>(new Set());

  // Trigger call for a batch
  const handleTriggerCall = useCallback(
    async (e: React.MouseEvent, batch: PipelineBatch) => {
      e.stopPropagation(); // Prevent row click navigation

      if (triggeringBatches.has(batch.id)) return;

      setTriggeringBatches((prev) => new Set(prev).add(batch.id));

      try {
        // Get demo config from localStorage for phone override
        let phoneOverride: string | undefined;
        let emailOverride: string | undefined;

        try {
          const overrides: SupplierOverride[] = JSON.parse(
            localStorage.getItem("demo_supplier_overrides") || "[]"
          );
          const override = overrides.find(
            (s) => s.supplierNumber === batch.supplier.supplierNumber
          );
          if (override) {
            phoneOverride = override.phone || undefined;
            emailOverride = override.email || undefined;
          }
        } catch {
          // Ignore localStorage errors
        }

        const response = await fetch(`/api/batches/${batch.id}/trigger-call`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneOverride, emailOverride }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || data.error || "Failed to trigger call");
        }

        toast.success(`Call started for ${batch.supplier.name}`);

        // Redirect to supplier page with batch ID
        router.push(`/suppliers/${batch.supplierId}?batch=${batch.id}`);
      } catch (error) {
        console.error("Failed to trigger call:", error);
        toast.error(error instanceof Error ? error.message : "Failed to trigger call");
      } finally {
        setTriggeringBatches((prev) => {
          const next = new Set(prev);
          next.delete(batch.id);
          return next;
        });
      }
    },
    [triggeringBatches, toast, router]
  );

  // Parse sort value into field and direction
  const sortConfig = useMemo((): { field: BatchSortField; order: SortOrder } => {
    const [field, order] = sortValue.split("_") as [BatchSortField, SortOrder];
    return { field, order };
  }, [sortValue]);

  // Debounce search input
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Fetch batches with current params
  const fetchBatches = useCallback(
    async (stage: BatchStatus, isInitial = false) => {
      if (!onLoadBatches) {
        // Use mock data
        setStageBatches(getMockBatches(stage));
        setTotalCount(10);
        setTotalPages(1);
        return;
      }

      if (isInitial) {
        setIsLoadingBatches(true);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const params: BatchQueryParams = {
          status: stage,
          page: currentPage,
          limit: BATCHES_PER_PAGE,
          sort: sortConfig.field,
          order: sortConfig.order,
          ...(debouncedSearch && { search: debouncedSearch }),
          ...(actionFilter && { actionType: actionFilter as BatchQueryParams["actionType"] }),
        };

        const response = await onLoadBatches(params);
        setStageBatches(response.batches);
        setTotalCount(response.pagination.totalCount);
        setTotalPages(response.pagination.totalPages);
      } catch (err) {
        console.error("Error loading batches:", err);
        setStageBatches([]);
        setTotalCount(0);
        setTotalPages(0);
      } finally {
        setIsLoadingBatches(false);
        setIsLoadingMore(false);
      }
    },
    [onLoadBatches, currentPage, sortConfig, debouncedSearch, actionFilter]
  );

  // Update URL params without full navigation
  const updateURLState = useCallback(
    (stage: BatchStatus | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (stage) {
        params.set("stage", stage);
      } else {
        params.delete("stage");
      }
      router.replace(`/dashboard?${params.toString()}`, { scroll: false });
    },
    [searchParams, router]
  );

  // Handle node click from Sankey diagram
  const handleNodeClick = useCallback(
    async (nodeKey: string, stage: BatchStatus, _queueType: QueueType) => {
      // Capture state before changing for GSAP Flip animation
      gridRef.current?.captureState();

      if (selectedNodeKey === nodeKey) {
        // Deselect
        setSelectedNodeKey(null);
        setSelectedStage(null);
        setStageBatches([]);
        setTotalCount(0);
        setTotalPages(0);
        updateURLState(null);
      } else {
        // Select new node - reset filters
        setSelectedNodeKey(nodeKey);
        setSelectedStage(stage);
        setCurrentPage(1);
        setSearchQuery("");
        setDebouncedSearch("");
        setActionFilter("");
        setSortValue("totalValue_desc");
        updateURLState(stage);
      }
    },
    [selectedNodeKey, updateURLState]
  );

  // Fetch batches when stage is selected or params change
  useEffect(() => {
    if (selectedStage) {
      fetchBatches(selectedStage, stageBatches.length === 0);
    }
  }, [selectedStage, currentPage, sortConfig, debouncedSearch, actionFilter]);

  // Close split view
  const handleCloseSplitView = useCallback(() => {
    gridRef.current?.captureState();
    setSelectedNodeKey(null);
    setSelectedStage(null);
    setStageBatches([]);
    setTotalCount(0);
    setTotalPages(0);
    updateURLState(null);
  }, [updateURLState]);

  // Reset page when filters change (but not on initial load)
  useEffect(() => {
    if (selectedStage && currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [debouncedSearch, actionFilter, sortValue]);

  // Close split view on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedNodeKey) {
        handleCloseSplitView();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedNodeKey, handleCloseSplitView]);

  const isExpanded = selectedNodeKey !== null;

  // Pagination handlers (server-side pagination)
  const handlePrevPage = useCallback(() => {
    setCurrentPage((p) => Math.max(1, p - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage((p) => Math.min(totalPages, p + 1));
  }, [totalPages]);

  // Get display info for selected stage
  const stageConfig = selectedStage ? STAGE_CONFIG[selectedStage] : null;
  const stageColor = selectedStage ? stageColors[selectedStage] : null;
  const StageIcon = selectedStage ? stageIcons[selectedStage] : null;

  // Compute active filter label
  const computedFilterLabel = useMemo(() => {
    const parts: string[] = [];
    if (debouncedSearch.trim()) parts.push(`"${debouncedSearch.trim()}"`);
    if (actionFilter) {
      const actionLabel = ACTION_TYPE_OPTIONS.find((o) => o.value === actionFilter)?.label;
      if (actionLabel) parts.push(actionLabel);
    }
    return parts.length > 0 ? parts.join(" + ") : activeFilterLabel;
  }, [debouncedSearch, actionFilter, activeFilterLabel]);

  // Check if any filters are active
  const hasActiveFilters = debouncedSearch.trim() !== "" || actionFilter !== "";

  // Get count from selected stage for display
  const selectedStageData = stages.find((s) => s.stage === selectedStage);
  const totalStageBatches = selectedStageData?.count || totalCount;

  return (
    <div className={cn("relative flex h-full flex-col", className)}>
      {/* Close button when split view is active */}
      {selectedNodeKey && (
        <button
          onClick={handleCloseSplitView}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-interactive-hover hover:text-fg-primary"
          title="Close view (Esc)"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {/* Main Grid - Split View with GSAP Flip animation */}
      <ExpandableGrid
        ref={gridRef}
        isExpanded={isExpanded}
        columns={12}
        gap={16}
        className="flex-1"
      >
        {/* Sankey Diagram */}
        <ExpandableGridItem collapsedSpan={12} expandedSpan={5} className="min-h-0">
          <div className="relative h-full overflow-hidden rounded-xl border border-border-subtle bg-glass-bg">
            <SankeyDiagram
              stages={stages}
              selectedNodeKey={selectedNodeKey}
              onNodeClick={handleNodeClick}
              onBatchClick={onBatchClick}
              isCompressed={isExpanded}
              className="h-full"
            />
          </div>
        </ExpandableGridItem>

        {/* Batches Table (expanded view) */}
        <ExpandableGridItem collapsedSpan={0} expandedSpan={7} className="min-h-0">
          {selectedNodeKey && isLoadingBatches ? (
            <BatchesTableSkeleton
              rows={8}
              stage={{
                icon: stageIcons[selectedStage!],
                label: stageConfig?.label || "",
                colors: stageColor || stageColors.QUEUED,
              }}
            />
          ) : (
            selectedNodeKey &&
            stageConfig &&
            stageColor &&
            StageIcon && (
              <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border-subtle bg-glass-bg">
                {/* Table Header */}
                <div className="flex shrink-0 flex-col gap-3 border-b border-border-subtle px-4 py-3">
                  {/* Title row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-lg"
                        style={{ backgroundColor: stageColor.fill }}
                      >
                        <StageIcon className="h-4 w-4" style={{ color: stageColor.text }} />
                      </div>
                      <div>
                        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-fg-primary">
                          {stageConfig.label}
                          {computedFilterLabel && (
                            <span className="flex items-center gap-1 rounded bg-[var(--color-warning-muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-warning)]">
                              <Filter className="h-2.5 w-2.5" />
                              {computedFilterLabel}
                            </span>
                          )}
                        </h3>
                        <p className="text-[12px] text-fg-muted">
                          {hasActiveFilters
                            ? `${totalCount} of ${totalStageBatches} batches`
                            : `${totalCount} batches`}
                          {isLoadingMore && (
                            <Loader2 className="ml-1.5 inline h-3 w-3 animate-spin text-fg-muted" />
                          )}
                        </p>
                      </div>
                    </div>
                    {/* Clear filters button */}
                    {hasActiveFilters && (
                      <button
                        onClick={() => {
                          setSearchQuery("");
                          setDebouncedSearch("");
                          setActionFilter("");
                        }}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-fg-muted transition-colors hover:bg-interactive-hover hover:text-fg-primary"
                      >
                        <X className="h-3 w-3" />
                        Clear filters
                      </button>
                    )}
                  </div>

                  {/* Search and filters row */}
                  <div className="flex items-center gap-2">
                    {/* Search input */}
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search supplier..."
                        className="w-full rounded-lg border border-border-subtle bg-glass-bg py-1.5 pl-8 pr-3 text-[12px] text-fg-primary placeholder:text-fg-muted focus:border-white/30 focus:outline-none"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-fg-muted hover:bg-interactive-hover hover:text-fg-primary"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    {/* Action filter */}
                    <FilterDropdown
                      value={actionFilter}
                      onChange={setActionFilter}
                      options={ACTION_TYPE_OPTIONS}
                      label="Action"
                      icon={Zap}
                      align="right"
                    />

                    {/* Sort dropdown */}
                    <FilterDropdown
                      value={sortValue}
                      onChange={setSortValue}
                      options={SORT_OPTIONS}
                      label="Sort"
                      icon={ArrowUpDown}
                      align="right"
                    />
                  </div>
                </div>

                {/* Table Content */}
                <div className="min-h-0 flex-1 overflow-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 z-10 bg-bg-base">
                      <tr className="border-b border-border-subtle">
                        <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-fg-muted">
                          Supplier
                        </th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-fg-muted">
                          POs
                        </th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-fg-muted">
                          Value
                        </th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-fg-muted">
                          Action
                        </th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-fg-muted">
                          {selectedStage === "QUEUED"
                            ? "Scheduled"
                            : selectedStage === "IN_PROGRESS"
                              ? "Attempt"
                              : "Created"}
                        </th>
                        {selectedStage === "QUEUED" && <th className="w-[140px] px-4 py-2.5"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {stageBatches.map((batch, index) => (
                        <tr
                          key={batch.id}
                          onClick={() => onBatchClick?.(batch.id, batch.supplierId)}
                          className={cn(
                            "cursor-pointer border-b border-border-subtle transition-all hover:bg-white/[0.06]",
                            index % 2 === 0 ? "bg-transparent" : "bg-white/[0.02]"
                          )}
                        >
                          <td className="px-4 py-3">
                            <div>
                              <span className="text-[14px] font-medium text-fg-primary">
                                {batch.supplier.name}
                              </span>
                              <p className="text-[12px] text-fg-muted">
                                #{batch.supplier.supplierNumber}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-[13px] text-fg-secondary">
                              {batch.poCount}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-[13px] text-fg-primary">
                              ${batch.totalValue.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {batch.actionTypes.map((action) => (
                                <span
                                  key={action}
                                  className={cn(
                                    "inline-flex items-center rounded-md px-2.5 py-1 text-[12px] font-medium",
                                    action === "CANCEL"
                                      ? "bg-danger/20 text-danger"
                                      : action === "EXPEDITE"
                                        ? "bg-warning/20 text-warning"
                                        : "bg-info/20 text-info"
                                  )}
                                >
                                  {action === "CANCEL"
                                    ? "Cancel"
                                    : action === "EXPEDITE"
                                      ? "Expedite"
                                      : "Push Out"}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {selectedStage === "QUEUED" && batch.scheduledFor ? (
                              <span className="flex items-center gap-1.5 text-[12px] text-fg-muted">
                                <Clock className="h-3 w-3" />
                                {new Date(batch.scheduledFor).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            ) : selectedStage === "IN_PROGRESS" ? (
                              <div className="flex items-center gap-1.5">
                                <Phone className="h-3 w-3 animate-pulse text-info" />
                                <span className="text-[12px] text-fg-muted">
                                  Attempt {batch.attemptCount || 1}/{batch.maxAttempts}
                                </span>
                              </div>
                            ) : (
                              <span className="font-mono text-[12px] text-fg-muted">
                                {new Date(batch.createdAt).toLocaleDateString()}
                              </span>
                            )}
                          </td>
                          {selectedStage === "QUEUED" && (
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={(e) => handleTriggerCall(e, batch)}
                                disabled={triggeringBatches.has(batch.id)}
                                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border-subtle bg-bg-base px-3 py-1.5 text-[12px] font-medium text-fg-secondary transition-all hover:bg-interactive-hover hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {triggeringBatches.has(batch.id) ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Starting...
                                  </>
                                ) : (
                                  <>
                                    <Image
                                      src="/happyrobot/Footer-logo-white.svg"
                                      alt=""
                                      width={14}
                                      height={14}
                                      className="h-3.5 w-3.5 object-contain opacity-80"
                                    />
                                    Start Call
                                  </>
                                )}
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                      {stageBatches.length === 0 && (
                        <tr>
                          <td
                            colSpan={selectedStage === "QUEUED" ? 6 : 5}
                            className="px-4 py-12 text-center"
                          >
                            {hasActiveFilters ? (
                              <div className="flex flex-col items-center gap-2">
                                <Filter className="h-8 w-8 text-fg-disabled" />
                                <p className="text-[14px] text-fg-muted">
                                  No batches match your filters
                                </p>
                                {computedFilterLabel && (
                                  <p className="text-[12px] text-fg-disabled">
                                    Filter: {computedFilterLabel}
                                  </p>
                                )}
                                <button
                                  onClick={() => {
                                    setSearchQuery("");
                                    setDebouncedSearch("");
                                    setActionFilter("");
                                  }}
                                  className="mt-2 rounded-lg bg-interactive-hover px-3 py-1.5 text-[12px] font-medium text-fg-secondary transition-colors hover:bg-interactive-active hover:text-fg-primary"
                                >
                                  Clear filters
                                </button>
                              </div>
                            ) : (
                              <p className="text-fg-muted">No batches in this stage</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 0 && (
                  <div className="flex shrink-0 items-center justify-between border-t border-border-subtle px-4 py-3">
                    <p className="text-[12px] text-fg-muted">
                      Showing {Math.min((currentPage - 1) * BATCHES_PER_PAGE + 1, totalCount)}-
                      {Math.min(currentPage * BATCHES_PER_PAGE, totalCount)} of {totalCount}
                      {hasActiveFilters && (
                        <span className="ml-1 text-fg-disabled">(filtered)</span>
                      )}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handlePrevPage}
                        disabled={currentPage <= 1 || isLoadingMore}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-all hover:bg-interactive-hover hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="min-w-[60px] text-center text-[12px] text-fg-muted">
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        onClick={handleNextPage}
                        disabled={currentPage >= totalPages || isLoadingMore}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-all hover:bg-interactive-hover hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          )}
        </ExpandableGridItem>
      </ExpandableGrid>
    </div>
  );
}
