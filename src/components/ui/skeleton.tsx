"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Base Skeleton component for loading states
 * Uses animate-pulse with theme-aware background via CSS variables
 */
const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("animate-pulse rounded-md bg-[var(--skeleton-bg)]", className)}
      {...props}
    />
  )
);
Skeleton.displayName = "Skeleton";

/**
 * Text line skeleton - for paragraphs and labels
 */
const SkeletonText = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    width?: string | number;
  }
>(({ className, width, style, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("h-4 animate-pulse rounded bg-[var(--skeleton-bg)]", className)}
    style={{ width: width ?? "100%", ...style }}
    {...props}
  />
));
SkeletonText.displayName = "SkeletonText";

/**
 * Card skeleton - for card placeholders
 */
const SkeletonCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "animate-pulse rounded-xl border border-[var(--skeleton-border)] bg-[var(--skeleton-bg)] p-5",
        className
      )}
      {...props}
    />
  )
);
SkeletonCard.displayName = "SkeletonCard";

/**
 * Circle skeleton - for avatars and icons
 */
const SkeletonCircle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    size?: number;
  }
>(({ className, size = 40, style, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("animate-pulse rounded-full bg-[var(--skeleton-bg)]", className)}
    style={{ width: size, height: size, ...style }}
    {...props}
  />
));
SkeletonCircle.displayName = "SkeletonCircle";

export { Skeleton, SkeletonText, SkeletonCard, SkeletonCircle };
