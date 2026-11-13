import { NextResponse } from "next/server";
import { authenticateOrbitUser, createOrbitSession, normalizeOrbitLoginInput, ORBIT_SESSION_COOKIE } from "../../../../lib/orbit-auth";

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > 8_192) {
    return NextResponse.json({ error: "Sign-in request is too large" }, { status: 413 });
  }

  let username: string;
  let password: string;
  let returnTo: string;
  try {
    const raw = isJson
      ? await request.json()
      : await request.formData().then(form => ({
          username: form.get("username"),
          password: form.get("password"),
          returnTo: form.get("returnTo"),
        }));
    const input = normalizeOrbitLoginInput(raw);
    if (!input) return NextResponse.json({ error: "Invalid sign-in request" }, { status: 400 });
    ({ username, password, returnTo } = input);
  } catch {
    return NextResponse.json({ error: "Invalid sign-in request" }, { status: 400 });
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
