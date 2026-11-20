import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0] ?? "";
  if (host !== "portal.boringpe.com") {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/portal") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? "/portal/dashboard" : `/portal${pathname}`;
  return NextResponse.rewrite(url);
}
