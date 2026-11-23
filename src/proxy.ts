import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isTrainingCrawler } from "./lib/security-calc";

const PORTAL_HOST = "portal.boringpe.com";
const PERSONAL_HOSTS = ["rahulmane.com", "www.rahulmane.com"];

/**
 * Routing plus an optimistic check only: "is there a session cookie at all?".
 * It is not authorization. Every protected page and server action verifies the
 * user against the database (see src/lib/dal.ts).
 */
export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0] ?? "";
  const { pathname } = request.nextUrl;
  const onPortalHost = host === PORTAL_HOST;

  // AI-training crawlers and site copiers that ignore robots.txt are turned away.
  if (isTrainingCrawler(request.headers.get("user-agent")) && pathname !== "/robots.txt") {
    return new NextResponse("Automated copying of this site is not permitted.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  // Auth.js endpoints live at /api/auth on every host.
  if (pathname.startsWith("/api/")) return NextResponse.next();

  // rahulmane.com shows the personal site at its front door.
  if (PERSONAL_HOSTS.includes(host) && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/sites/rahulmane";
    return NextResponse.rewrite(url);
  }

  const effective =
    onPortalHost && !pathname.startsWith("/portal")
      ? pathname === "/"
        ? "/portal/dashboard"
        : `/portal${pathname}`
      : pathname;

  const isLogin = effective === "/portal/login" || effective.startsWith("/portal/login/");
  // KYC consent pages are opened by the person being verified, who has no seat.
  const isPublic = effective.startsWith("/portal/verify/");
  if (effective.startsWith("/portal") && !isLogin && !isPublic) {
    const hasSession = request.cookies
      .getAll()
      .some((cookie) => cookie.name.includes("authjs.session-token"));
    if (!hasSession) {
      return NextResponse.redirect(new URL("/portal/login", request.url));
    }
  }

  if (effective !== pathname) {
    const url = request.nextUrl.clone();
    url.pathname = effective;
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
