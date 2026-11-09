import "server-only";
import { db } from "@/lib/db";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "@/lib/constants";
import { DomainError, NotFoundError } from "@/server/errors";
import { audit } from "./audit";

type AllowedType = (typeof ALLOWED_UPLOAD_TYPES)[number];

/** Detect the real file type from its magic bytes — the browser-supplied MIME type is not trusted. */
export function sniffMimeType(bytes: Uint8Array): AllowedType | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp"; // RIFF....WEBP
  return null;
}

function safeFileName(name: string, mime: AllowedType) {
  const ext = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[mime];
  const base = name
    .replace(/\.[^.]*$/, "")
    .replace(/[^\w\- ]+/g, "")
    .trim()
    .slice(0, 80);
  return `${base || "attachment"}.${ext}`;
}

export async function addAttachment(
  userId: string,
  target: { transactionId?: string; loanId?: string },
  file: File,
) {
  if (!target.transactionId && !target.loanId) throw new DomainError("Nothing to attach the file to");
  if (file.size === 0) throw new DomainError("The file is empty");
  if (file.size > MAX_UPLOAD_BYTES) throw new DomainError("Files must be 4 MB or smaller");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMimeType(bytes);
  if (!mime) throw new DomainError("Only PDF, PNG, JPEG and WebP files are allowed");

  if (target.transactionId) {
    const owned = await db.transaction.count({ where: { id: target.transactionId, userId } });
    if (!owned) throw new NotFoundError("Transaction");
  }
  if (target.loanId) {
    const owned = await db.loan.count({ where: { id: target.loanId, userId } });
    if (!owned) throw new NotFoundError("Loan");
  }
  const existing = await db.attachment.count({ where: { userId, ...(target.transactionId ? { transactionId: target.transactionId } : { loanId: target.loanId }) } });
  if (existing >= 10) throw new DomainError("A record can have at most 10 attachments");

  return db.$transaction(async (tx) => {
    const att = await tx.attachment.create({
      data: {
        userId,
        transactionId: target.transactionId ?? null,
        loanId: target.loanId ?? null,
        fileName: safeFileName(file.name, mime),
        mimeType: mime,
        size: bytes.byteLength,
        data: bytes,
      },
      select: { id: true, fileName: true, mimeType: true, size: true },
    });
    await audit(tx, { userId, action: "CREATE", entityType: "Attachment", entityId: att.id, summary: `Uploaded ${att.fileName}` });
    return att;
  });
}

export async function getAttachmentFile(userId: string, id: string) {
  return db.attachment.findFirst({
    where: { id, userId },
    select: { fileName: true, mimeType: true, size: true, data: true },
  });
}

export async function deleteAttachment(userId: string, id: string) {
  return db.$transaction(async (tx) => {
    const att = await tx.attachment.findFirst({ where: { id, userId }, select: { id: true, fileName: true } });
    if (!att) throw new NotFoundError("Attachment");
    await tx.attachment.delete({ where: { id } });
    await audit(tx, { userId, action: "DELETE", entityType: "Attachment", entityId: id, summary: `Deleted ${att.fileName}` });
  });
}

export async function listLoanAttachments(userId: string, loanId: string) {
  return db.attachment.findMany({
    where: { userId, loanId },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true, mimeType: true, size: true },
  });
}
