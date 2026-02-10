"use client";

/**
 * ExpandableGrid - GSAP Flip-powered expandable grid layout
 *
 * Uses the FLIP technique (First, Last, Invert, Play) to smoothly animate
 * CSS Grid layout changes. The grid-column property doesn't animate natively,
 * so Flip captures positions before/after and animates the transform.
 *
 * @example
 * const gridRef = useRef<ExpandableGridRef>(null);
 *
 * const handleExpand = () => {
 *   gridRef.current?.captureState(); // Capture BEFORE state change
 *   setIsExpanded(true);
 * };
 *
 * <ExpandableGrid ref={gridRef} isExpanded={isExpanded} columns={4}>
 *   <ExpandableGridItem collapsedSpan={3} expandedSpan={2}>
 *     <MapComponent />
 *   </ExpandableGridItem>
 *   <ExpandableGridItem collapsedSpan={1} expandedSpan={2}>
 *     <TableComponent />
 *   </ExpandableGridItem>
 * </ExpandableGrid>
 */

import {
  createContext,
  useContext,
  useRef,
  useLayoutEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
  type ReactNode,
  type RefObject,
} from "react";
import { cn } from "@/lib/utils";
import { Flip, FLIP_DEFAULTS } from "./gsapConfig";

// ============================================
// Types
// ============================================

export interface ExpandableGridRef {
  /** Capture the current state of grid items BEFORE changing isExpanded */
  captureState: () => void;
}

interface ExpandableGridContextValue {
  isExpanded: boolean;
  gridRef: RefObject<HTMLDivElement | null>;
}

// ============================================
// Context
// ============================================

const ExpandableGridContext = createContext<ExpandableGridContextValue | null>(null);

export function useExpandableGrid() {
  const context = useContext(ExpandableGridContext);
  if (!context) {
    throw new Error("useExpandableGrid must be used within an ExpandableGrid");
  }
  return context;
}

// ============================================
// ExpandableGrid Component
// ============================================

export interface ExpandableGridProps {
  /** Controls the expanded/collapsed state */
  isExpanded: boolean;
  /** Number of grid columns (default: 4) */
  columns?: number;
  /** Gap between grid items in pixels (default: 16) */
  gap?: number;
  /** Additional CSS classes */
  className?: string;
  /** Grid items (should be ExpandableGridItem components) */
  children: ReactNode;
  /** Animation duration in seconds (default: 0.6) */
  duration?: number;
  /** Callback when animation completes */
  onTransitionComplete?: () => void;
}

export const ExpandableGrid = forwardRef<ExpandableGridRef, ExpandableGridProps>(
  function ExpandableGrid(
    {
      isExpanded,
      columns = 4,
      gap = 16,
      className,
      children,
      duration = 0.6,
      onTransitionComplete,
    },
    ref
  ) {
    const gridRef = useRef<HTMLDivElement>(null);
    const flipStateRef = useRef<Flip.FlipState | null>(null);
    const isFirstRender = useRef(true);

    // Expose captureState method via ref
    const captureState = useCallback(() => {
      if (!gridRef.current) return;
      const items = gridRef.current.querySelectorAll("[data-flip-id]");
      if (items.length > 0) {
        flipStateRef.current = Flip.getState(items);
      }
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        captureState,
      }),
      [captureState]
    );

    // Animate AFTER the DOM updates (grid-column changes)
    useLayoutEffect(() => {
      // Skip first render
      if (isFirstRender.current) {
        isFirstRender.current = false;
        return;
      }

      // Skip if no state was captured
      if (!flipStateRef.current || !gridRef.current) return;

      const items = gridRef.current.querySelectorAll("[data-flip-id]");
      if (items.length === 0) return;

      // Animate from captured state to new state
      Flip.from(flipStateRef.current, {
        ...FLIP_DEFAULTS,
        duration,
        targets: items,
        onComplete: () => {
          flipStateRef.current = null;
          onTransitionComplete?.();
        },
      });
    }, [isExpanded, duration, onTransitionComplete]);

    const contextValue: ExpandableGridContextValue = {
      isExpanded,
      gridRef,
    };

    return (
      <ExpandableGridContext.Provider value={contextValue}>
        <div
          ref={gridRef}
          className={cn("relative grid h-full min-h-0", className)}
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gridTemplateRows: "minmax(0, 1fr)",
            gap: `${gap}px`,
          }}
        >
          {children}
        </div>
      </ExpandableGridContext.Provider>
    );
  }
);
