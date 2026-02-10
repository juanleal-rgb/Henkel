"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import gsap from "gsap";

export function LoadingAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.to(logoRef.current, {
        opacity: 0.4,
        scale: 0.95,
        duration: 1,
        ease: "power1.inOut",
        repeat: -1,
        yoyo: true,
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center bg-black"
    >
      <div ref={logoRef}>
        <Image src="/henkel/Henkel-Logo.svg.png" alt="Henkel" width={100} height={80} />
      </div>
    </div>
  );
}
