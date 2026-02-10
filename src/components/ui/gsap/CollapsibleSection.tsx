"use client";

/**
 * CollapsibleSection - GSAP-powered height collapse/expand
 *
 * Smoothly animates height from 0 to auto (and back) with
 * opacity fade for a polished reveal effect.
 *
 * @example
 * <CollapsibleSection isOpen={isTableExpanded}>
 *   <FilterControls />
 * </CollapsibleSection>
 */

import { useRef, useLayoutEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { gsap, GSAP_SMOOTH } from "./gsapConfig";

export interface CollapsibleSectionProps {
  /** Controls whether the section is expanded or collapsed */
  isOpen: boolean;
  /** Animation duration in seconds (default: 0.3) */
  duration?: number;
  /** GSAP easing function (default: "power2.out") */
  ease?: string;
  /** Include opacity animation (default: true) */
  includeOpacity?: boolean;
  /** Additional margin-top when open (default: 12) */
  openMarginTop?: number;
  /** Additional CSS classes */
  className?: string;
  /** Content to show/hide */
  children: ReactNode;
  /** Callback when animation completes */
  onTransitionComplete?: () => void;
}

export function CollapsibleSection({
  isOpen,
  duration = 0.5,
  ease = "power2.inOut",
  includeOpacity = true,
  openMarginTop = 12,
  className,
  children,
  onTransitionComplete,
}: CollapsibleSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    // On first render, set initial state without animation
    if (isFirstRender.current) {
      isFirstRender.current = false;
      if (!isOpen) {
        gsap.set(container, {
          height: 0,
          opacity: includeOpacity ? 0 : 1,
          marginTop: 0,
          overflow: "hidden",
        });
      } else {
        gsap.set(container, {
          height: "auto",
          opacity: 1,
          marginTop: openMarginTop,
          overflow: "visible",
        });
      }
      return;
    }

    // Animate to new state
    if (isOpen) {
      // Expanding: first set overflow hidden, then animate, then set overflow visible
      gsap.set(container, { overflow: "hidden" });

      // Measure the natural height
      const naturalHeight = content.offsetHeight;

      gsap.to(container, {
        height: naturalHeight,
        opacity: includeOpacity ? 1 : undefined,
        marginTop: openMarginTop,
        duration,
        ease,
        onComplete: () => {
          // After animation, set to auto for responsive content
          gsap.set(container, { height: "auto", overflow: "visible" });
          onTransitionComplete?.();
        },
      });
    } else {
      // Collapsing: animate to 0
      gsap.set(container, { overflow: "hidden" });

      gsap.to(container, {
        height: 0,
        opacity: includeOpacity ? 0 : undefined,
        marginTop: 0,
        duration,
        ease,
        onComplete: onTransitionComplete,
      });
    }
  }, [isOpen, duration, ease, includeOpacity, openMarginTop, onTransitionComplete]);

  return (
    <div ref={containerRef} className={className}>
      <div ref={contentRef}>{children}</div>
    </div>
  );
}
