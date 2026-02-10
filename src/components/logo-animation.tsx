"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import gsap from "gsap";

interface LogoAnimationProps {
  onComplete?: () => void;
}

export function LogoAnimation({ onComplete }: LogoAnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        onComplete: () => {
          setTimeout(() => onComplete?.(), 800);
        },
      });

      // Initial state
      gsap.set(logoRef.current, { opacity: 0, scale: 0.8 });
      gsap.set(textRef.current, { y: 30, opacity: 0 });
      gsap.set(glowRef.current, { scale: 0, opacity: 0 });

      tl
        // Glow pulse
        .to(glowRef.current, {
          scale: 1.2,
          opacity: 0.8,
          duration: 0.3,
          ease: "power2.out",
        })
        // Fade in Henkel logo
        .to(
          logoRef.current,
          {
            opacity: 1,
            scale: 1,
            duration: 0.8,
            ease: "back.out(1.7)",
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
          "-=0.3"
        )
        // Show text
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
      {/* Glow effect */}
      <div
        ref={glowRef}
        className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/15 blur-3xl"
      />

      {/* Henkel Logo */}
      <div
        ref={logoRef}
        className="absolute left-1/2 top-1/2"
        style={{ transform: "translate(-50%, -50%)" }}
      >
        <Image src="/henkel/Henkel-Logo.svg.png" alt="Henkel" width={180} height={140} priority />
      </div>

      {/* Text */}
      <div
        ref={textRef}
        className="absolute left-1/2 top-1/2 mt-24 -translate-x-1/2 text-center text-sm tracking-widest text-white/60"
      >
        HAPPYROBOT × HENKEL
      </div>
    </div>
  );
}
