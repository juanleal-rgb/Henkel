"use client";

import { useRef, useLayoutEffect, useCallback } from "react";
import gsap from "gsap";
import type { SankeyLayout, SankeyViewMode } from "./sankey-types";

interface UseSankeyAnimationOptions {
  layout: SankeyLayout;
  viewMode: SankeyViewMode;
  enabled?: boolean;
}

interface UseSankeyAnimationReturn {
  containerRef: React.RefObject<SVGGElement>;
  isAnimating: boolean;
  triggerEntryAnimation: () => void;
  triggerViewModeTransition: (newMode: SankeyViewMode) => void;
}

/**
 * GSAP animation orchestration for Sankey diagram
 * Handles entry animations and view mode transitions
 */
export function useSankeyAnimation({
  layout,
  viewMode: _viewMode,
  enabled = true,
}: UseSankeyAnimationOptions): UseSankeyAnimationReturn {
  const containerRef = useRef<SVGGElement>(null!);
  const isAnimatingRef = useRef(false);
  const hasAnimatedRef = useRef(false);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  /**
   * Entry animation sequence:
   * 1. Nodes fade in with scale (staggered left-to-right)
   * 2. Main flows draw in
   * 3. Lost flows fade in
   */
  const triggerEntryAnimation = useCallback(() => {
    if (!containerRef.current || !enabled || hasAnimatedRef.current) return;

    const container = containerRef.current;
    isAnimatingRef.current = true;
    hasAnimatedRef.current = true;

    // Kill any existing timeline
    if (timelineRef.current) {
      timelineRef.current.kill();
    }

    // Get elements
    const nodes = container.querySelectorAll("[data-sankey-node]");
    const links = container.querySelectorAll("[data-sankey-link]");
    const outcomeLinks = container.querySelectorAll("[data-sankey-outcome]");

    // Create timeline
    const tl = gsap.timeline({
      onComplete: () => {
        isAnimatingRef.current = false;
      },
    });

    // Set initial states (only if elements exist)
    if (nodes.length > 0) {
      gsap.set(nodes, { opacity: 0, scale: 0.8, transformOrigin: "center center" });
    }
    if (links.length > 0) {
      gsap.set(links, { opacity: 0 });
    }
    if (outcomeLinks.length > 0) {
      gsap.set(outcomeLinks, { opacity: 0 });
    }

    // 1. Animate nodes in (staggered, left-to-right)
    if (nodes.length > 0) {
      tl.to(nodes, {
        opacity: 1,
        scale: 1,
        duration: 0.4,
        stagger: 0.08,
        ease: "back.out(1.5)",
      });
    }

    // 2. Animate main flow links (fade in with slight delay)
    if (links.length > 0) {
      tl.to(
        links,
        {
          opacity: 1,
          duration: 0.5,
          stagger: 0.05,
          ease: "power2.out",
        },
        "-=0.2" // Overlap with node animation
      );
    }

    // 3. Animate outcome flow links
    if (outcomeLinks.length > 0) {
      tl.to(
        outcomeLinks,
        {
          opacity: 1,
          duration: 0.4,
          stagger: 0.03,
          ease: "power2.out",
        },
        "-=0.3"
      );
    }

    timelineRef.current = tl;
  }, [enabled]);

  /**
   * View mode transition animation
   * Smoothly animates between count and value view
   */
  const triggerViewModeTransition = useCallback(
    (_newMode: SankeyViewMode) => {
      if (!containerRef.current || !enabled) return;

      const container = containerRef.current;
      const nodes = container.querySelectorAll("[data-sankey-node]");
      const links = container.querySelectorAll("[data-sankey-link]");
      const outcomeLinks = container.querySelectorAll("[data-sankey-outcome]");

      // Collect all elements to animate, filtering out empty collections
      const elementsToAnimate: Element[] = [];
      nodes.forEach((el) => elementsToAnimate.push(el));
      links.forEach((el) => elementsToAnimate.push(el));
      outcomeLinks.forEach((el) => elementsToAnimate.push(el));

      // Only animate if we have elements
      if (elementsToAnimate.length > 0) {
        gsap.to(elementsToAnimate, {
          opacity: 0.6,
          duration: 0.15,
          ease: "power2.in",
          yoyo: true,
          repeat: 1,
        });
      }

      // Flash effect on value displays
      const valueTexts = container.querySelectorAll("text");
      if (valueTexts.length > 0) {
        gsap.to(valueTexts, {
          opacity: 0.5,
          duration: 0.1,
          ease: "power1.in",
          yoyo: true,
          repeat: 1,
        });
      }
    },
    [enabled]
  );

  // Run entry animation on mount
  useLayoutEffect(() => {
    if (layout.nodes.length > 0 && !hasAnimatedRef.current) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        triggerEntryAnimation();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [layout.nodes.length, triggerEntryAnimation]);

  // Cleanup on unmount
  useLayoutEffect(() => {
    return () => {
      if (timelineRef.current) {
        timelineRef.current.kill();
      }
    };
  }, []);

  return {
    containerRef,
    isAnimating: isAnimatingRef.current,
    triggerEntryAnimation,
    triggerViewModeTransition,
  };
}

/**
 * Hook for animating individual path elements
 * Used for draw-in effect on links
 */
export function usePathDrawAnimation(
  pathRef: React.RefObject<SVGPathElement | null>,
  enabled: boolean = true,
  delay: number = 0
) {
  useLayoutEffect(() => {
    if (!pathRef.current || !enabled) return;

    const path = pathRef.current;
    const length = path.getTotalLength();

    // Set initial state (path hidden)
    gsap.set(path, {
      strokeDasharray: length,
      strokeDashoffset: length,
    });

    // Animate to reveal
    gsap.to(path, {
      strokeDashoffset: 0,
      duration: 0.7,
      delay,
      ease: "power2.out",
    });
  }, [pathRef, enabled, delay]);
}

export default useSankeyAnimation;
