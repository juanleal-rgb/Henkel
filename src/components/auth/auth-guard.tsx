"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import HappyRobotLogo from "@public/happyrobot/Footer-logo-white.svg";

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * AuthGuard - Protects routes requiring authentication
 * Shows loading state while checking session, redirects to login if not authenticated
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <HappyRobotLogo className="animate-pulse opacity-30" width={60} height={47} />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return <>{children}</>;
}

export default AuthGuard;
