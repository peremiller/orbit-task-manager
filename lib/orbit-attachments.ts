import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import type { TaskAttachment } from "./task-attachments";

function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return neon(process.env.DATABASE_URL);
}

async function ensureAttachmentTable(sql: ReturnType<typeof database>) {
  await sql`CREATE TABLE IF NOT EXISTS orbit_task_attachments (
    id uuid PRIMARY KEY, user_id text NOT NULL, name text NOT NULL,
    mime_type text NOT NULL, size integer NOT NULL CHECK (size > 0 AND size <= 3145728),
    data_base64 text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  )`;
}

// Detect image bytes before allowing inline rendering; other files download only.
export function attachmentMime(data: Buffer) {
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(data.subarray(0, 6).toString())) return "image/gif";
  if (data.subarray(0, 4).toString() === "RIFF" && data.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (data.subarray(4, 8).toString() === "ftyp" && ["avif", "avis"].includes(data.subarray(8, 12).toString())) return "image/avif";
  return "application/octet-stream";
}

export async function storeAttachment(userId: string, file: File): Promise<TaskAttachment> {
  const data = Buffer.from(await file.arrayBuffer());
  const attachment: TaskAttachment = {
    id: randomUUID(), name: file.name.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 240) || "attachment",
    type: attachmentMime(data), size: data.length, createdAt: new Date().toISOString(),
  };
  const sql = database();
  await ensureAttachmentTable(sql);
  await sql`INSERT INTO orbit_task_attachments (id, user_id, name, mime_type, size, data_base64)
    VALUES (${attachment.id}, ${userId}, ${attachment.name}, ${attachment.type}, ${attachment.size}, ${data.toString("base64")})`;
  return attachment;
}

export async function getAttachment(userId: string, id: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) return null;
  const sql = database();
  await ensureAttachmentTable(sql);
  const rows = await sql`SELECT name, mime_type, size, data_base64 FROM orbit_task_attachments WHERE id = ${id}::uuid AND user_id = ${userId} LIMIT 1`;
  const row = rows[0];
  return row ? { name: String(row.name), type: String(row.mime_type), data: Buffer.from(String(row.data_base64), "base64") } : null;
}
