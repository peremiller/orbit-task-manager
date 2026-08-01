import { cookies } from "next/headers";
import { getOrbitWorkspace, saveOrbitWorkspace } from "../../../lib/orbit-db";
import { ORBIT_SESSION_COOKIE, verifyOrbitSession } from "../../../lib/orbit-auth";

const MAX_BODY_BYTES = 600_000;
const MAX_TASKS = 2_000;
const MAX_PROJECTS = 500;

async function authenticatedUser() {
  const cookieStore = await cookies();
  return verifyOrbitSession(cookieStore.get(ORBIT_SESSION_COOKIE)?.value);
}

export async function GET() {
  const user = await authenticatedUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const workspace = await getOrbitWorkspace(user.id);
    return Response.json({ workspace }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to load Orbit workspace", error);
    return Response.json({ error: "Workspace unavailable" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const user = await authenticatedUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return Response.json({ error: "Workspace is too large" }, { status: 413 });

  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return Response.json({ error: "Workspace is too large" }, { status: 413 });
    }

    const body = JSON.parse(rawBody) as { tasks?: unknown; projects?: unknown };
    if (!Array.isArray(body.tasks) || !Array.isArray(body.projects)) {
      return Response.json({ error: "Tasks and projects must be arrays" }, { status: 400 });
    }
    if (body.tasks.length > MAX_TASKS || body.projects.length > MAX_PROJECTS) {
      return Response.json({ error: "Workspace has too many items" }, { status: 413 });
    }

    const workspace = await saveOrbitWorkspace(user.id, body.tasks, body.projects);
    return Response.json({ workspace }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON" }, { status: 400 });
    console.error("Failed to save Orbit workspace", error);
    return Response.json({ error: "Workspace could not be saved" }, { status: 503 });
  }
}
