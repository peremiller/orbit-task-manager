export type TaskAttachment = { id: string; name: string; type: string; size: number; createdAt: string };
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
export const MAX_TASK_ATTACHMENTS = 20;
export function attachmentUrl(attachment: TaskAttachment, download = false) {
  return `/api/attachments/${encodeURIComponent(attachment.id)}${download ? "?download=1" : ""}`;
}
export function isImageAttachment(attachment: TaskAttachment) {
  return ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"].includes(attachment.type);
}
export function attachmentSize(size: number) {
  return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
