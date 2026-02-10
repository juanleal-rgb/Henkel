"use client";

/**
 * GSAP Configuration & Plugin Registration
 *
 * This module handles GSAP plugin registration and provides
 * standardized animation configurations for the application.
 */

import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { CustomEase } from "gsap/CustomEase";

// Register plugins immediately (not async)
if (typeof window !== "undefined") {
  gsap.registerPlugin(Flip, CustomEase);
}

// Track initialization state for custom eases
let easesInitialized = false;

/**
 * Initialize custom easing curves
 * Call this once at app startup (e.g., in GSAPProvider)
 */
export function initGSAP(): void {
  if (typeof window === "undefined" || easesInitialized) return;

  // Create custom spring easing that matches Framer Motion's
  // { type: "spring", stiffness: 100, damping: 20 }
  CustomEase.create("spring", "M0,0 C0.12,0.72 0.29,1.04 0.45,1.05 0.65,1.07 0.78,1 1,1");

  // Additional spring variants
  CustomEase.create("springBouncy", "M0,0 C0.1,0.9 0.2,1.15 0.35,1.1 0.5,1.05 0.75,1 1,1");

  CustomEase.create("springStiff", "M0,0 C0.22,0.61 0.35,1 0.5,1 0.65,1 0.78,1 1,1");

  easesInitialized = true;
  console.log("[GSAP] Initialized with Flip, CustomEase plugins");
}

/**
 * Check if GSAP eases have been initialized
 */
export function isGSAPInitialized(): boolean {
  return easesInitialized;
}

// ============================================
// Animation Configuration Presets
// ============================================

/**
 * Spring-like animation (matches Framer Motion spring config)
 * Use for layout transitions, expanding/collapsing
 */
export const GSAP_SPRING = {
  duration: 0.6,
  ease: "spring",
} as const;

/**
 * Smooth, quick animation
 * Use for opacity fades, simple transitions
 */
export const GSAP_SMOOTH = {
  duration: 0.3,
  ease: "power2.out",
} as const;

/**
 * Snappy animation with slight overshoot
 * Use for button clicks, microinteractions
 */
export const GSAP_SNAPPY = {
  duration: 0.4,
  ease: "back.out(1.2)",
} as const;

/**
 * Fast animation for immediate feedback
 */
export const GSAP_FAST = {
  duration: 0.2,
  ease: "power2.out",
} as const;

// ============================================
// Flip Animation Defaults
// ============================================

/**
 * Default options for Flip.from() animations
 */
export const FLIP_DEFAULTS = {
  duration: 0.6,
  ease: "power2.inOut",
  scale: false,
  absolute: false,
} as const;

// ============================================
// Utility Types
// ============================================

export type GSAPConfig =
  | typeof GSAP_SPRING
  | typeof GSAP_SMOOTH
  | typeof GSAP_SNAPPY
  | typeof GSAP_FAST;

// Re-export GSAP and plugins for convenience
export { gsap, Flip, CustomEase };
