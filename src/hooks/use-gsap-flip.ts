"use client";

import { useRef, useCallback, useEffect } from "react";
import gsap from "gsap";
import { Flip } from "gsap/dist/Flip";

// Register GSAP plugin
if (typeof window !== "undefined") {
  gsap.registerPlugin(Flip);
}

interface FlipOptions {
  duration?: number;
  ease?: string;
  stagger?: number;
  absolute?: boolean;
  scale?: boolean;
  nested?: boolean;
  onComplete?: () => void;
}

export function useGsapFlip<T extends HTMLElement>(defaultOptions: FlipOptions = {}) {
  const containerRef = useRef<T>(null);
  const flipStateRef = useRef<Flip.FlipState | null>(null);

  const captureState = useCallback((targets?: Element | Element[] | string) => {
    if (!containerRef.current) return;

    const elements = targets || containerRef.current.children;
    flipStateRef.current = Flip.getState(elements);
  }, []);

  const animate = useCallback(
    (options: FlipOptions = {}) => {
      if (!flipStateRef.current || !containerRef.current) return;

      const mergedOptions = { ...defaultOptions, ...options };

      Flip.from(flipStateRef.current, {
        duration: mergedOptions.duration ?? 0.5,
        ease: mergedOptions.ease ?? "power2.out",
        stagger: mergedOptions.stagger ?? 0.05,
        absolute: mergedOptions.absolute ?? true,
        scale: mergedOptions.scale ?? false,
        nested: mergedOptions.nested ?? false,
        onComplete: mergedOptions.onComplete,
      });

      flipStateRef.current = null;
    },
    [defaultOptions]
  );

  const flip = useCallback(
    (updateFn: () => void, targets?: Element | Element[] | string, options?: FlipOptions) => {
      captureState(targets);
      updateFn();
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        animate(options);
      });
    },
    [captureState, animate]
  );

  return {
    containerRef,
    captureState,
    animate,
    flip,
  };
}

// Utility hook for simple enter/exit animations
export function useGsapPresence<T extends HTMLElement>() {
  const elementRef = useRef<T>(null);

  const animateIn = useCallback(
    (options: { duration?: number; ease?: string; from?: gsap.TweenVars } = {}) => {
      if (!elementRef.current) return;

      gsap.from(elementRef.current, {
        opacity: 0,
        y: 20,
        scale: 0.95,
        duration: options.duration ?? 0.4,
        ease: options.ease ?? "power2.out",
        ...options.from,
      });
    },
    []
  );

  const animateOut = useCallback(
    (options: { duration?: number; ease?: string; to?: gsap.TweenVars } = {}): Promise<void> => {
      return new Promise((resolve) => {
        if (!elementRef.current) {
          resolve();
          return;
        }

        gsap.to(elementRef.current, {
          opacity: 0,
          y: -10,
          scale: 0.95,
          duration: options.duration ?? 0.3,
          ease: options.ease ?? "power2.in",
          ...options.to,
          onComplete: resolve,
        });
      });
    },
    []
  );

  useEffect(() => {
    animateIn();
  }, [animateIn]);

  return {
    elementRef,
    animateIn,
    animateOut,
  };
}
