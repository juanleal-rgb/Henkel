"use client";

import { memo, useRef, useImperativeHandle, forwardRef, useCallback } from "react";
import type { SankeyLinkProps } from "./sankey-types";
import { getStageColors } from "../pipeline-types";
import gsap from "gsap";

export interface SankeyLinkRef {
  animateFlow: () => void;
}

/**
 * SankeyLink - Animated flow path between two stages
 * Uses gradient fill from source to target color
 * Supports flow pulse animation via ref
 */
export const SankeyLink = memo(
  forwardRef<SankeyLinkRef, SankeyLinkProps>(function SankeyLink(
    {
      link,
      isHovered,
      isDimmed,
      isOutcomeFlow = false,
      theme = "dark",
      onClick,
      onMouseEnter,
      onMouseLeave,
    },
    ref
  ) {
    const pulseRef = useRef<SVGPathElement>(null);
    const stageColorMap = getStageColors(theme);
    const sourceColors = stageColorMap[link.source];
    const targetColors = stageColorMap[link.target];

    // Gradient IDs for this link
    const gradientId = `link-gradient-${link.source}-${link.target}`;
    const pulseGradientId = `pulse-gradient-${link.source}-${link.target}`;

    // Opacity based on state - better visibility
    const baseOpacity = isOutcomeFlow ? 0.55 : 0.65;
    const opacity = isDimmed ? baseOpacity * 0.5 : isHovered ? baseOpacity * 1.3 : baseOpacity;

    // Flow pulse animation
    const animateFlow = useCallback(() => {
      if (!pulseRef.current) return;

      const pulse = pulseRef.current;

      // Reset and animate
      gsap.killTweensOf(pulse);
      gsap.set(pulse, { opacity: 0, strokeDashoffset: "100%" });

      gsap
        .timeline()
        .to(pulse, {
          opacity: 0.9,
          duration: 0.15,
          ease: "power2.in",
        })
        .to(
          pulse,
          {
            strokeDashoffset: "0%",
            duration: 0.6,
            ease: "power2.out",
          },
          0
        )
        .to(pulse, {
          opacity: 0,
          duration: 0.3,
          ease: "power2.out",
        });
    }, []);

    // Expose animateFlow via ref
    useImperativeHandle(ref, () => ({ animateFlow }), [animateFlow]);

    return (
      <g data-sankey-link={link.id}>
        {/* Gradient definitions */}
        <defs>
          {/* Main fill gradient */}
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={sourceColors.accent} stopOpacity={0.9} />
            <stop offset="100%" stopColor={targetColors.accent} stopOpacity={0.9} />
          </linearGradient>
          {/* Pulse gradient - brighter */}
          <linearGradient id={pulseGradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={sourceColors.accent} />
            <stop offset="50%" stopColor="#ffffff" />
            <stop offset="100%" stopColor={targetColors.accent} />
          </linearGradient>
        </defs>

        {/* Main flow path - no stroke, just gradient fill */}
        <path
          d={link.path}
          fill={`url(#${gradientId})`}
          fillOpacity={opacity}
          className={onClick ? "cursor-pointer" : ""}
          onClick={onClick}
          onMouseEnter={(e) => onMouseEnter(e)}
          onMouseLeave={onMouseLeave}
        />

        {/* Animated pulse overlay (stroke-based for smooth travel) */}
        <path
          ref={pulseRef}
          d={link.path}
          fill="none"
          stroke={`url(#${pulseGradientId})`}
          strokeWidth={Math.max(link.width * 0.6, 4)}
          strokeLinecap="round"
          strokeDasharray="100%"
          strokeDashoffset="100%"
          opacity={0}
          pointerEvents="none"
        />
      </g>
    );
  })
);

/**
 * SankeyOutcomeFlow - Downward flow to outcome stages (COMPLETED/FAILED/PARTIAL)
 * Slightly different styling to differentiate from main flows
 */
export const SankeyOutcomeFlow = memo(function SankeyOutcomeFlow({
  link,
  isHovered,
  isDimmed,
  theme = "dark",
  onMouseEnter,
  onMouseLeave,
}: Omit<SankeyLinkProps, "onClick" | "isOutcomeFlow">) {
  const stageColorMap = getStageColors(theme);
  const sourceColors = stageColorMap[link.source];
  const targetColors = stageColorMap[link.target];

  const gradientId = `outcome-gradient-${link.source}-${link.target}`;
  const opacity = isDimmed ? 0.25 : isHovered ? 0.65 : 0.45;

  return (
    <g data-sankey-outcome={`${link.source}-${link.target}`}>
      {/* Gradient definition - horizontal (left to right) */}
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={sourceColors.accent} stopOpacity={0.6} />
          <stop offset="100%" stopColor={targetColors.accent} stopOpacity={0.8} />
        </linearGradient>
      </defs>

      {/* Outcome flow path - no stroke, just gradient fill */}
      <path
        d={link.path}
        fill={`url(#${gradientId})`}
        fillOpacity={opacity}
        onMouseEnter={(e) => onMouseEnter(e)}
        onMouseLeave={onMouseLeave}
      />
    </g>
  );
});

export default SankeyLink;
