import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public routes that don't require authentication
  const publicRoutes = ["/auth/signin", "/auth/error"];
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));
  const isAuthApiRoute = pathname.startsWith("/api/auth/");
  const isApiRoute = pathname.startsWith("/api/");

  // Allow public routes, auth API routes, and other API routes
  if (isPublicRoute || isApiRoute) {
    return NextResponse.next();
  }

  // Check for session cookie (Auth.js v5 uses __Secure-authjs.session-token in production or authjs.session-token in dev)
  // Also check legacy NextAuth v4 cookie names for backwards compatibility
  const sessionCookie =
    req.cookies.get("__Secure-authjs.session-token") ||
    req.cookies.get("authjs.session-token") ||
    req.cookies.get("__Secure-next-auth.session-token") ||
    req.cookies.get("next-auth.session-token");

  // Redirect to sign-in if no session cookie
  if (!sessionCookie) {
    const signInUrl = new URL("/auth/signin", req.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
