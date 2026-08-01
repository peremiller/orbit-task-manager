import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ORBIT_SESSION_COOKIE, verifyOrbitSession } from "../../../../lib/orbit-auth";

export async function GET() {
  const cookieStore = await cookies();
  const user = verifyOrbitSession(cookieStore.get(ORBIT_SESSION_COOKIE)?.value);
  if (!user) {
    const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    response.cookies.set(ORBIT_SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  }
  return NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } });
}
