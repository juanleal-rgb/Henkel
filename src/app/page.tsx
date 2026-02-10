"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { LogoAnimation } from "@/components/logo-animation";
import { LoadingAnimation } from "@/components/loading-animation";

/**
 * Root page - Entry point for the application
 *
 * Flow:
 * - If authenticated: Show HAPPYROBOT × TRINITY animation → redirect to /dashboard
 * - If not authenticated: Redirect to /login
 * - While checking: Show loading state
 */
export default function Home() {
  const { status } = useSession();
  const router = useRouter();
  const [showAnimation, setShowAnimation] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      // Show animation for authenticated users
      setShowAnimation(true);
    } else if (status === "unauthenticated") {
      // Redirect to login for unauthenticated users
      router.replace("/login");
    }
  }, [status, router]);

  const handleAnimationComplete = () => {
    setShowAnimation(false);
    router.push("/dashboard");
  };

  // Loading state while checking session
  if (status === "loading") {
    return (
      <div className="fixed inset-0 z-50">
        <LoadingAnimation />
      </div>
    );
  }

  // Show animation for authenticated users
  if (showAnimation) {
    return <LogoAnimation onComplete={handleAnimationComplete} />;
  }

  // Null while redirecting
  return null;
}
