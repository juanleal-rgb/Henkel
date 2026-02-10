"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";

// Import compound path SVGs for morphing (all shapes in single path)
import HappyRobotCompound from "@public/happyrobot/HR-compound.svg";
import HenkelCompound from "@public/henkel/HNK-compound.svg";

// Register plugin
if (typeof window !== "undefined") {
  gsap.registerPlugin(MorphSVGPlugin);
}

interface LogoAnimationProps {
  onComplete?: () => void;
}

export function LogoAnimation({ onComplete }: LogoAnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const happyrobotRef = useRef<SVGSVGElement>(null);
  const henkelRef = useRef<SVGSVGElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!happyrobotRef.current || !henkelRef.current) return;

    // Get the single compound path from each SVG
    const happyrobotPath = happyrobotRef.current.querySelector("path");
    const henkelPath = henkelRef.current.querySelector("path");

    if (!happyrobotPath || !henkelPath) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        onComplete: () => {
          setTimeout(() => onComplete?.(), 800);
        },
      });

      // Initial state
      gsap.set(happyrobotRef.current, { opacity: 0, scale: 0.8 });
      gsap.set(henkelRef.current, { opacity: 0 });
      gsap.set(textRef.current, { y: 30, opacity: 0 });
      gsap.set(glowRef.current, { scale: 0, opacity: 0 });

      tl
        // Fade in HappyRobot logo
        .to(happyrobotRef.current, {
          opacity: 1,
          scale: 1,
          duration: 0.6,
          ease: "back.out(1.7)",
        })
        // Pause to show HappyRobot
        .to({}, { duration: 0.4 })
        // Glow pulse
        .to(glowRef.current, {
          scale: 1.2,
          opacity: 0.8,
          duration: 0.3,
          ease: "power2.out",
        })
        // Morph entire HappyRobot compound path to Henkel compound path
        .to(
          happyrobotPath,
          {
            morphSVG: {
              shape: henkelPath,
              map: "complexity", // Match subpaths by point count
            },
            duration: 1.2,
            ease: "power2.inOut",
          },
          "-=0.1"
        )
        // Fade out glow
        .to(
          glowRef.current,
          {
            scale: 2,
            opacity: 0,
            duration: 0.5,
            ease: "power2.out",
          },
          "-=0.4"
        )
        // Show combined text
        .to(
          textRef.current,
          {
            y: 0,
            opacity: 1,
            duration: 0.5,
            ease: "power2.out",
          },
          "-=0.2"
        );
    }, containerRef);

    return () => ctx.revert();
  }, [onComplete]);

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 overflow-hidden bg-black">
      {/* Glow effect - absolutely centered */}
      <div
        ref={glowRef}
        className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/15 blur-3xl"
      />

      {/* HappyRobot Compound Logo - will morph to Henkel */}
      <div className="absolute left-1/2 top-1/2" style={{ transform: "translate(-50%, -50%)" }}>
        <HappyRobotCompound ref={happyrobotRef} width={150} height={118} />
      </div>

      {/* Henkel Compound Logo - hidden, used as morph target */}
      <div className="pointer-events-none fixed opacity-0" aria-hidden="true">
        <HenkelCompound ref={henkelRef} width={150} height={123} />
      </div>

      {/* Text - absolutely centered below logo */}
      <div
        ref={textRef}
        className="absolute left-1/2 top-1/2 mt-24 -translate-x-1/2 text-center text-sm tracking-widest text-white/60"
      >
        HAPPYROBOT × HENKEL
      </div>
    </div>
  );
}
