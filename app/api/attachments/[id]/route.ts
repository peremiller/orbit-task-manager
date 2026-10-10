import { cookies } from "next/headers";
import { ORBIT_SESSION_COOKIE, verifyOrbitSession } from "@/lib/orbit-auth";
import { getAttachment } from "@/lib/orbit-attachments";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = verifyOrbitSession((await cookies()).get(ORBIT_SESSION_COOKIE)?.value);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const attachment = await getAttachment(user.id, (await params).id);
    if (!attachment) return Response.json({ error: "Attachment not found" }, { status: 404 });
    const inline = attachment.type.startsWith("image/") && new URL(request.url).searchParams.get("download") !== "1";
    const name = encodeURIComponent(attachment.name).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16)}`);
    return new Response(new Uint8Array(attachment.data), { headers: {
      "Content-Type": attachment.type,
      "Content-Length": String(attachment.data.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    } });
  } catch (error) {
    console.error("Attachment download failed", error);
    return Response.json({ error: "Attachment unavailable" }, { status: 503 });
  }
}
