"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import {
  BatchesPipeline,
  EmptyPipelineState,
  type StageData,
  type BatchStatus,
  type BatchQueryParams,
  type BatchResponse,
  STAGE_CONFIG,
  PIPELINE_STAGES,
  TERMINAL_STAGES,
} from "@/components/pipeline";
import {
  generateKPIsFromStats,
  kpiColorClasses,
  type StatsResponse,
} from "@/components/pipeline/kpi-utils";
import { PipelinePageSkeleton, KPICardSkeleton } from "@/components/pipeline/pipeline-skeleton";
import { TrendingUp, TrendingDown } from "lucide-react";
import { UploadFAB } from "@/components/upload/UploadFAB";
import { UploadModal } from "@/components/upload/UploadModal";
import { useUIStore } from "@/stores/ui-store";
import { usePipelineEvents } from "@/hooks/use-pipeline-events";

// Transform stats response to StageData for the pipeline
function transformStatsToStageData(stats: StatsResponse): StageData[] {
  const stages: StageData[] = [];

  // Main pipeline stages
  for (const stage of PIPELINE_STAGES) {
    const stageStats = stats.stages[stage];
    stages.push({
      stage,
      config: STAGE_CONFIG[stage],
      count: stageStats?.count || 0,
      totalValue: stageStats?.totalValue || 0,
      batches: [], // Empty - lazy-load on stage click
    });
  }

  // Terminal stages (FAILED, PARTIAL)
  for (const stage of TERMINAL_STAGES) {
    const stageStats = stats.stages[stage];
    stages.push({
      stage,
      config: STAGE_CONFIG[stage],
      count: stageStats?.count || 0,
      totalValue: stageStats?.totalValue || 0,
      batches: [],
    });
  }

  return stages;
}

export default function DashboardPage() {
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement>(null);
  const hasAnimatedEntranceRef = useRef(false);

  // Data state
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [pipelineStages, setPipelineStages] = useState<StageData[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasEmpty, setWasEmpty] = useState(false);

  // Track active uploads for auto-refresh
  const activeUploads = useUIStore((state) => state.activeUploads);
  const prevCompletedCount = useRef(0);

  // SSE subscription for real-time pipeline updates
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check if there's an active upload
  const hasActiveUpload = activeUploads.some(
    (u) => u.status === "uploading" || u.status === "processing"
  );

  // Determine if we have data
  const hasData = stats && stats.totals.batches > 0;

  // Fetch stats data from API
  const fetchStats = useCallback(
    async (animate = false) => {
      try {
        if (!isInitialLoad) {
          setIsRefreshing(true);
        }
        setError(null);

        const response = await fetch("/api/batches/stats");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch stats");
        }

        const fetchedStats: StatsResponse = data.data;
        const previouslyEmpty = !stats || stats.totals.batches === 0;
        const nowHasData = fetchedStats.totals.batches > 0;

        setStats(fetchedStats);
        setPipelineStages(transformStatsToStageData(fetchedStats));

        // Track if we transitioned from empty to having data
        if (animate && previouslyEmpty && nowHasData) {
          setWasEmpty(true);
        }
      } catch (err) {
        // On error, show empty state (API might not exist yet)
        const emptyStats: StatsResponse = {
          stages: {
            PENDING: { count: 0, totalValue: 0 },
            QUEUED: { count: 0, totalValue: 0 },
            IN_PROGRESS: { count: 0, totalValue: 0 },
            COMPLETED: { count: 0, totalValue: 0 },
            FAILED: { count: 0, totalValue: 0 },
            PARTIAL: { count: 0, totalValue: 0 },
          },
          totals: { batches: 0, totalValue: 0, totalPOs: 0, uniqueSuppliers: 0 },
          actionTypes: {
            CANCEL: { count: 0, totalValue: 0 },
            EXPEDITE: { count: 0, totalValue: 0 },
            PUSH_OUT: { count: 0, totalValue: 0 },
          },
        };
        setStats(emptyStats);
        setPipelineStages(transformStatsToStageData(emptyStats));
        // Don't show error for missing API - just show empty state
        if (err instanceof Error && !err.message.includes("Failed to fetch")) {
          setError(err.message);
        }
      } finally {
        setIsInitialLoad(false);
        setIsRefreshing(false);
      }
    },
    [isInitialLoad, stats]
  );

  useEffect(() => {
    fetchStats();
  }, []);

  // Debounced refresh to batch rapid SSE events
  const debouncedRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }
    refreshTimeoutRef.current = setTimeout(() => {
      fetchStats(true);
    }, 300); // Debounce 300ms to batch multiple events
  }, [fetchStats]);

  // Subscribe to pipeline events for real-time updates
  usePipelineEvents({
    enabled: !isInitialLoad,
    onBatchQueued: debouncedRefresh,
    onBatchStarted: debouncedRefresh,
    onBatchCompleted: debouncedRefresh,
  });

  // Auto-refresh when an upload completes
  useEffect(() => {
    const completedCount = activeUploads.filter((u) => u.status === "complete").length;

    if (completedCount > prevCompletedCount.current) {
      // An upload just completed, refresh stats with animation
      fetchStats(true);
    }

    prevCompletedCount.current = completedCount;
  }, [activeUploads, fetchStats]);

  // GSAP entrance animation when transitioning from empty to having data
  useEffect(() => {
    if (!contentRef.current || !wasEmpty || !hasData || hasAnimatedEntranceRef.current) return;

    hasAnimatedEntranceRef.current = true;
    setWasEmpty(false);

    const ctx = gsap.context(() => {
      const tl = gsap.timeline();

      // Set initial states
      gsap.set(".kpi-card", { y: 30, opacity: 0 });
      gsap.set(".pipeline-header", { y: 20, opacity: 0 });
      gsap.set(".pipeline-container", { y: 30, opacity: 0, scale: 0.98 });

      // Animate in sequence
      tl.to(".kpi-card", {
        y: 0,
        opacity: 1,
        duration: 0.5,
        stagger: 0.1,
        ease: "back.out(1.2)",
      })
        .to(
          ".pipeline-header",
          {
            y: 0,
            opacity: 1,
            duration: 0.4,
            ease: "power2.out",
          },
          "-=0.3"
        )
        .to(
          ".pipeline-container",
          {
            y: 0,
            opacity: 1,
            scale: 1,
            duration: 0.5,
            ease: "power2.out",
          },
          "-=0.2"
        );
    }, contentRef);

    return () => ctx.revert();
  }, [wasEmpty, hasData]);

  // Generate KPIs from stats
  const kpis = useMemo(() => (stats ? generateKPIsFromStats(stats) : []), [stats]);

  const handleBatchClick = (batchId: string, supplierId: string) => {
    // Navigate to supplier page with batch query param to auto-expand that batch
    router.push(`/suppliers/${supplierId}?batch=${batchId}`);
  };

  // Load batches for a specific stage from the API (with server-side filtering)
  const handleLoadBatches = useCallback(
    async (params: BatchQueryParams): Promise<BatchResponse> => {
      try {
        const searchParams = new URLSearchParams({
          status: params.status,
          page: String(params.page || 1),
          limit: String(params.limit || 20),
          sort: params.sort || "totalValue",
          order: params.order || "desc",
        });

        if (params.search) {
          searchParams.set("search", params.search);
        }
        if (params.actionType) {
          searchParams.set("actionType", params.actionType);
        }

        const response = await fetch(`/api/batches?${searchParams.toString()}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch batches");
        }

        return data.data;
      } catch (err) {
        console.error("Error loading batches:", err);
        return { batches: [], pagination: { page: 1, limit: 20, totalCount: 0, totalPages: 0 } };
      }
    },
    []
  );

  // Show full page skeleton only on initial load
  if (isInitialLoad) {
    return (
      <>
        <PipelinePageSkeleton />
        <UploadFAB hidden />
        <UploadModal onUploadComplete={() => fetchStats(true)} />
      </>
    );
  }

  // Show empty state only when no data AND no active upload
  // During uploads, show the pipeline so users can see batches flow in via SSE
  if (!hasData && !hasActiveUpload) {
    return (
      <>
        <main className="flex h-full w-full flex-col overflow-hidden bg-bg-base">
          <EmptyPipelineState />
        </main>
        <UploadFAB hidden />
        <UploadModal onUploadComplete={() => fetchStats(true)} />
      </>
    );
  }

  return (
    <>
      <main className="flex h-full w-full max-w-full flex-col overflow-hidden bg-bg-base">
        <div
          ref={contentRef}
          className="flex min-h-0 w-full max-w-full flex-1 flex-col gap-5 overflow-hidden p-6"
        >
          {/* Layer 1: KPI Row */}
          <section
            className={`grid w-full min-w-0 max-w-full shrink-0 grid-cols-4 gap-4 transition-opacity duration-200 ${isRefreshing ? "opacity-60" : ""}`}
          >
            {kpis.length === 0
              ? [0, 1, 2, 3].map((i) => <KPICardSkeleton key={i} />)
              : kpis.map((kpi) => {
                  const Icon = kpi.icon;
                  const colors = kpiColorClasses[kpi.color];
                  const isUp = kpi.trend?.direction === "up";
                  return (
                    <div
                      key={kpi.id}
                      className="kpi-card linear-metric-card group"
                      title={kpi.description}
                    >
                      {/* Background icon */}
                      <Icon
                        className="absolute -right-2 -top-2 h-16 w-16 text-fg-disabled transition-all group-hover:text-fg-muted"
                        strokeWidth={1}
                      />

                      {/* Content */}
                      <div className="relative z-10 flex flex-col gap-2">
                        <span className="linear-section-header">{kpi.label}</span>
                        <div className="flex items-baseline gap-2">
                          <span className={`font-mono text-[28px] font-semibold ${colors.accent}`}>
                            {kpi.displayValue}
                          </span>
                          {kpi.trend && (
                            <span
                              className={`flex items-center gap-0.5 text-[12px] font-medium ${
                                isUp ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"
                              }`}
                            >
                              {isUp ? (
                                <TrendingUp className="h-3 w-3" />
                              ) : (
                                <TrendingDown className="h-3 w-3" />
                              )}
                              {kpi.trend.value}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
          </section>

          {/* Layer 2: Control Bar */}
          <section className="pipeline-header flex w-full min-w-0 max-w-full shrink-0 items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-[18px] font-semibold text-fg-primary">Queue Pipeline</h2>
              <div className="flex items-center gap-2 rounded-full bg-[var(--color-success-muted)] px-3 py-1">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-success)]" />
                <span className="text-[12px] font-medium text-[var(--color-success)]">Live</span>
              </div>
            </div>
          </section>

          {/* Layer 3: Pipeline with Split-View Table */}
          <section className="pipeline-container flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col">
            {error ? (
              <div className="bg-card-bg flex flex-1 items-center justify-center rounded-xl border border-border-subtle">
                <div className="text-center">
                  <p className="text-[14px] text-[var(--color-danger)]">{error}</p>
                  <button onClick={() => fetchStats()} className="linear-btn-secondary mt-3">
                    Retry
                  </button>
                </div>
              </div>
            ) : (
              <BatchesPipeline
                stages={pipelineStages}
                onBatchClick={handleBatchClick}
                onLoadBatches={handleLoadBatches}
                isRefreshing={isRefreshing}
                className="h-full min-h-0 flex-1"
              />
            )}
          </section>
        </div>
      </main>

      <UploadFAB hidden={false} />
      <UploadModal onUploadComplete={() => fetchStats(true)} />
    </>
  );
}
