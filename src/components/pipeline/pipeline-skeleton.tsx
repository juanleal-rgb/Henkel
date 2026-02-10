"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import HappyRobotLogo from "@public/happyrobot/Footer-logo-white.svg";
import type { LucideIcon } from "lucide-react";

// Dynamic loading messages
const LOADING_MESSAGES = [
  "Loading batches...",
  "Fetching batches...",
  "Getting batches...",
  "Gathering batches...",
  "Collecting batches...",
];

/**
 * PipelinePageSkeleton - Clean minimal skeleton for initial load
 */
export function PipelinePageSkeleton() {
  return (
    <main className="flex h-full w-full flex-col gap-6 bg-bg-base p-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <KPICardSkeleton key={i} />
        ))}
      </div>

      {/* Pipeline area */}
      <div className="flex-1 rounded-xl border border-border-subtle bg-glass-bg">
        <div className="flex h-full items-center justify-center">
          <HappyRobotLogo className="animate-pulse opacity-20" width={50} height={40} />
        </div>
      </div>
    </main>
  );
}

/**
 * SankeySkeleton - Minimal skeleton for the Sankey diagram
 */
export function SankeySkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-full w-full items-center justify-center", className)}>
      <HappyRobotLogo className="animate-pulse opacity-20" width={40} height={32} />
    </div>
  );
}

interface StageInfo {
  icon: LucideIcon;
  label: string;
  colors: { fill: string; text: string };
}

interface BatchesTableSkeletonProps {
  className?: string;
  rows?: number;
  stage?: StageInfo;
}

/**
 * BatchesTableSkeleton - Skeleton for the batches table in split view
 */
export function BatchesTableSkeleton({ className, rows = 5, stage }: BatchesTableSkeletonProps) {
  const [loadingMessage, setLoadingMessage] = useState(() => {
    return LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
  });

  // Rotate loading message every few seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setLoadingMessage(LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)]);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border-subtle bg-glass-bg",
        className
      )}
    >
      {/* Table Header - Stage info */}
      <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-4 py-3">
        <div className="flex items-center gap-3">
          {stage ? (
            <>
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ backgroundColor: stage.colors.fill }}
              >
                <stage.icon className="h-4 w-4" style={{ color: stage.colors.text }} />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-fg-primary">{stage.label}</h3>
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-3 w-6 rounded" />
                  <span className="text-[12px] text-fg-muted">batches</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="space-y-1.5">
                <SkeletonText width={80} className="h-4" />
                <SkeletonText width={50} className="h-3" />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Table Content */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full">
          {/* Column Headers */}
          <thead className="sticky top-0 bg-bg-base">
            <tr className="border-b border-border-subtle">
              <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-fg-muted">
                Supplier
              </th>
              <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-fg-muted">
                Actions
              </th>
              <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-fg-muted">
                POs
              </th>
              <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-fg-muted">
                Value
              </th>
              <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-fg-muted">
                Priority
              </th>
              <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-fg-muted">
                Attempts
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Loading message row */}
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center">
                <div className="flex flex-col items-center gap-3">
                  <HappyRobotLogo className="animate-pulse opacity-30" width={36} height={28} />
                  <span className="animate-pulse text-[13px] text-fg-muted">{loadingMessage}</span>
                </div>
              </td>
            </tr>
            {/* Skeleton rows */}
            {Array.from({ length: rows }).map((_, i) => {
              const nameWidths = [120, 95, 140, 110, 130, 100, 125, 115];
              const nameWidth = nameWidths[i % nameWidths.length];

              return (
                <tr
                  key={i}
                  className={cn(
                    "border-border-subtle/50 border-b",
                    i % 2 === 0 ? "bg-transparent" : "bg-glass-bg"
                  )}
                >
                  {/* Supplier */}
                  <td className="px-4 py-3">
                    <div className="space-y-1.5">
                      <SkeletonText width={nameWidth} className="h-3.5" />
                      <SkeletonText width={50} className="h-2.5" />
                    </div>
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Skeleton className="h-5 w-14 rounded" />
                      <Skeleton className="h-5 w-14 rounded" />
                    </div>
                  </td>
                  {/* POs */}
                  <td className="px-4 py-3">
                    <SkeletonText width={25} className="h-3" />
                  </td>
                  {/* Value */}
                  <td className="px-4 py-3">
                    <SkeletonText width={55} className="h-3" />
                  </td>
                  {/* Priority */}
                  <td className="px-4 py-3">
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </td>
                  {/* Attempts */}
                  <td className="px-4 py-3">
                    <SkeletonText width={35} className="h-3" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * KPICardSkeleton - Skeleton for KPI cards
 */
export function KPICardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border-subtle bg-glass-bg p-4", className)}>
      <SkeletonText width={60} className="mb-3 h-2.5" />
      <Skeleton className="h-7 w-20 rounded" />
    </div>
  );
}
