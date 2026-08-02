import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ORBIT_SESSION_COOKIE, safeReturnTo, verifyOrbitSession } from "./lib/orbit-auth";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/api/auth/logout", "/api/auth/session", "/manifest.webmanifest", "/sw.js"]);

function clearInvalidSession(response: NextResponse, hasSessionCookie: boolean) {
  if (!hasSessionCookie) return response;
  response.cookies.set(ORBIT_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const sessionCookie = request.cookies.get(ORBIT_SESSION_COOKIE)?.value;
  const user = verifyOrbitSession(sessionCookie);

  if (pathname === "/login" && user) {
    return NextResponse.redirect(new URL(safeReturnTo(request.nextUrl.searchParams.get("returnTo")), request.url));
  }
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (user) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return clearInvalidSession(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), Boolean(sessionCookie));
  }
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("returnTo", `${pathname}${search}`);
  return clearInvalidSession(NextResponse.redirect(loginUrl), Boolean(sessionCookie));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)).*)"],
};
