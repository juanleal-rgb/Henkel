"use client";

/**
 * ExpandableGridItem - Grid item with animated column span
 *
 * Works with ExpandableGrid to animate between different column spans
 * using GSAP Flip for smooth FLIP-based animations.
 *
 * @example
 * <ExpandableGridItem
 *   collapsedSpan={3}
 *   expandedSpan={2}
 *   className="rounded-xl"
 * >
 *   <MapComponent />
 * </ExpandableGridItem>
 */

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useExpandableGrid } from "./ExpandableGrid";

export interface ExpandableGridItemProps {
  /** Number of columns to span when collapsed */
  collapsedSpan: number;
  /** Number of columns to span when expanded */
  expandedSpan: number;
  /** Additional CSS classes */
  className?: string;
  /** Content to render inside the grid item */
  children: ReactNode;
  /** Mouse enter handler (for hover-to-expand) */
  onMouseEnter?: () => void;
  /** Mouse leave handler (for hover-to-expand) */
  onMouseLeave?: () => void;
}

export function ExpandableGridItem({
  collapsedSpan,
  expandedSpan,
  className,
  children,
  onMouseEnter,
  onMouseLeave,
}: ExpandableGridItemProps) {
  const { isExpanded } = useExpandableGrid();
  const flipId = useId();
  const currentSpan = isExpanded ? expandedSpan : collapsedSpan;

  return (
    <div
      data-flip-id={flipId}
      className={cn("h-full min-h-0 min-w-0", className)}
      style={{
        gridColumn: `span ${currentSpan} / span ${currentSpan}`,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  );
}
