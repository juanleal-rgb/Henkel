"use client";

/**
 * AnimatedColumn - GSAP-powered column width animation
 *
 * Animates column width from 0 to target width (and back)
 * with support for staggered animations across multiple columns.
 *
 * @example
 * <AnimatedColumn show={isExpanded} width={130}>
 *   Carrier
 * </AnimatedColumn>
 * <AnimatedColumn show={isExpanded} width={100} staggerDelay={0.05}>
 *   Status
 * </AnimatedColumn>
 */

import { useRef, useLayoutEffect, useState, type ReactNode, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { gsap, GSAP_SPRING } from "./gsapConfig";

export interface AnimatedColumnProps {
  /** Controls visibility of the column */
  show: boolean;
  /** Target width in pixels when visible */
  width: number;
  /** Delay before animation starts (for stagger effect) */
  staggerDelay?: number;
  /** Animation duration in seconds (default: 0.4) */
  duration?: number;
  /** GSAP easing function (default: "spring") */
  ease?: string;
  /** Additional CSS classes */
  className?: string;
  /** Column content */
  children: ReactNode;
  /** Callback when animation completes */
  onTransitionComplete?: () => void;
}

export function AnimatedColumn({
  show,
  width,
  staggerDelay = 0,
  duration = 0.5,
  ease = "power2.inOut",
  className,
  children,
  onTransitionComplete,
}: AnimatedColumnProps) {
  const columnRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);
  const [shouldRender, setShouldRender] = useState(show);

  useLayoutEffect(() => {
    const column = columnRef.current;
    if (!column) return;

    // On first render, set initial state without animation
    if (isFirstRender.current) {
      isFirstRender.current = false;
      if (!show) {
        gsap.set(column, {
          width: 0,
          opacity: 0,
          overflow: "hidden",
        });
      } else {
        gsap.set(column, {
          width: width,
          opacity: 1,
          overflow: "hidden",
        });
      }
      return;
    }

    // Animate to new state
    if (show) {
      // Show the element first
      setShouldRender(true);

      gsap.to(column, {
        width: width,
        opacity: 1,
        duration,
        ease,
        delay: staggerDelay,
        onComplete: onTransitionComplete,
      });
    } else {
      // Animate out, then hide
      gsap.to(column, {
        width: 0,
        opacity: 0,
        duration,
        ease,
        delay: staggerDelay,
        onComplete: () => {
          setShouldRender(false);
          onTransitionComplete?.();
        },
      });
    }
  }, [show, width, duration, ease, staggerDelay, onTransitionComplete]);

  // Update shouldRender when show changes (for initial state)
  useLayoutEffect(() => {
    if (show && !shouldRender) {
      setShouldRender(true);
    }
  }, [show, shouldRender]);

  if (!shouldRender && !show) {
    return null;
  }

  return (
    <div
      ref={columnRef}
      className={cn("shrink-0 overflow-hidden whitespace-nowrap", className)}
      style={{ willChange: "width, opacity" } as CSSProperties}
    >
      {children}
    </div>
  );
}

// ============================================
// AnimatedColumnGroup - For coordinated stagger
// ============================================

export interface AnimatedColumnGroupProps {
  /** Controls visibility of all columns */
  show: boolean;
  /** Stagger delay between columns (default: 0.05) */
  stagger?: number;
  /** Animation duration for each column (default: 0.4) */
  duration?: number;
  /** GSAP easing function (default: "spring") */
  ease?: string;
  /** Additional CSS classes for the group container */
  className?: string;
  /** AnimatedColumn children */
  children: ReactNode;
}

/**
 * AnimatedColumnGroup - Wrapper for coordinated column animations
 *
 * Automatically applies staggered delays to child AnimatedColumn components.
 * Use this when you want columns to animate in sequence.
 *
 * @example
 * <AnimatedColumnGroup show={isExpanded} stagger={0.05}>
 *   <AnimatedColumn width={130}>Carrier</AnimatedColumn>
 *   <AnimatedColumn width={100}>Status</AnimatedColumn>
 *   <AnimatedColumn width={100}>Value</AnimatedColumn>
 * </AnimatedColumnGroup>
 */
export function AnimatedColumnGroup({
  show,
  stagger = 0.05,
  duration = 0.5,
  ease = "power2.inOut",
  className,
  children,
}: AnimatedColumnGroupProps) {
  const groupRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group || isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const columns = group.querySelectorAll("[data-animated-column]");
    if (columns.length === 0) return;

    if (show) {
      gsap.to(columns, {
        width: (i, el) => el.dataset.targetWidth || 100,
        opacity: 1,
        duration,
        ease,
        stagger: stagger,
      });
    } else {
      gsap.to(columns, {
        width: 0,
        opacity: 0,
        duration,
        ease,
        stagger: stagger,
      });
    }
  }, [show, stagger, duration, ease]);

  return (
    <div ref={groupRef} className={cn("contents", className)}>
      {children}
    </div>
  );
}
