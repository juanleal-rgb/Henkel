"use client";

/**
 * GSAP Animation Hooks - Legacy utilities
 *
 * Note: For new code, prefer using the component-based approach:
 * - ExpandableGrid / ExpandableGridItem for layout animations
 * - CollapsibleSection for height animations
 * - AnimatedColumn for width animations
 *
 * These hooks are kept for backward compatibility and advanced use cases.
 */

import { useRef, useEffect, useCallback } from "react";
import gsap from "gsap";

/**
 * Hook for enter/exit animations (replaces AnimatePresence)
 * Use for elements that mount/unmount
 */
export function useEnterExitAnimation<T extends HTMLElement>(
  isVisible: boolean,
  options: {
    enterFrom?: gsap.TweenVars;
    enterTo?: gsap.TweenVars;
    exitTo?: gsap.TweenVars;
    duration?: number;
    ease?: string;
    onExitComplete?: () => void;
  } = {}
) {
  const ref = useRef<T>(null);
  const isFirstRender = useRef(true);

  const {
    enterFrom = { opacity: 0, height: 0 },
    enterTo = { opacity: 1, height: "auto" },
    exitTo = { opacity: 0, height: 0 },
    duration = 0.3,
    ease = "power2.out",
    onExitComplete,
  } = options;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (isFirstRender.current) {
      isFirstRender.current = false;
      if (isVisible) {
        gsap.set(element, enterTo);
      }
      return;
    }

    if (isVisible) {
      // Enter animation
      gsap.fromTo(element, enterFrom, {
        ...enterTo,
        duration,
        ease,
      });
    } else {
      // Exit animation
      gsap.to(element, {
        ...exitTo,
        duration,
        ease,
        onComplete: onExitComplete,
      });
    }
  }, [isVisible, duration, ease]);

  return ref;
}

/**
 * Hook for layout animations (replaces motion layout prop)
 * Uses GSAP Flip plugin for FLIP animations
 *
 * @deprecated Use ExpandableGrid component instead for better React integration
 */
export function useLayoutAnimation<T extends HTMLElement>(
  dependencies: unknown[],
  options: {
    duration?: number;
    ease?: string;
  } = {}
) {
  const ref = useRef<T>(null);
  const flipStateRef = useRef<unknown>(null);

  const { duration = 0.6, ease = "elastic.out(1, 0.5)" } = options;

  // Capture state before changes
  const captureState = useCallback(() => {
    if (ref.current && typeof window !== "undefined") {
      // Dynamically import Flip to avoid SSR issues
      import("gsap/Flip").then(({ Flip }) => {
        flipStateRef.current = Flip.getState(ref.current, {
          props: "width,height,padding,margin",
        });
      });
    }
  }, []);

  // Animate from captured state to new state
  const animateLayout = useCallback(() => {
    if (ref.current && flipStateRef.current && typeof window !== "undefined") {
      import("gsap/Flip").then(({ Flip }) => {
        // Cast to any to bypass TypeScript strict checking for legacy deprecated code
        Flip.from(flipStateRef.current as Parameters<typeof Flip.from>[0], {
          duration,
          ease,
          targets: ref.current,
        });
      });
    }
  }, [duration, ease]);

  // Auto-animate on dependency changes
  useEffect(() => {
    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      animateLayout();
    });

    // Capture state for next change
    return () => {
      captureState();
    };
  }, dependencies);

  // Initial capture
  useEffect(() => {
    captureState();
  }, [captureState]);

  return { ref, captureState, animateLayout };
}

/**
 * Hook for width/height animations (replaces motion animate prop)
 * Good for collapsible sections, expanding panels
 *
 * @deprecated Use CollapsibleSection or AnimatedColumn components instead
 */
export function useExpandAnimation<T extends HTMLElement>(
  isExpanded: boolean,
  options: {
    expandedWidth?: number | string;
    collapsedWidth?: number | string;
    expandedHeight?: number | string;
    collapsedHeight?: number | string;
    duration?: number;
    ease?: string;
    includeOpacity?: boolean;
  } = {}
) {
  const ref = useRef<T>(null);

  const {
    expandedWidth,
    collapsedWidth,
    expandedHeight,
    collapsedHeight,
    duration = 0.4,
    ease = "power2.out",
    includeOpacity = true,
  } = options;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const target: gsap.TweenVars = { duration, ease };

    if (expandedWidth !== undefined && collapsedWidth !== undefined) {
      target.width = isExpanded ? expandedWidth : collapsedWidth;
    }

    if (expandedHeight !== undefined && collapsedHeight !== undefined) {
      target.height = isExpanded ? expandedHeight : collapsedHeight;
    }

    if (includeOpacity && (collapsedWidth === 0 || collapsedHeight === 0)) {
      target.opacity = isExpanded ? 1 : 0;
    }

    gsap.to(element, target);
  }, [
    isExpanded,
    expandedWidth,
    collapsedWidth,
    expandedHeight,
    collapsedHeight,
    duration,
    ease,
    includeOpacity,
  ]);

  return ref;
}

/**
 * Hook for staggered list animations
 * Good for table rows, list items
 */
export function useStaggerAnimation<T extends HTMLElement>(
  items: unknown[],
  options: {
    stagger?: number;
    from?: gsap.TweenVars;
    to?: gsap.TweenVars;
    duration?: number;
    ease?: string;
  } = {}
) {
  const containerRef = useRef<T>(null);

  const {
    stagger = 0.05,
    from = { opacity: 0, y: 20 },
    to = { opacity: 1, y: 0 },
    duration = 0.3,
    ease = "power2.out",
  } = options;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const children = container.children;
    if (children.length === 0) return;

    gsap.fromTo(children, from, {
      ...to,
      duration,
      ease,
      stagger,
    });
  }, [items.length, stagger, duration, ease]);

  return containerRef;
}

/**
 * Utility function for one-off animations
 */
export function animateElement(
  element: HTMLElement | null,
  to: gsap.TweenVars,
  options: { from?: gsap.TweenVars } = {}
) {
  if (!element) return;

  if (options.from) {
    return gsap.fromTo(element, options.from, to);
  }
  return gsap.to(element, to);
}

/**
 * Timeline factory for complex sequences
 */
export function createAnimationTimeline(options?: gsap.TimelineVars) {
  return gsap.timeline(options);
}
