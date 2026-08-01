import { cookies } from "next/headers";
import { ORBIT_SESSION_COOKIE, verifyOrbitSession } from "../../../../lib/orbit-auth";

export async function GET() {
  const cookieStore = await cookies();
  const user = verifyOrbitSession(cookieStore.get(ORBIT_SESSION_COOKIE)?.value);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ user }, { headers: { "Cache-Control": "no-store" } });
}
