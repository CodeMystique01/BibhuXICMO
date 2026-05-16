import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/agent",
  "/agents",
  "/chat",
  "/billing",
  "/settings",
  "/onboarding",
  "/integrations",
  "/actions",
  "/content",
  "/queue",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!needsAuth) return NextResponse.next();

  // Auth.js v5 sets one of these cookies when signed in.
  const hasSession =
    req.cookies.get("authjs.session-token") ||
    req.cookies.get("__Secure-authjs.session-token") ||
    req.cookies.get("next-auth.session-token") ||
    req.cookies.get("__Secure-next-auth.session-token");

  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/agent/:path*",
    "/agents/:path*",
    "/chat/:path*",
    "/billing/:path*",
    "/settings/:path*",
    "/onboarding/:path*",
    "/integrations/:path*",
    "/actions/:path*",
    "/content/:path*",
    "/queue/:path*",
  ],
};
