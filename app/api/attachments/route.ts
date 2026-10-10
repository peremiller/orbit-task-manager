import { cookies } from "next/headers";
import { ORBIT_SESSION_COOKIE, verifyOrbitSession } from "@/lib/orbit-auth";
import { storeAttachment } from "@/lib/orbit-attachments";
import { MAX_ATTACHMENT_BYTES } from "@/lib/task-attachments";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const user = verifyOrbitSession((await cookies()).get(ORBIT_SESSION_COOKIE)?.value);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_ATTACHMENT_BYTES + 64_000) {
    return Response.json({ error: "Each file must be 3 MB or smaller" }, { status: 413 });
  }
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) return Response.json({ error: "Choose a non-empty file" }, { status: 400 });
    if (file.size > MAX_ATTACHMENT_BYTES) return Response.json({ error: "Each file must be 3 MB or smaller" }, { status: 413 });
    const attachment = await storeAttachment(user.id, file);
    return Response.json({ attachment }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Attachment upload failed", error);
    return Response.json({ error: "Upload failed. Please try again." }, { status: 503 });
  }
}
