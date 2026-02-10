"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SupplierHeader,
  SupplierInsights,
  BatchCard,
  BatchModal,
  type SupplierDetailResponse,
  type SupplierBatch,
  type BatchFilterStatus,
} from "@/components/suppliers";

const STATUS_FILTERS: { value: BatchFilterStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "QUEUED", label: "Queued" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "FAILED", label: "Failed" },
  { value: "PARTIAL", label: "Partial" },
];

function SupplierDetailSkeleton() {
  return (
    <div className="flex h-full flex-col gap-6 overflow-hidden p-6">
      {/* Header skeleton */}
      <div className="h-32 animate-pulse rounded-xl bg-bg-surface" />
      {/* Insights skeleton */}
      <div className="grid grid-cols-6 gap-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-bg-surface" />
        ))}
      </div>
      {/* Batches skeleton */}
      <div className="flex-1 rounded-xl bg-bg-surface p-4">
        <div className="mb-4 h-8 w-32 animate-pulse rounded bg-interactive-hover" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-interactive-hover" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SupplierDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const supplierId = params.id as string;
  const highlightBatchId = searchParams.get("batch");

  // State
  const [data, setData] = useState<SupplierDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<BatchFilterStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBatch, setSelectedBatch] = useState<SupplierBatch | null>(null);

  // Fetch supplier data
  const fetchSupplier = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/suppliers/${supplierId}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to fetch supplier");
      }

      setData(result.data);

      // Auto-open batch modal if batch param is present
      if (highlightBatchId && result.data.batches) {
        const batch = result.data.batches.find((b: SupplierBatch) => b.id === highlightBatchId);
        if (batch) {
          setSelectedBatch(batch);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [supplierId, highlightBatchId]);

  useEffect(() => {
    fetchSupplier();
  }, [fetchSupplier]);

  // Filter batches
  const filteredBatches = useMemo(() => {
    if (!data?.batches) return [];

    return data.batches.filter((batch) => {
      // Status filter
      if (statusFilter !== "all" && batch.status !== statusFilter) {
        return false;
      }

      // Search filter (by batch ID or action types)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesId = batch.id.toLowerCase().includes(query);
        const matchesAction = batch.actionTypes.some((t) => t.toLowerCase().includes(query));
        if (!matchesId && !matchesAction) {
          return false;
        }
      }

      return true;
    });
  }, [data?.batches, statusFilter, searchQuery]);

  // Handle batch click
  const handleBatchClick = (batch: SupplierBatch) => {
    setSelectedBatch(batch);
  };

  // Handle batch updates from modal (SSE status changes)
  const handleBatchUpdate = (
    batchId: string,
    updates: { status?: string; attemptCount?: number }
  ) => {
    setData((prev) => {
      if (!prev) return prev;

      // Find the batch being updated
      const batch = prev.batches.find((b) => b.id === batchId);
      if (!batch) return prev;

      const oldStatus = batch.status;
      const newStatus = (updates.status as SupplierBatch["status"]) ?? oldStatus;
      const poCount = batch.poCount;
      const totalValue = batch.totalValue;

      // Update stats if status changed
      let newStats = prev.stats;
      if (oldStatus !== newStatus) {
        const byStatus = { ...prev.stats.byStatus };

        // Decrease old status count
        if (byStatus[oldStatus]) {
          byStatus[oldStatus] = {
            count: Math.max(0, byStatus[oldStatus].count - poCount),
            totalValue: Math.max(0, byStatus[oldStatus].totalValue - totalValue),
          };
        }

        // Increase new status count
        byStatus[newStatus] = {
          count: (byStatus[newStatus]?.count || 0) + poCount,
          totalValue: (byStatus[newStatus]?.totalValue || 0) + totalValue,
        };

        newStats = { ...prev.stats, byStatus };
      }

      return {
        ...prev,
        stats: newStats,
        batches: prev.batches.map((b) =>
          b.id === batchId ? { ...b, ...updates, status: newStatus } : b
        ),
      };
    });

    // Also update selectedBatch if it's the same
    setSelectedBatch((prev) =>
      prev?.id === batchId
        ? {
            ...prev,
            ...updates,
            status: (updates.status as SupplierBatch["status"]) ?? prev.status,
          }
        : prev
    );
  };

  // Handle individual PO resolution (from SSE during call)
  const handlePOResolved = (poValue: number) => {
    setData((prev) => {
      if (!prev) return prev;

      const byStatus = { ...prev.stats.byStatus };

      // Decrement IN_PROGRESS (the PO was being processed)
      if (byStatus.IN_PROGRESS) {
        byStatus.IN_PROGRESS = {
          count: Math.max(0, byStatus.IN_PROGRESS.count - 1),
          totalValue: Math.max(0, byStatus.IN_PROGRESS.totalValue - poValue),
        };
      }

      // Increment COMPLETED
      byStatus.COMPLETED = {
        count: (byStatus.COMPLETED?.count || 0) + 1,
        totalValue: (byStatus.COMPLETED?.totalValue || 0) + poValue,
      };

      return {
        ...prev,
        stats: { ...prev.stats, byStatus },
      };
    });
  };

  // Clear filters
  const clearFilters = () => {
    setStatusFilter("all");
    setSearchQuery("");
  };

  const hasActiveFilters = statusFilter !== "all" || searchQuery !== "";

  if (isLoading) {
    return <SupplierDetailSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <p className="text-[14px] text-[var(--color-danger)]">{error || "Supplier not found"}</p>
          <button
            onClick={fetchSupplier}
            className="mt-3 rounded-lg bg-interactive-hover px-4 py-2 text-[14px] text-fg-primary hover:bg-interactive-active"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col gap-5 overflow-hidden p-6">
        {/* Header */}
        <SupplierHeader supplier={data.supplier} />

        {/* Insights */}
        <SupplierInsights stats={data.stats} />

        {/* Batches Section */}
        <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border-subtle bg-bg-surface">
          {/* Batches Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-4 py-3">
            <h2 className="text-[16px] font-semibold text-fg-primary">
              Batches ({filteredBatches.length}
              {hasActiveFilters && ` of ${data.batches.length}`})
            </h2>

            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
                <input
                  type="text"
                  placeholder="Search batches..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 w-48 rounded-lg border border-border-subtle bg-bg-base pl-9 pr-3 text-[13px] text-fg-primary placeholder:text-fg-muted focus:border-accent-primary focus:outline-none"
                />
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1 rounded-lg border border-border-subtle bg-bg-base p-1">
                {STATUS_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    onClick={() => setStatusFilter(filter.value)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                      statusFilter === filter.value
                        ? "bg-fg-primary text-bg-base"
                        : "text-fg-muted hover:text-fg-primary"
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              {/* Clear Filters */}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-[12px] text-fg-muted hover:text-fg-primary"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Batches List */}
          <div className="flex-1 overflow-y-auto p-4">
            {filteredBatches.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-[14px] text-fg-muted">
                  {hasActiveFilters ? "No batches match your filters" : "No batches found"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {filteredBatches.map((batch) => (
                  <BatchCard key={batch.id} batch={batch} onClick={() => handleBatchClick(batch)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Batch Modal */}
      {selectedBatch && (
        <BatchModal
          batch={selectedBatch}
          supplierName={data.supplier.name}
          supplierNumber={data.supplier.supplierNumber}
          onClose={() => setSelectedBatch(null)}
          onBatchUpdate={handleBatchUpdate}
          onPOResolved={handlePOResolved}
        />
      )}
    </>
  );
}
