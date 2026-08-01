import { NextResponse } from "next/server";
import { authenticateOrbitUser, createOrbitSession, ORBIT_SESSION_COOKIE, safeReturnTo } from "../../../../lib/orbit-auth";

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  let username = "";
  let password = "";
  let returnTo = "/today";

  if (contentType.includes("application/json")) {
    const body = await request.json() as { username?: string; password?: string; returnTo?: string };
    username = body.username ?? "";
    password = body.password ?? "";
    returnTo = safeReturnTo(body.returnTo);
  } else {
    const form = await request.formData();
    username = String(form.get("username") ?? "");
    password = String(form.get("password") ?? "");
    returnTo = safeReturnTo(String(form.get("returnTo") ?? "/today"));
  }

  const user = authenticateOrbitUser(username, password);
  if (!user) {
    await new Promise((resolve) => setTimeout(resolve, 450));
    if (contentType.includes("application/json")) return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "invalid");
    loginUrl.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(loginUrl, 303);
  }

  const response = contentType.includes("application/json")
    ? NextResponse.json({ user })
    : NextResponse.redirect(new URL(returnTo, request.url), 303);
  response.cookies.set(ORBIT_SESSION_COOKIE, createOrbitSession(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
