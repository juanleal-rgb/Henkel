import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Check admin-only routes
    if (path === "/api/reset") {
      if (token?.role !== "ADMIN") {
        return NextResponse.json(
          { error: "Forbidden", message: "Admin access required" },
          { status: 403 }
        );
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;

        // Public routes - no auth required
        const publicPaths = [
          "/api/auth",
          "/api/health",
          "/api/webhooks",
          "/api/cron",
          "/login",
          "/forgot-password",
          "/reset-password",
        ];

        if (publicPaths.some((p) => path.startsWith(p))) {
          return true;
        }

        // All other routes require authentication
        return !!token;
      },
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
