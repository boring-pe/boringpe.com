import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { firstAllowedHref, parseRole, sectionFromPath, can } from "@/lib/rbac";

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0] ?? "";
  const { pathname } = request.nextUrl;
  const onPortalHost = host === "portal.boringpe.com";
  const isAsset =
    pathname.startsWith("/_next") || pathname.includes(".");

  let effective = pathname;
  if (onPortalHost && !pathname.startsWith("/portal") && !isAsset) {
    effective = pathname === "/" ? "/portal/dashboard" : `/portal${pathname}`;
  }

  if (effective.startsWith("/portal")) {
    const role = parseRole(request.cookies.get("bp_preview")?.value);
    const section = sectionFromPath(effective);
    if (section && !can(role, section)) {
      return NextResponse.redirect(new URL(firstAllowedHref(role), request.url));
    }
  }

  if (!onPortalHost || isAsset || pathname.startsWith("/portal")) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? "/portal/dashboard" : `/portal${pathname}`;
  return NextResponse.rewrite(url);
}
