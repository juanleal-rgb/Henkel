"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";

// Import compound path SVGs for morphing (all shapes in single path)
import HappyRobotCompound from "@public/happyrobot/HR-compound.svg";
import TrinityCompound from "@public/trinity/TRN-compound.svg";

// Register plugin
if (typeof window !== "undefined") {
  gsap.registerPlugin(MorphSVGPlugin);
}

export function LoadingAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);
  const happyrobotRef = useRef<SVGSVGElement>(null);
  const trinityRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!happyrobotRef.current || !trinityRef.current) return;

    // Get the single compound path from each SVG
    const happyrobotPath = happyrobotRef.current.querySelector("path");
    const trinityPath = trinityRef.current.querySelector("path");

    if (!happyrobotPath || !trinityPath) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        repeat: -1,
        yoyo: true,
      });

      // Initial state
      gsap.set(happyrobotRef.current, { opacity: 1, scale: 1 });

      tl
        // Pause at start (show HappyRobot)
        .to({}, { duration: 0.8 })
        // Morph entire HappyRobot compound path to Trinity compound path
        .to(happyrobotPath, {
          morphSVG: {
            shape: trinityPath,
            map: "complexity", // Match subpaths by point count
          },
          duration: 1.2,
          ease: "power2.inOut",
        })
        // Hold at Trinity state
        .to({}, { duration: 0.8 });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center bg-black"
    >
      {/* HappyRobot Compound Logo - will morph to Trinity */}
      <div className="absolute left-1/2 top-1/2" style={{ transform: "translate(-50%, -50%)" }}>
        <HappyRobotCompound ref={happyrobotRef} width={100} height={79} />
      </div>

      {/* Trinity Compound Logo - hidden, used as morph target */}
      <div className="pointer-events-none fixed opacity-0" aria-hidden="true">
        <TrinityCompound ref={trinityRef} width={100} height={82} />
      </div>
    </div>
  );
}
