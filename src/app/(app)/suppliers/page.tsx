"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronUp, ChevronDown, Phone, Package, Layers } from "lucide-react";

interface SupplierListItem {
  id: string;
  supplierNumber: string;
  name: string;
  phone: string;
  facility?: string | null;
  isActive: boolean;
  totalValue: number;
  batchStats: {
    total: number;
    pending: number;
    queued: number;
    inProgress: number;
    completed: number;
    failed: number;
  };
  poStats: {
    total: number;
    pending: number;
    queued: number;
    completed: number;
    byActionType: {
      CANCEL: number;
      EXPEDITE: number;
      PUSH_OUT: number;
    };
  };
}

interface SupplierListResponse {
  suppliers: SupplierListItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

type SortField = "name" | "totalValue" | "poCount" | "batchCount";
type SortOrder = "asc" | "desc";

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

function SuppliersTableSkeleton() {
  return (
    <div className="divide-y divide-border-subtle">
      {[...Array(10)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <div className="h-4 w-32 animate-pulse rounded bg-interactive-hover" />
          <div className="h-4 w-48 animate-pulse rounded bg-interactive-hover" />
          <div className="h-4 w-24 animate-pulse rounded bg-interactive-hover" />
          <div className="h-4 w-16 animate-pulse rounded bg-interactive-hover" />
          <div className="ml-auto h-4 w-20 animate-pulse rounded bg-interactive-hover" />
        </div>
      ))}
    </div>
  );
}

export default function SuppliersPage() {
  const router = useRouter();

  // State
  const [data, setData] = useState<SupplierListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("totalValue");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);

  // Fetch suppliers
  const fetchSuppliers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: String(page),
        limit: "50",
        sortBy: sortField,
        sortOrder: sortOrder,
      });

      if (searchQuery) {
        params.set("search", searchQuery);
      }

      const response = await fetch(`/api/suppliers?${params.toString()}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to fetch suppliers");
      }

      setData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [page, sortField, sortOrder, searchQuery]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  // Sort indicator
  const SortIndicator = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortOrder === "desc" ? (
      <ChevronDown className="h-3.5 w-3.5" />
    ) : (
      <ChevronUp className="h-3.5 w-3.5" />
    );
  };

  // Navigate to supplier
  const handleSupplierClick = (supplierId: string) => {
    router.push(`/suppliers/${supplierId}`);
  };

  // Get status indicator
  const getStatusIndicator = (supplier: SupplierListItem) => {
    const actionRequired =
      supplier.batchStats.pending + supplier.batchStats.queued + supplier.batchStats.inProgress;
    if (actionRequired > 0) {
      return (
        <span
          className="flex h-2.5 w-2.5 rounded-full bg-[var(--color-warning)]"
          title="Has pending actions"
        />
      );
    }
    if (supplier.batchStats.failed > 0) {
      return (
        <span
          className="flex h-2.5 w-2.5 rounded-full bg-[var(--color-danger)]"
          title="Has failed batches"
        />
      );
    }
    return (
      <span className="flex h-2.5 w-2.5 rounded-full bg-[var(--color-success)]" title="All clear" />
    );
  };

  return (
    <div className="flex h-full flex-col gap-5 overflow-hidden p-6">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between">
        <div>
          <h1 className="text-[24px] font-semibold text-fg-primary">Suppliers</h1>
          <p className="mt-1 text-[14px] text-fg-muted">
            {data ? `${data.pagination.totalCount} suppliers` : "Loading..."}
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
          <input
            type="text"
            placeholder="Search suppliers..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="h-10 w-72 rounded-lg border border-border-subtle bg-bg-surface pl-10 pr-4 text-[14px] text-fg-primary placeholder:text-fg-muted focus:border-accent-primary focus:outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border-subtle bg-bg-surface">
        {/* Table Header */}
        <div className="flex shrink-0 items-center border-b border-border-subtle bg-bg-elevated px-4 py-3 text-[12px] font-medium uppercase tracking-wider text-fg-muted">
          <div className="w-8" /> {/* Status indicator */}
          <button
            onClick={() => handleSort("name")}
            className="flex w-[280px] items-center gap-1 hover:text-fg-primary"
          >
            Supplier
            <SortIndicator field="name" />
          </button>
          <div className="w-32">Phone</div>
          <button
            onClick={() => handleSort("poCount")}
            className="flex w-24 items-center gap-1 hover:text-fg-primary"
          >
            POs
            <SortIndicator field="poCount" />
          </button>
          <button
            onClick={() => handleSort("batchCount")}
            className="flex w-24 items-center gap-1 hover:text-fg-primary"
          >
            Batches
            <SortIndicator field="batchCount" />
          </button>
          <div className="w-32">Status</div>
          <button
            onClick={() => handleSort("totalValue")}
            className="ml-auto flex items-center gap-1 hover:text-fg-primary"
          >
            Total Value
            <SortIndicator field="totalValue" />
          </button>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <SuppliersTableSkeleton />
          ) : error ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="text-[14px] text-[var(--color-danger)]">{error}</p>
                <button
                  onClick={fetchSuppliers}
                  className="mt-3 rounded-lg bg-interactive-hover px-4 py-2 text-[14px] text-fg-primary hover:bg-interactive-active"
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : data?.suppliers.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-[14px] text-fg-muted">
                {searchQuery ? "No suppliers match your search" : "No suppliers found"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {data?.suppliers.map((supplier) => {
                const actionRequired =
                  supplier.batchStats.pending +
                  supplier.batchStats.queued +
                  supplier.batchStats.inProgress;

                return (
                  <button
                    key={supplier.id}
                    onClick={() => handleSupplierClick(supplier.id)}
                    className="flex w-full items-center px-4 py-3 text-left transition-colors hover:bg-interactive-hover"
                  >
                    {/* Status indicator */}
                    <div className="flex w-8 items-center">{getStatusIndicator(supplier)}</div>

                    {/* Supplier name */}
                    <div className="w-[280px]">
                      <span className="text-[14px] font-medium text-fg-primary">
                        {supplier.name}
                      </span>
                      <span className="ml-2 text-[12px] text-fg-muted">
                        #{supplier.supplierNumber}
                      </span>
                    </div>

                    {/* Phone */}
                    <div className="flex w-32 items-center gap-1.5 text-[13px] text-fg-secondary">
                      <Phone className="h-3.5 w-3.5 text-fg-muted" />
                      {supplier.phone}
                    </div>

                    {/* PO Count */}
                    <div className="flex w-24 items-center gap-1.5 text-[13px] text-fg-secondary">
                      <Package className="h-3.5 w-3.5 text-fg-muted" />
                      {supplier.poStats.total}
                    </div>

                    {/* Batch Count */}
                    <div className="flex w-24 items-center gap-1.5 text-[13px] text-fg-secondary">
                      <Layers className="h-3.5 w-3.5 text-fg-muted" />
                      {supplier.batchStats.total}
                    </div>

                    {/* Status breakdown */}
                    <div className="w-32 text-[12px]">
                      {actionRequired > 0 ? (
                        <span className="text-[var(--color-warning)]">
                          {actionRequired} pending
                        </span>
                      ) : supplier.batchStats.completed > 0 ? (
                        <span className="text-[var(--color-success)]">
                          {supplier.batchStats.completed} completed
                        </span>
                      ) : (
                        <span className="text-fg-muted">-</span>
                      )}
                    </div>

                    {/* Total Value */}
                    <div className="ml-auto font-mono text-[14px] font-medium text-fg-primary">
                      {formatCurrency(supplier.totalValue)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex shrink-0 items-center justify-between border-t border-border-subtle px-4 py-3">
            <span className="text-[12px] text-fg-muted">
              Showing {(page - 1) * data.pagination.limit + 1}-
              {Math.min(page * data.pagination.limit, data.pagination.totalCount)} of{" "}
              {data.pagination.totalCount}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="rounded-lg border border-border-subtle px-3 py-1.5 text-[12px] text-fg-secondary hover:bg-interactive-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-[12px] text-fg-muted">
                Page {page} of {data.pagination.totalPages}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page === data.pagination.totalPages}
                className="rounded-lg border border-border-subtle px-3 py-1.5 text-[12px] text-fg-secondary hover:bg-interactive-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
