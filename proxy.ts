import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ORBIT_SESSION_COOKIE, safeReturnTo, verifyOrbitSession } from "./lib/orbit-auth";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"]);

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const user = verifyOrbitSession(request.cookies.get(ORBIT_SESSION_COOKIE)?.value);

  if (pathname === "/login" && user) {
    return NextResponse.redirect(new URL(safeReturnTo(request.nextUrl.searchParams.get("returnTo")), request.url));
  }
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (user) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("returnTo", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)).*)"],
};
