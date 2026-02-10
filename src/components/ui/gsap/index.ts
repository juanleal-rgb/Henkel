/**
 * GSAP Animation Components
 *
 * Standardized, reusable animation components powered by GSAP.
 * These components provide declarative APIs for common animation patterns.
 */

// Configuration & utilities
export {
  initGSAP,
  isGSAPInitialized,
  GSAP_SPRING,
  GSAP_SMOOTH,
  GSAP_SNAPPY,
  GSAP_FAST,
  FLIP_DEFAULTS,
  gsap,
  Flip,
  CustomEase,
  type GSAPConfig,
} from "./gsapConfig";

// Provider
export { GSAPProvider } from "./GSAPProvider";

// Layout components
export {
  ExpandableGrid,
  useExpandableGrid,
  type ExpandableGridProps,
  type ExpandableGridRef,
} from "./ExpandableGrid";

export { ExpandableGridItem, type ExpandableGridItemProps } from "./ExpandableGridItem";

// Collapsible section
export { CollapsibleSection, type CollapsibleSectionProps } from "./CollapsibleSection";

// Animated columns
export {
  AnimatedColumn,
  AnimatedColumnGroup,
  type AnimatedColumnProps,
  type AnimatedColumnGroupProps,
} from "./AnimatedColumn";

// Legacy hooks (from useGSAPAnimation.ts)
export {
  useEnterExitAnimation,
  useLayoutAnimation,
  useExpandAnimation,
  useStaggerAnimation,
  animateElement,
  createAnimationTimeline,
} from "./useGSAPAnimation";
