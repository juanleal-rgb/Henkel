"use client";

/**
 * GSAPProvider - Initializes GSAP plugins once at app startup
 *
 * Wrap your app with this provider to ensure GSAP plugins
 * are registered before any animations run.
 */

import { useEffect, type ReactNode } from "react";
import { initGSAP } from "./gsapConfig";

interface GSAPProviderProps {
  children: ReactNode;
}

export function GSAPProvider({ children }: GSAPProviderProps) {
  useEffect(() => {
    initGSAP();
  }, []);

  return <>{children}</>;
}
