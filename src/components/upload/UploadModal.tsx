"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import { useUIStore, type ActiveUpload } from "@/stores/ui-store";
import { parseExcelPreview, type ExcelPreviewResult } from "@/lib/excel-parser";

type UploadStep = "select" | "preview" | "uploading" | "complete" | "error";
type ProcessingStage = "parsing" | "suppliers" | "pos" | "batches" | "queuing" | "complete";

interface UploadSummary {
  total: number;
  byAction: { CANCEL: number; EXPEDITE: number; PUSH_OUT: number };
  suppliers: { created: number; updated: number };
  batches: { created: number; totalValue: number };
  conflicts: number;
  skipped: number;
}

interface UploadProgress {
  stage: ProcessingStage;
  current: number;
  total: number;
  message: string;
}

const STAGE_LABELS: Record<ProcessingStage, string> = {
  parsing: "Parsing File",
  suppliers: "Processing Suppliers",
  pos: "Processing POs",
  batches: "Creating Batches",
  queuing: "Queuing Jobs",
  complete: "Complete",
};

const STAGE_ORDER: ProcessingStage[] = [
  "parsing",
  "suppliers",
  "pos",
  "batches",
  "queuing",
  "complete",
];

interface UploadModalProps {
  /** Called when an upload completes successfully */
  onUploadComplete?: () => void;
}

export function UploadModal({ onUploadComplete }: UploadModalProps) {
  const {
    activeModal,
    closeModal,
    addNotification,
    activeUploads,
    addActiveUpload,
    updateActiveUpload,
    removeActiveUpload,
  } = useUIStore();
  const isOpen = activeModal === "upload-pos";

  const [step, setStep] = useState<UploadStep>("select");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ExcelPreviewResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewingJobId, setViewingJobId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Cleanup SSE connection on unmount or close
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeModal();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeModal]);

  const resetState = useCallback(() => {
    setStep("select");
    setFile(null);
    setPreview(null);
    setIsDragging(false);
    setUploadProgress(null);
    setUploadSummary(null);
    setErrorMessage(null);
    setViewingJobId(null);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    closeModal();
    // Only reset viewing state, keep uploads running
    setStep("select");
    setFile(null);
    setPreview(null);
    setIsDragging(false);
    setViewingJobId(null);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, [closeModal]);

  const processFile = useCallback(async (selectedFile: File) => {
    if (!selectedFile.name.endsWith(".xlsx") && !selectedFile.name.endsWith(".xls")) {
      setErrorMessage("Invalid file type. Please upload an Excel file (.xlsx or .xls)");
      setStep("error");
      return;
    }

    if (selectedFile.size > 50 * 1024 * 1024) {
      setErrorMessage("File too large. Maximum size is 50MB.");
      setStep("error");
      return;
    }

    setFile(selectedFile);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const previewResult = parseExcelPreview(Buffer.from(buffer), 5);
      setPreview(previewResult);
      setStep("preview");
    } catch {
      setErrorMessage("Failed to parse Excel file. Please check the file format.");
      setStep("error");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        processFile(droppedFile);
      }
    },
    [processFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) {
        processFile(selectedFile);
      }
    },
    [processFile]
  );

  const connectToSSE = useCallback(
    (jobId: string, fileName: string) => {
      // Add to store
      addActiveUpload({
        jobId,
        fileName,
        status: "processing",
        progress: {
          stage: "parsing",
          current: 100,
          total: 100,
          message: "Starting upload...",
        },
      });

      setViewingJobId(jobId);

      const eventSource = new EventSource(`/api/upload/progress/${jobId}`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "progress") {
          setUploadProgress(data.progress);
          updateActiveUpload(jobId, {
            status: "processing",
            progress: data.progress,
          });
        } else if (data.type === "complete") {
          setUploadProgress(data.progress);
          setUploadSummary(data.result);
          setStep("complete");
          updateActiveUpload(jobId, {
            status: "complete",
            progress: data.progress,
            result: data.result,
          });
          eventSource.close();
          eventSourceRef.current = null;
          addNotification({
            type: "success",
            title: "Upload Complete",
            message: `${data.result.total} POs uploaded, ${data.result.batches.created} batches created`,
          });
          // Trigger callback for dashboard refresh
          onUploadComplete?.();
        } else if (data.type === "error") {
          setErrorMessage(data.error || data.message || "Processing failed");
          setStep("error");
          updateActiveUpload(jobId, {
            status: "error",
            error: data.error || data.message,
          });
          eventSource.close();
          eventSourceRef.current = null;
        } else if (data.type === "timeout") {
          setErrorMessage("Upload timed out. Please try again.");
          setStep("error");
          updateActiveUpload(jobId, {
            status: "error",
            error: "Upload timed out",
          });
          eventSource.close();
          eventSourceRef.current = null;
        }
      };

      eventSource.onerror = () => {
        // Don't show error immediately - the upload might still be processing
        // The user can check the active uploads list
        eventSource.close();
        eventSourceRef.current = null;
      };
    },
    [addActiveUpload, updateActiveUpload, addNotification, onUploadComplete]
  );

  const handleUpload = useCallback(async () => {
    if (!file) return;

    // Generate temporary ID for tracking before we get jobId from server
    const tempId = `temp-${Date.now()}`;

    setStep("uploading");
    setUploadProgress({
      stage: "parsing",
      current: 0,
      total: 100,
      message: "Uploading file...",
    });

    // Add to store immediately so FAB shows badge
    addActiveUpload({
      jobId: tempId,
      fileName: file.name,
      status: "uploading",
      progress: {
        stage: "parsing",
        current: 0,
        total: 100,
        message: "Uploading file...",
      },
    });
    setViewingJobId(tempId);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/upload/pos", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!result.success) {
        setErrorMessage(result.error || "Upload failed");
        setStep("error");
        removeActiveUpload(tempId);
        return;
      }

      // If no jobId, it was a quick response (no actionable POs)
      if (!result.jobId) {
        setUploadSummary(result.summary);
        setStep("complete");
        removeActiveUpload(tempId);
        addNotification({
          type: "success",
          title: "Upload Complete",
          message: result.message || "No actionable POs found",
        });
        // Still trigger callback even for no actionable POs
        onUploadComplete?.();
        return;
      }

      // Remove temp entry and connect to SSE with real jobId
      removeActiveUpload(tempId);
      connectToSSE(result.jobId, file.name);
    } catch {
      setErrorMessage("Network error. Please try again.");
      setStep("error");
      removeActiveUpload(tempId);
    }
  }, [file, addNotification, addActiveUpload, removeActiveUpload, connectToSSE, onUploadComplete]);

  const viewActiveUpload = useCallback(
    (upload: ActiveUpload) => {
      setViewingJobId(upload.jobId);
      setFile({ name: upload.fileName } as File);

      if (upload.status === "complete" && upload.result) {
        setUploadSummary({
          total: upload.result.total,
          byAction: { CANCEL: 0, EXPEDITE: 0, PUSH_OUT: 0 },
          suppliers: { created: 0, updated: 0 },
          batches: { created: upload.result.batches.created, totalValue: 0 },
          conflicts: 0,
          skipped: 0,
        });
        setStep("complete");
      } else if (upload.status === "error") {
        setErrorMessage(upload.error || "Upload failed");
        setStep("error");
      } else {
        setUploadProgress(upload.progress as UploadProgress);
        setStep("uploading");

        // Reconnect to SSE if still processing
        if (upload.status === "processing" || upload.status === "uploading") {
          const eventSource = new EventSource(`/api/upload/progress/${upload.jobId}`);
          eventSourceRef.current = eventSource;

          eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === "progress") {
              setUploadProgress(data.progress);
              updateActiveUpload(upload.jobId, {
                status: "processing",
                progress: data.progress,
              });
            } else if (data.type === "complete") {
              setUploadProgress(data.progress);
              setUploadSummary(data.result);
              setStep("complete");
              updateActiveUpload(upload.jobId, {
                status: "complete",
                progress: data.progress,
                result: data.result,
              });
              eventSource.close();
              eventSourceRef.current = null;
              // Trigger callback for dashboard refresh
              onUploadComplete?.();
            } else if (data.type === "error") {
              setErrorMessage(data.error || data.message || "Processing failed");
              setStep("error");
              updateActiveUpload(upload.jobId, {
                status: "error",
                error: data.error || data.message,
              });
              eventSource.close();
              eventSourceRef.current = null;
            }
          };

          eventSource.onerror = () => {
            eventSource.close();
            eventSourceRef.current = null;
          };
        }
      }
    },
    [updateActiveUpload, onUploadComplete]
  );

  // Calculate overall progress based on stages
  const getOverallProgress = useCallback(() => {
    if (!uploadProgress) return 0;
    const stageIndex = STAGE_ORDER.indexOf(uploadProgress.stage as ProcessingStage);
    const stageWeight = 100 / (STAGE_ORDER.length - 1);
    const stageProgress = (uploadProgress.current / uploadProgress.total) * stageWeight;
    return Math.round(stageIndex * stageWeight + stageProgress);
  }, [uploadProgress]);

  // Get active processing uploads
  const processingUploads = activeUploads.filter(
    (u) => u.status === "uploading" || u.status === "processing"
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div
        className="linear-card relative z-10 w-full max-w-2xl animate-fade-in"
        style={{ maxHeight: "85vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-lg font-semibold text-fg-primary">
            {viewingJobId ? "Upload Progress" : "Upload POs"}
          </h2>
          <button
            onClick={handleClose}
            className="rounded-lg p-2 text-fg-muted hover:bg-white/[0.08] hover:text-fg-primary"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6" style={{ maxHeight: "calc(85vh - 130px)" }}>
          {step === "select" && (
            <div className="space-y-6">
              {/* Drag & Drop Zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all duration-200 ${
                  isDragging
                    ? "border-white/40 bg-white/[0.08]"
                    : "border-white/20 bg-white/[0.04] hover:border-white/30 hover:bg-white/[0.08]"
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="mb-4 rounded-full bg-white/10 p-4">
                  <svg
                    className="h-8 w-8 text-white/80"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                </div>
                <p className="mb-2 text-fg-primary">
                  {isDragging ? "Drop your file here" : "Drag & drop your Excel file"}
                </p>
                <p className="text-sm text-fg-muted">or click to browse</p>
                <p className="mt-4 text-xs text-fg-disabled">
                  Supports .xlsx and .xls files up to 50MB
                </p>
              </div>

              {/* Active Uploads Section */}
              {processingUploads.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-fg-secondary">Active Uploads</h3>
                    <span className="text-xs text-fg-muted">
                      {processingUploads.length} in progress
                    </span>
                  </div>
                  <div className="space-y-2">
                    {processingUploads.map((upload) => (
                      <button
                        key={upload.jobId}
                        onClick={() => viewActiveUpload(upload)}
                        className="flex w-full items-center gap-3 rounded-lg bg-white/[0.05] px-4 py-3 text-left transition-all hover:bg-white/[0.10]"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white/80" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-fg-primary">
                            {upload.fileName}
                          </p>
                          <p className="text-xs text-fg-muted">{upload.progress.message}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-info transition-all duration-300"
                              style={{ width: `${upload.progress.current}%` }}
                            />
                          </div>
                          <svg
                            className="h-4 w-4 text-fg-muted"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === "preview" && preview && (
            <div className="space-y-4">
              {/* File info */}
              <div className="flex items-center gap-3 rounded-lg bg-white/[0.05] px-4 py-3">
                <div className="rounded-lg bg-white/10 p-2">
                  <svg
                    className="h-5 w-5 text-white/80"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-fg-primary">{file?.name}</p>
                  <p className="text-sm text-fg-muted">
                    {preview.totalRows.toLocaleString()} rows found
                  </p>
                </div>
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-lg bg-white/[0.05] px-3 py-2 text-center">
                  <p className="text-lg font-semibold text-fg-primary">{preview.summary.total}</p>
                  <p className="text-xs text-fg-muted">Actionable</p>
                </div>
                <div
                  className="rounded-lg px-3 py-2 text-center"
                  style={{ backgroundColor: "rgba(239, 68, 68, 0.1)" }}
                >
                  <p className="text-lg font-semibold text-danger">
                    {preview.summary.byAction.CANCEL}
                  </p>
                  <p className="text-xs text-fg-muted">Cancel</p>
                </div>
                <div
                  className="rounded-lg px-3 py-2 text-center"
                  style={{ backgroundColor: "rgba(245, 158, 11, 0.1)" }}
                >
                  <p className="text-lg font-semibold text-warning">
                    {preview.summary.byAction.EXPEDITE}
                  </p>
                  <p className="text-xs text-fg-muted">Expedite</p>
                </div>
                <div
                  className="rounded-lg px-3 py-2 text-center"
                  style={{ backgroundColor: "rgba(59, 130, 246, 0.1)" }}
                >
                  <p className="text-lg font-semibold text-info">
                    {preview.summary.byAction.PUSH_OUT}
                  </p>
                  <p className="text-xs text-fg-muted">Push Out</p>
                </div>
              </div>

              {/* Preview table */}
              <div className="overflow-hidden rounded-lg border border-white/10">
                <div className="border-b border-white/10 bg-white/[0.05] px-4 py-2">
                  <p className="text-sm font-medium text-fg-secondary">Preview (first 5 rows)</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/[0.04]">
                        <th className="px-3 py-2 text-left text-xs font-medium text-fg-muted">
                          PO #
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-fg-muted">
                          Line
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-fg-muted">
                          Supplier
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-fg-muted">
                          Action
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-fg-muted">
                          Value
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.previewRows.map((row, i) => (
                        <tr key={i} className="border-b border-white/5">
                          <td className="px-3 py-2 font-mono text-fg-primary">{row.poNumber}</td>
                          <td className="px-3 py-2 text-fg-secondary">{row.poLine}</td>
                          <td className="px-3 py-2 text-fg-secondary">{row.supplierName}</td>
                          <td className="px-3 py-2">
                            <span
                              className="inline-block rounded px-2 py-0.5 text-xs font-medium"
                              style={
                                row.actionType === "CANCEL"
                                  ? {
                                      backgroundColor: "rgba(239, 68, 68, 0.2)",
                                      color: "rgba(248, 113, 113, 0.95)",
                                    }
                                  : row.actionType === "EXPEDITE"
                                    ? {
                                        backgroundColor: "rgba(245, 158, 11, 0.2)",
                                        color: "rgba(251, 191, 36, 0.95)",
                                      }
                                    : {
                                        backgroundColor: "rgba(59, 130, 246, 0.2)",
                                        color: "rgba(96, 165, 250, 0.95)",
                                      }
                              }
                            >
                              {row.actionType === "CANCEL"
                                ? "Cancel"
                                : row.actionType === "EXPEDITE"
                                  ? "Expedite"
                                  : "Push Out"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-fg-primary">
                            ${row.calculatedTotalValue.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {preview.warnings && preview.warnings.length > 0 && (
                <div className="rounded-lg border border-white/15 bg-white/[0.06] px-4 py-3">
                  <p className="mb-1 text-sm font-medium text-white/70">Warnings</p>
                  <ul className="list-inside list-disc text-xs text-white/50">
                    {preview.warnings.slice(0, 3).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {step === "uploading" && uploadProgress && (
            <div className="space-y-6 py-6">
              {/* Spinner and main message */}
              <div className="flex flex-col items-center">
                <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-white/80" />
                <p className="text-lg font-medium text-fg-primary">Processing Upload</p>
                <p className="text-sm text-fg-muted">{file?.name}</p>
              </div>

              {/* Stage progress indicators */}
              <div className="space-y-2">
                {STAGE_ORDER.slice(0, -1).map((stage) => {
                  const stageIndex = STAGE_ORDER.indexOf(stage);
                  const currentIndex = STAGE_ORDER.indexOf(uploadProgress.stage as ProcessingStage);
                  const isComplete = stageIndex < currentIndex;
                  const isCurrent = stage === uploadProgress.stage;

                  return (
                    <div key={stage} className="flex items-center gap-3">
                      {/* Status icon */}
                      <div
                        className="flex h-6 w-6 items-center justify-center rounded-full"
                        style={{
                          backgroundColor: isComplete
                            ? "rgba(34, 197, 94, 0.2)"
                            : isCurrent
                              ? "rgba(59, 130, 246, 0.2)"
                              : "rgba(255, 255, 255, 0.08)",
                        }}
                      >
                        {isComplete ? (
                          <svg
                            className="h-3.5 w-3.5 text-success"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        ) : isCurrent ? (
                          <div className="h-2 w-2 animate-pulse rounded-full bg-info" />
                        ) : (
                          <div className="h-2 w-2 rounded-full bg-white/20" />
                        )}
                      </div>

                      {/* Label and progress */}
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-sm ${
                              isComplete
                                ? "text-white/90"
                                : isCurrent
                                  ? "text-fg-primary"
                                  : "text-fg-disabled"
                            }`}
                          >
                            {STAGE_LABELS[stage]}
                          </span>
                          {isCurrent && (
                            <span className="text-xs text-fg-muted">{uploadProgress.current}%</span>
                          )}
                        </div>
                        {isCurrent && (
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-info transition-all duration-300"
                              style={{ width: `${uploadProgress.current}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Current message */}
              <div className="rounded-lg bg-white/[0.05] px-4 py-3 text-center">
                <p className="text-sm text-fg-secondary">{uploadProgress.message}</p>
              </div>

              {/* Overall progress */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-fg-muted">Overall Progress</span>
                  <span className="text-info">{getOverallProgress()}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-info transition-all duration-300"
                    style={{ width: `${getOverallProgress()}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {step === "complete" && uploadSummary && (
            <div className="space-y-4">
              <div className="flex flex-col items-center py-6">
                <div
                  className="mb-4 rounded-full p-4"
                  style={{ backgroundColor: "rgba(34, 197, 94, 0.15)" }}
                >
                  <svg
                    className="h-8 w-8 text-success"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-fg-primary">Upload Complete!</h3>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-white/[0.05] px-4 py-3 text-center">
                  <p className="text-2xl font-semibold text-fg-primary">{uploadSummary.total}</p>
                  <p className="text-xs text-fg-muted">Total POs</p>
                </div>
                <div className="rounded-lg bg-white/[0.05] px-4 py-3 text-center">
                  <p className="text-2xl font-semibold text-white/90">
                    {uploadSummary.batches.created}
                  </p>
                  <p className="text-xs text-fg-muted">Batches Created</p>
                </div>
                <div className="rounded-lg bg-white/[0.05] px-4 py-3 text-center">
                  <p className="text-2xl font-semibold text-white/90">
                    ${(uploadSummary.batches.totalValue / 1000000).toFixed(1)}M
                  </p>
                  <p className="text-xs text-fg-muted">Total Value</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div
                  className="rounded-lg px-3 py-2 text-center"
                  style={{ backgroundColor: "rgba(239, 68, 68, 0.1)" }}
                >
                  <p className="text-lg font-semibold text-danger">
                    {uploadSummary.byAction.CANCEL}
                  </p>
                  <p className="text-xs text-fg-muted">Cancel</p>
                </div>
                <div
                  className="rounded-lg px-3 py-2 text-center"
                  style={{ backgroundColor: "rgba(245, 158, 11, 0.1)" }}
                >
                  <p className="text-lg font-semibold text-warning">
                    {uploadSummary.byAction.EXPEDITE}
                  </p>
                  <p className="text-xs text-fg-muted">Expedite</p>
                </div>
                <div
                  className="rounded-lg px-3 py-2 text-center"
                  style={{ backgroundColor: "rgba(59, 130, 246, 0.1)" }}
                >
                  <p className="text-lg font-semibold text-info">
                    {uploadSummary.byAction.PUSH_OUT}
                  </p>
                  <p className="text-xs text-fg-muted">Push Out</p>
                </div>
              </div>

              {uploadSummary.conflicts > 0 && (
                <div className="rounded-lg border border-white/15 bg-white/[0.06] px-4 py-3">
                  <p className="text-sm text-white/70">
                    {uploadSummary.conflicts} conflict(s) detected with existing POs
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between text-sm text-fg-muted">
                <span>
                  Suppliers: {uploadSummary.suppliers.created} new,{" "}
                  {uploadSummary.suppliers.updated} updated
                </span>
                <span>Skipped: {uploadSummary.skipped}</span>
              </div>
            </div>
          )}

          {step === "error" && (
            <div className="flex flex-col items-center py-12">
              <div
                className="mb-4 rounded-full p-4"
                style={{ backgroundColor: "rgba(239, 68, 68, 0.15)" }}
              >
                <svg
                  className="h-8 w-8 text-danger"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-fg-primary">Upload Failed</h3>
              <p className="text-center text-fg-muted">{errorMessage}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
          {step === "select" && (
            <button onClick={handleClose} className="btn-secondary">
              Cancel
            </button>
          )}

          {step === "preview" && (
            <>
              <button onClick={resetState} className="btn-secondary">
                Choose Different File
              </button>
              <button onClick={handleUpload} className="linear-btn-primary">
                Upload {preview?.summary.total.toLocaleString()} POs
              </button>
            </>
          )}

          {step === "uploading" && (
            <>
              <button onClick={resetState} className="btn-secondary">
                Back to Uploads
              </button>
              <button disabled className="btn-secondary cursor-not-allowed opacity-50">
                Processing...
              </button>
            </>
          )}

          {step === "complete" && (
            <>
              {viewingJobId && (
                <button
                  onClick={() => {
                    removeActiveUpload(viewingJobId);
                    resetState();
                  }}
                  className="btn-secondary"
                >
                  Clear & New Upload
                </button>
              )}
              <button onClick={handleClose} className="linear-btn-primary">
                Done
              </button>
            </>
          )}

          {step === "error" && (
            <>
              <button onClick={handleClose} className="btn-secondary">
                Close
              </button>
              <button onClick={resetState} className="linear-btn-primary">
                Try Again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
