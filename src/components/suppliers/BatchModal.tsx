"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  X,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Package,
  Clock,
  Phone,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { useToast } from "@/components/ui/toaster";
import { stageColors, actionTypeColors } from "@/components/pipeline/pipeline-types";
import type { SupplierBatch, SupplierPO } from "./supplier-types";
import type { BatchStatus, POActionType } from "@/lib/validators";
import { useBatchLogs, type BatchLogEntry } from "@/hooks/use-batch-logs";
import gsap from "gsap";

// HappyRobot Platform configuration
const HAPPYROBOT_ORG = process.env.NEXT_PUBLIC_HAPPYROBOT_ORG || "henkel";
const HAPPYROBOT_WORKFLOW_ID = process.env.NEXT_PUBLIC_HAPPYROBOT_WORKFLOW_ID || "8gfcg9ucq0pb";

const getRunUrl = (runId: string) =>
  `https://v2.platform.happyrobot.ai/${HAPPYROBOT_ORG}/workflow/${HAPPYROBOT_WORKFLOW_ID}/runs?run_id=${runId}`;

interface BatchModalProps {
  batch: SupplierBatch;
  supplierName: string;
  supplierNumber?: string;
  onClose: () => void;
  onBatchUpdate?: (
    batchId: string,
    updates: { status?: BatchStatus; attemptCount?: number }
  ) => void;
  onPOResolved?: (poValue: number) => void;
  onCallTriggered?: () => void;
}

/** Supplier override structure from localStorage */
interface SupplierOverride {
  supplierNumber: string;
  name?: string;
  phone: string;
  email: string;
}

interface PersistedLog {
  id: string;
  type: string;
  level: string;
  message: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
}

interface BatchDetail {
  batch: SupplierBatch;
  purchaseOrders: SupplierPO[];
  logs: PersistedLog[];
}

const statusConfig: Record<BatchStatus, { label: string }> = {
  QUEUED: { label: "Queued" },
  IN_PROGRESS: { label: "In Progress" },
  COMPLETED: { label: "Completed" },
  FAILED: { label: "Failed" },
  PARTIAL: { label: "Partial" },
};

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}k`;
  }
  return `$${value.toFixed(0)}`;
}

function formatDate(dateStr: string | null | undefined, includeTime = true): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (includeTime) {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getActionTypeLabel(type: POActionType): string {
  switch (type) {
    case "CANCEL":
      return "Cancel";
    case "EXPEDITE":
      return "Expedite";
    case "PUSH_OUT":
      return "Push Out";
    default:
      return type;
  }
}

// Timeline event interface
interface TimelineEventData {
  title: string;
  timestamp?: string;
  details?: string;
  level?: "info" | "success" | "warning" | "error";
  link?: { url: string; label: string };
  icon?: LucideIcon;
}

// Clean timeline entry component - minimal design with optional icon
function TimelineEntry({
  title,
  timestamp,
  details,
  level = "info",
  link,
  icon: Icon,
}: TimelineEventData) {
  const levelStyles = {
    info: "text-fg-secondary",
    success: "text-success",
    warning: "text-warning",
    error: "text-danger",
  };

  const iconStyles = {
    info: "text-fg-muted",
    success: "text-success",
    warning: "text-warning",
    error: "text-danger",
  };

  const bgStyles = {
    info: "hover:bg-bg-elevated/50",
    success: "bg-success/5 hover:bg-success/10",
    warning: "bg-warning/5 hover:bg-warning/10",
    error: "bg-danger/5 hover:bg-danger/10",
  };

  return (
    <div
      className={`group flex items-start gap-3 rounded px-1 py-2 transition-colors ${bgStyles[level]}`}
    >
      {/* Timestamp */}
      <span className="w-[52px] shrink-0 pt-0.5 font-mono text-[10px] text-fg-disabled">
        {timestamp
          ? new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : ""}
      </span>
      {/* Icon or dot indicator */}
      {Icon ? (
        <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${iconStyles[level]}`} />
      ) : (
        <span
          className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${iconStyles[level]} bg-current`}
        />
      )}
      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className={`text-[12px] leading-relaxed ${levelStyles[level]}`}>{title}</p>
        {details && <p className="mt-0.5 truncate text-[11px] text-fg-muted">{details}</p>}
        {link && (
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-white/70 hover:text-white/90 hover:underline"
          >
            {link.label}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
    </div>
  );
}

export function BatchModal({
  batch,
  supplierName,
  supplierNumber,
  onClose,
  onBatchUpdate,
  onPOResolved,
  onCallTriggered,
}: BatchModalProps) {
  const [batchDetail, setBatchDetail] = useState<BatchDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [poStatuses, setPoStatuses] = useState<Record<string, string>>({});
  const [currentBatchStatus, setCurrentBatchStatus] = useState<BatchStatus>(batch.status);
  const [isTriggering, setIsTriggering] = useState(false);
  const [runId, setRunId] = useState<string | null>(batch.lastAgentRun?.externalId || null);
  const modalRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  // Trigger call for this batch
  const handleTriggerCall = useCallback(async () => {
    if (isTriggering || currentBatchStatus !== "QUEUED") return;

    setIsTriggering(true);

    try {
      // Get demo config from localStorage for phone override
      let phoneOverride: string | undefined;
      let emailOverride: string | undefined;

      if (supplierNumber) {
        try {
          const overrides: SupplierOverride[] = JSON.parse(
            localStorage.getItem("demo_supplier_overrides") || "[]"
          );
          const override = overrides.find((s) => s.supplierNumber === supplierNumber);
          if (override) {
            phoneOverride = override.phone || undefined;
            emailOverride = override.email || undefined;
          }
        } catch {
          // Ignore localStorage errors
        }
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

      toast.success(`Call started for ${supplierName}`);

      // Update local status and store run ID
      setCurrentBatchStatus("IN_PROGRESS");
      if (data.runId) {
        setRunId(data.runId);
      }

      // Notify parent
      onBatchUpdate?.(batch.id, { status: "IN_PROGRESS" });
      onCallTriggered?.();
    } catch (error) {
      console.error("Failed to trigger call:", error);
      toast.error(error instanceof Error ? error.message : "Failed to trigger call");
    } finally {
      setIsTriggering(false);
    }
  }, [
    isTriggering,
    currentBatchStatus,
    supplierNumber,
    batch.id,
    supplierName,
    toast,
    onBatchUpdate,
    onCallTriggered,
  ]);

  // Subscribe to live batch logs while batch is active (IN_PROGRESS or PARTIAL)
  const { logs, isConnected } = useBatchLogs({
    batchId: batch.id,
    enabled: currentBatchStatus === "IN_PROGRESS" || currentBatchStatus === "PARTIAL",
    onPOUpdate: (entry) => {
      if (entry.data?.poId && entry.data?.newStatus) {
        const poId = entry.data.poId as string;
        const newStatus = entry.data.newStatus as string;
        const outcome = entry.data.outcome as string;

        setPoStatuses((prev) => ({
          ...prev,
          [poId]: newStatus,
        }));

        // If PO was successfully resolved, notify parent to update KPIs
        if (outcome === "success" && onPOResolved && batchDetail?.purchaseOrders) {
          const po = batchDetail.purchaseOrders.find((p) => p.id === poId);
          if (po) {
            onPOResolved(po.calculatedTotalValue);
          }
        }
      }
    },
    onStatusChange: (entry) => {
      // Update status when batch completes
      const outcome = entry.data?.outcome as string;
      let newStatus: BatchStatus | null = null;

      if (outcome === "success") {
        newStatus = "COMPLETED";
        setCurrentBatchStatus("COMPLETED");
      } else if (outcome === "partial") {
        newStatus = "PARTIAL";
        setCurrentBatchStatus("PARTIAL");
      } else if (outcome === "failed") {
        newStatus = "FAILED";
        setCurrentBatchStatus("FAILED");
      }

      // Notify parent to update batch card
      if (newStatus && onBatchUpdate) {
        onBatchUpdate(batch.id, { status: newStatus, attemptCount: batch.attemptCount + 1 });
      }
    },
  });

  // Auto-scroll timeline to bottom when new SSE logs arrive
  useEffect(() => {
    if (timelineContainerRef.current && logs.length > 0) {
      timelineContainerRef.current.scrollTo({
        top: timelineContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [logs.length]);

  // Fetch batch details with POs and persisted logs
  useEffect(() => {
    async function fetchBatchDetail() {
      try {
        const response = await fetch(`/api/batches/${batch.id}`);
        const data = await response.json();
        if (data.success) {
          setBatchDetail({
            batch: data.data,
            purchaseOrders: data.data.purchaseOrders,
            logs: data.data.logs || [],
          });
        }
      } catch (error) {
        console.error("Failed to fetch batch details:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchBatchDetail();
  }, [batch.id]);

  // GSAP animation on mount
  useEffect(() => {
    if (!modalRef.current || !backdropRef.current) return;

    gsap.set(backdropRef.current, { opacity: 0 });
    gsap.set(modalRef.current, { opacity: 0, y: 20, scale: 0.98 });

    const tl = gsap.timeline();
    tl.to(backdropRef.current, { opacity: 1, duration: 0.2 }).to(
      modalRef.current,
      { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "back.out(1.5)" },
      "-=0.1"
    );
  }, []);

  // Handle close with animation
  const handleClose = useCallback(() => {
    if (!modalRef.current || !backdropRef.current) {
      onClose();
      return;
    }

    const tl = gsap.timeline({ onComplete: onClose });
    tl.to(modalRef.current, { opacity: 0, y: 10, scale: 0.98, duration: 0.2 }).to(
      backdropRef.current,
      { opacity: 0, duration: 0.15 },
      "-=0.1"
    );
  }, [onClose]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [handleClose]);

  const status = statusConfig[currentBatchStatus];
  const colors = stageColors[currentBatchStatus];

  // Sort POs
  const sortedPOs = batchDetail?.purchaseOrders
    ? [...batchDetail.purchaseOrders].sort((a, b) => {
        const comparison = b.calculatedTotalValue - a.calculatedTotalValue;
        return sortOrder === "desc" ? comparison : -comparison;
      })
    : [];

  // Calculate totals
  const totalValue = sortedPOs.reduce((sum, po) => sum + po.calculatedTotalValue, 0);

  // Build timeline events
  const timelineEvents: TimelineEventData[] = [
    {
      title: "Batch created & queued",
      timestamp: batch.createdAt,
      details: `${batch.poCount} POs · ${formatCurrency(batch.totalValue)}`,
      level: "info",
      icon: Package,
    },
  ];

  if (batch.lastAgentRun) {
    if (batch.lastAgentRun.startedAt) {
      timelineEvents.push({
        title: `Call started (attempt ${batch.attemptCount})`,
        timestamp: batch.lastAgentRun.startedAt,
        level: "info",
        icon: Phone,
        link: batch.lastAgentRun.externalUrl
          ? { url: batch.lastAgentRun.externalUrl, label: "View in HappyRobot" }
          : undefined,
      });
    }

    if (batch.lastAgentRun.endedAt) {
      const isSuccess = batch.lastAgentRun.outcome === "success";
      timelineEvents.push({
        title: isSuccess ? "Call completed successfully" : "Call failed",
        timestamp: batch.lastAgentRun.endedAt,
        details: batch.lastOutcomeReason ?? batch.lastOutcome ?? undefined,
        level: isSuccess ? "success" : "error",
        icon: isSuccess ? CheckCircle2 : XCircle,
      });
    }
  }

  if (batch.scheduledFor && batch.status === "QUEUED") {
    timelineEvents.push({
      title: "Callback scheduled",
      timestamp: batch.scheduledFor,
      details: `Attempt ${batch.attemptCount + 1} of ${batch.maxAttempts}`,
      level: "warning",
      icon: Clock,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        className="relative w-full max-w-6xl rounded-2xl border border-border-subtle bg-bg-surface shadow-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-6 py-4">
          <div className="flex items-center gap-4">
            <span
              className="rounded-full px-3 py-1 text-[12px] font-medium transition-all duration-300"
              style={{ backgroundColor: colors.fill, color: colors.text }}
            >
              {status.label}
            </span>
            <div>
              <h2 className="font-mono text-[18px] font-semibold text-fg-primary">{batch.id}</h2>
              <p className="text-[13px] text-fg-muted">{supplierName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Start Call / View execution button */}
            {currentBatchStatus === "QUEUED" && !runId ? (
              <button
                onClick={handleTriggerCall}
                disabled={isTriggering}
                className="flex items-center gap-1.5 rounded-lg border border-border-subtle px-4 py-1.5 text-[12px] font-medium text-fg-secondary transition-all hover:bg-interactive-hover hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  animation: isTriggering ? "none" : "btn-pulse 2s ease-in-out infinite",
                }}
              >
                {isTriggering ? (
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
            ) : runId ? (
              <a
                href={getRunUrl(runId)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-base px-4 py-1.5 text-[12px] font-medium text-fg-secondary transition-colors hover:bg-interactive-hover hover:text-fg-primary"
              >
                <Image
                  src="/happyrobot/Footer-logo-white.svg"
                  alt=""
                  width={14}
                  height={14}
                  className="h-3.5 w-3.5 object-contain opacity-80"
                />
                View execution
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
            <button
              onClick={handleClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-interactive-hover hover:text-fg-primary"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content - use relative/absolute to constrain timeline height to PO panel */}
        {/* min-h-[600px] ensures space for ~15 POs even when fewer exist */}
        <div className="relative flex min-h-[600px]">
          {/* Left Panel - POs (determines the height) */}
          <div className="flex w-[60%] flex-col rounded-bl-2xl border-r border-border-subtle">
            {/* PO Header */}
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-border-subtle px-4">
              <span className="text-[14px] font-medium text-fg-primary">
                Purchase Orders ({sortedPOs.length})
              </span>
              <button
                onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
                className="flex items-center gap-1 text-[12px] text-fg-muted hover:text-fg-primary"
              >
                Value{" "}
                {sortOrder === "desc" ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronUp className="h-3 w-3" />
                )}
              </button>
            </div>

            {/* PO List - scrollable */}
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <table className="w-full">
                  <thead className="sticky top-0 bg-bg-surface">
                    <tr className="text-left text-[11px] font-medium uppercase tracking-wider text-fg-muted">
                      <th className="px-4 py-2">PO#</th>
                      <th className="px-4 py-2">Part</th>
                      <th className="px-4 py-2">Due Date</th>
                      <th className="px-4 py-2 text-right">Value</th>
                      <th className="px-4 py-2">Action</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {Array.from({ length: batch.poCount }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="px-4 py-2">
                          <div className="h-4 w-16 rounded bg-border-subtle" />
                        </td>
                        <td className="px-4 py-2">
                          <div className="h-4 w-24 rounded bg-border-subtle" />
                        </td>
                        <td className="px-4 py-2">
                          <div className="h-4 w-20 rounded bg-border-subtle" />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="ml-auto h-4 w-20 rounded bg-border-subtle" />
                        </td>
                        <td className="px-4 py-2">
                          <div className="h-5 w-16 rounded bg-border-subtle" />
                        </td>
                        <td className="px-4 py-2">
                          <div className="h-5 w-16 rounded bg-border-subtle" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 bg-bg-surface">
                    <tr className="text-left text-[11px] font-medium uppercase tracking-wider text-fg-muted">
                      <th className="px-4 py-2">PO#</th>
                      <th className="px-4 py-2">Part</th>
                      <th className="px-4 py-2">Due Date</th>
                      <th className="px-4 py-2 text-right">Value</th>
                      <th className="px-4 py-2">Action</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {sortedPOs.map((po) => {
                      const typeColors = actionTypeColors[po.actionType];
                      const currentStatus = poStatuses[po.id] || po.status;

                      // Get action-specific status label and style
                      // Using inline styles for bg because Tailwind opacity modifiers don't work with CSS variables
                      const getStatusDisplay = () => {
                        if (currentStatus === "COMPLETED") {
                          // Show action-specific success label
                          const successLabels: Record<POActionType, string> = {
                            PUSH_OUT: "Pushed Out",
                            CANCEL: "Cancelled",
                            EXPEDITE: "Expedited",
                          };
                          return {
                            label: successLabels[po.actionType] || "Done",
                            bgStyle: "rgba(34, 197, 94, 0.25)", // green
                            textClass: "text-success",
                          };
                        }
                        if (currentStatus === "FAILED") {
                          return {
                            label: "Failed",
                            bgStyle: "rgba(239, 68, 68, 0.25)", // red
                            textClass: "text-danger",
                          };
                        }
                        if (currentStatus === "IN_PROGRESS") {
                          return {
                            label: "In Progress",
                            bgStyle: "rgba(59, 130, 246, 0.25)", // blue
                            textClass: "text-info",
                          };
                        }
                        if (currentStatus === "QUEUED") {
                          return {
                            label: "Queued",
                            bgStyle: "rgba(255, 255, 255, 0.10)",
                            textClass: "text-white/70",
                          };
                        }
                        return {
                          label: "Pending",
                          bgStyle: "rgba(255, 255, 255, 0.08)",
                          textClass: "text-white/60",
                        };
                      };

                      const statusDisplay = getStatusDisplay();

                      return (
                        <tr key={po.id} className="hover:bg-interactive-hover/50">
                          <td className="px-4 py-2">
                            <span className="font-mono text-[13px] text-fg-primary">
                              {po.poNumber}
                            </span>
                            <span className="ml-1 text-[11px] text-fg-muted">L{po.poLine}</span>
                          </td>
                          <td className="max-w-[140px] truncate px-4 py-2 text-[12px] text-fg-secondary">
                            {po.partNumber}
                          </td>
                          <td className="px-4 py-2 text-[12px] text-fg-secondary">
                            {formatDate(po.dueDate, false)}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-[12px] text-fg-primary">
                            {formatCurrency(po.calculatedTotalValue)}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                              style={{
                                backgroundColor: typeColors.bg,
                                color: typeColors.text,
                              }}
                            >
                              {getActionTypeLabel(po.actionType)}
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusDisplay.textClass}`}
                              style={{ backgroundColor: statusDisplay.bgStyle }}
                            >
                              {statusDisplay.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Total Row - fixed at bottom */}
            <div className="shrink-0 border-t border-border-subtle bg-bg-elevated px-4 py-3">
              <div className="flex text-[13px] font-medium">
                <span className="w-[45%] text-fg-muted">Total</span>
                <span className="w-[18%] text-right font-mono text-fg-primary">
                  {isLoading ? (
                    <span className="inline-block h-4 w-20 animate-pulse rounded bg-border-subtle" />
                  ) : (
                    formatCurrency(totalValue)
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Right Panel - Timeline (absolute to match left panel height) */}
          <div className="absolute bottom-0 right-0 top-0 flex w-[40%] flex-col overflow-hidden rounded-br-2xl bg-bg-base">
            {/* Timeline Header */}
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-border-subtle bg-bg-surface px-4">
              <span className="text-[13px] font-medium text-fg-primary">Activity</span>
              {isConnected && (
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                  <span className="text-[10px] text-success">Live</span>
                </span>
              )}
            </div>
            {/* Timeline Content - scrollable */}
            <div
              ref={timelineContainerRef}
              className="scrollbar-thin scrollbar-thumb-border-subtle scrollbar-track-transparent min-h-0 flex-1 overflow-y-auto px-3 py-2"
            >
              {/* Base timeline events */}
              {timelineEvents.map((event, index) => (
                <TimelineEntry
                  key={`event-${index}`}
                  title={event.title}
                  timestamp={event.timestamp}
                  details={event.details}
                  level={event.level}
                  link={event.link}
                  icon={event.icon}
                />
              ))}
              {/* Persisted logs from database */}
              {batchDetail?.logs.map((log) => {
                const isPOUpdate = log.type === "po_update";
                const level = log.level as "info" | "success" | "warning" | "error";

                const title = log.message || "...";
                let eventIcon: LucideIcon = MessageSquare;

                if (isPOUpdate) {
                  eventIcon = level === "success" ? CheckCircle2 : XCircle;
                }

                return (
                  <TimelineEntry
                    key={`db-${log.id}`}
                    title={title}
                    timestamp={log.createdAt}
                    details={isPOUpdate ? (log.data?.reason as string) : undefined}
                    level={level}
                    icon={eventIcon}
                  />
                );
              })}
              {/* Live SSE log events (only new ones since modal opened) */}
              {logs.map((entry, index) => {
                const isPOUpdate = entry.type === "po_update";
                const level =
                  (entry.data?.level as "info" | "success" | "warning" | "error") || "info";

                // Build title and determine icon
                let title = (entry.data?.message as string) || "...";
                let eventLevel: "info" | "success" | "warning" | "error" = level;
                let eventIcon: LucideIcon = MessageSquare;

                if (isPOUpdate) {
                  const poNumber = entry.data?.poNumber;
                  const outcome = entry.data?.outcome;
                  title = `PO# ${poNumber} ${outcome === "success" ? "confirmed" : "failed"}`;
                  eventLevel = outcome === "success" ? "success" : "error";
                  eventIcon = outcome === "success" ? CheckCircle2 : XCircle;
                }

                return (
                  <TimelineEntry
                    key={`sse-${index}`}
                    title={title}
                    timestamp={entry.timestamp}
                    details={isPOUpdate ? (entry.data?.reason as string) : undefined}
                    level={eventLevel}
                    icon={eventIcon}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
