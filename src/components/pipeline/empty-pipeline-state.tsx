"use client";

import { useRef, useLayoutEffect } from "react";
import { Upload, FileSpreadsheet, ArrowRight } from "lucide-react";
import gsap from "gsap";
import { useUIStore } from "@/stores/ui-store";

interface EmptyPipelineStateProps {
  onUploadClick?: () => void;
}

/**
 * Empty state shown when no POs have been uploaded yet.
 * Features a pipeline illustration and CTA to upload.
 */
export function EmptyPipelineState({ onUploadClick }: EmptyPipelineStateProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAnimatedRef = useRef(false);
  const { openUploadModal } = useUIStore();

  const handleUploadClick = () => {
    if (onUploadClick) {
      onUploadClick();
    } else {
      openUploadModal();
    }
  };

  // Entry animation
  useLayoutEffect(() => {
    if (!containerRef.current || hasAnimatedRef.current) return;

    hasAnimatedRef.current = true;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline();

      // Set initial states
      gsap.set(".empty-state-icon", { scale: 0, opacity: 0 });
      gsap.set(".empty-state-node", { scale: 0, opacity: 0 });
      gsap.set(".empty-state-arrow", { scaleX: 0, opacity: 0, transformOrigin: "left center" });
      gsap.set(".empty-state-text", { y: 20, opacity: 0 });
      gsap.set(".empty-state-button", { scale: 0.8, opacity: 0 });

      // Animate in
      tl.to(".empty-state-icon", {
        scale: 1,
        opacity: 1,
        duration: 0.5,
        ease: "back.out(1.7)",
      })
        .to(
          ".empty-state-node",
          {
            scale: 1,
            opacity: 1,
            duration: 0.4,
            stagger: 0.1,
            ease: "back.out(1.5)",
          },
          "-=0.2"
        )
        .to(
          ".empty-state-arrow",
          {
            scaleX: 1,
            opacity: 1,
            duration: 0.3,
            stagger: 0.08,
            ease: "power2.out",
          },
          "-=0.3"
        )
        .to(
          ".empty-state-text",
          {
            y: 0,
            opacity: 1,
            duration: 0.4,
            stagger: 0.1,
            ease: "power2.out",
          },
          "-=0.2"
        )
        .to(
          ".empty-state-button",
          {
            scale: 1,
            opacity: 1,
            duration: 0.4,
            ease: "back.out(1.7)",
          },
          "-=0.2"
        );
    }, containerRef);

    return () => ctx.revert();
  }, []);

  // Empty state
  return (
    <div
      ref={containerRef}
      className="flex h-full w-full flex-col items-center justify-center gap-8 p-8"
    >
      {/* Pipeline Illustration */}
      <div className="flex flex-col items-center gap-6">
        {/* File Icon */}
        <div className="empty-state-icon flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-dashed border-border-subtle bg-glass-bg">
          <FileSpreadsheet className="h-10 w-10 text-fg-muted" strokeWidth={1.5} />
        </div>

        {/* Mini Pipeline Diagram */}
        <div className="flex items-center gap-2">
          {/* Node 1 - Queued */}
          <div className="empty-state-node flex h-10 w-10 items-center justify-center rounded-lg border border-border-subtle bg-glass-bg">
            <div className="h-3 w-3 rounded-full bg-white/20" />
          </div>

          {/* Arrow */}
          <div className="empty-state-arrow flex items-center">
            <div className="h-[2px] w-6 bg-border-subtle" />
            <ArrowRight className="-ml-1 h-4 w-4 text-fg-disabled" />
          </div>

          {/* Node 2 - In Progress */}
          <div className="empty-state-node flex h-10 w-10 items-center justify-center rounded-lg border border-border-subtle bg-glass-bg">
            <div className="h-3 w-3 rounded-full bg-white/55" />
          </div>

          {/* Arrow */}
          <div className="empty-state-arrow flex items-center">
            <div className="h-[2px] w-6 bg-border-subtle" />
            <ArrowRight className="-ml-1 h-4 w-4 text-fg-disabled" />
          </div>

          {/* Node 3 - Completed */}
          <div className="empty-state-node flex h-10 w-10 items-center justify-center rounded-lg border border-border-subtle bg-glass-bg">
            <div className="h-3 w-3 rounded-full bg-white/75" />
          </div>
        </div>
      </div>

      {/* Text Content */}
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 className="empty-state-text text-[20px] font-semibold text-fg-primary">
          No purchase orders yet
        </h2>
        <p className="empty-state-text max-w-md text-[14px] text-fg-muted">
          Upload an Excel file with your PO data to start the automated calling pipeline. We&apos;ll
          batch them by supplier and queue them for processing.
        </p>
      </div>

      {/* CTA Button */}
      <button
        onClick={handleUploadClick}
        className="empty-state-button group flex items-center gap-3 rounded-xl bg-white px-6 py-3 text-[14px] font-medium text-black shadow-lg transition-all hover:bg-white/90 hover:shadow-xl active:scale-[0.98]"
      >
        <Upload className="h-5 w-5 transition-transform group-hover:-translate-y-0.5" />
        Upload PO File
      </button>

      {/* Hint */}
      <p className="empty-state-text text-[12px] text-fg-disabled">
        Supports .xlsx files up to 50MB
      </p>
    </div>
  );
}
