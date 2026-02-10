"use client";

import { useRef, useLayoutEffect, useEffect, useCallback } from "react";
import { Upload } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import gsap from "gsap";

interface UploadFABProps {
  /** Hide the FAB (used when showing empty state) */
  hidden?: boolean;
}

export function UploadFAB({ hidden = false }: UploadFABProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hasAnimatedRef = useRef(false);
  const pollingRef = useRef<Set<string>>(new Set());
  const openUploadModal = useUIStore((state) => state.openUploadModal);
  const activeUploads = useUIStore((state) => state.activeUploads);
  const updateActiveUpload = useUIStore((state) => state.updateActiveUpload);
  const removeActiveUpload = useUIStore((state) => state.removeActiveUpload);

  const processingCount = activeUploads.filter(
    (u) => u.status === "uploading" || u.status === "processing"
  ).length;

  // Poll job status
  const pollJobStatus = useCallback(
    async (jobId: string) => {
      // Don't poll temp IDs - they're placeholders until we get the real jobId
      if (jobId.startsWith("temp-")) return;

      if (pollingRef.current.has(jobId)) return;
      pollingRef.current.add(jobId);

      try {
        const response = await fetch(`/api/upload/jobs/${jobId}`);
        if (!response.ok) {
          // Job not found - just stop polling, don't remove from store
          // The UploadModal manages the upload lifecycle
          pollingRef.current.delete(jobId);
          return;
        }

        const data = await response.json();
        const job = data.data;

        if (job.status === "complete") {
          updateActiveUpload(jobId, {
            status: "complete",
            progress: job.progress,
            result: job.result,
          });
          pollingRef.current.delete(jobId);
        } else if (job.status === "error") {
          updateActiveUpload(jobId, {
            status: "error",
            progress: job.progress,
            error: job.error,
          });
          pollingRef.current.delete(jobId);
        } else {
          // Still processing, update progress and continue polling
          updateActiveUpload(jobId, {
            status: "processing",
            progress: job.progress,
          });

          // Poll again after 1 second
          setTimeout(() => {
            pollingRef.current.delete(jobId);
            pollJobStatus(jobId);
          }, 1000);
        }
      } catch {
        // On error, stop polling but keep in store
        pollingRef.current.delete(jobId);
      }
    },
    [updateActiveUpload, removeActiveUpload]
  );

  // Resume polling for restored uploads on mount
  useEffect(() => {
    const processingUploads = activeUploads.filter(
      (u) => u.status === "uploading" || u.status === "processing"
    );

    for (const upload of processingUploads) {
      if (!pollingRef.current.has(upload.jobId)) {
        pollJobStatus(upload.jobId);
      }
    }
  }, [activeUploads, pollJobStatus]);

  // Animate in when becoming visible
  useLayoutEffect(() => {
    if (!buttonRef.current) return;

    if (hidden) {
      gsap.set(buttonRef.current, { scale: 0, opacity: 0 });
      hasAnimatedRef.current = false;
    } else if (!hasAnimatedRef.current) {
      gsap.fromTo(
        buttonRef.current,
        { scale: 0, opacity: 0 },
        {
          scale: 1,
          opacity: 1,
          duration: 0.5,
          ease: "back.out(1.7)",
          delay: 0.3,
        }
      );
      hasAnimatedRef.current = true;
    }
  }, [hidden]);

  const handleClick = () => {
    openUploadModal();
  };

  return (
    <button
      ref={buttonRef}
      onClick={handleClick}
      className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl active:scale-95 ${
        processingCount > 0 ? "animate-pulse-slow" : ""
      } ${hidden ? "pointer-events-none" : ""}`}
      style={{
        background: "rgba(255, 255, 255, 0.95)",
        boxShadow: "0 4px 20px rgba(255, 255, 255, 0.15)",
      }}
      title={processingCount > 0 ? `${processingCount} upload(s) in progress` : "Upload POs"}
    >
      <Upload className="h-6 w-6 text-black" />

      {/* Badge for active uploads count */}
      {processingCount > 0 && (
        <span
          className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-xs font-bold text-black"
          style={{
            boxShadow: "0 2px 8px rgba(255, 255, 255, 0.3)",
            border: "1px solid rgba(0, 0, 0, 0.1)",
          }}
        >
          {processingCount}
        </span>
      )}
    </button>
  );
}
