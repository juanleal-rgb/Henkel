import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

export type AuthSession = {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
};

/**
 * Require authentication for an API route.
 * Returns the session if authenticated, or a 401 Response if not.
 */
export async function requireAuth(): Promise<AuthSession | NextResponse> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Authentication required" },
      { status: 401 }
    );
  }

  return session as AuthSession;
}

/**
 * Require specific role(s) for an API route.
 * Returns the session if authorized, or a 401/403 Response if not.
 */
export async function requireRole(allowedRoles: string[]): Promise<AuthSession | NextResponse> {
  const result = await requireAuth();

  if (result instanceof NextResponse) {
    return result;
  }

  if (!allowedRoles.includes(result.user.role)) {
    return NextResponse.json(
      { error: "Forbidden", message: "Insufficient permissions" },
      { status: 403 }
    );
  }

  return result;
}

/**
 * Require ADMIN role for an API route.
 */
export async function requireAdmin(): Promise<AuthSession | NextResponse> {
  return requireRole(["ADMIN"]);
}

/**
 * Require OPERATOR or ADMIN role for an API route.
 */
export async function requireOperator(): Promise<AuthSession | NextResponse> {
  return requireRole(["ADMIN", "OPERATOR"]);
}

/**
 * Helper to check if result is an error response
 */
export function isAuthError(result: AuthSession | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
