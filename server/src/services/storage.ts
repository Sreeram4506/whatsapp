import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config";
import { badRequest } from "../lib/errors";

/**
 * Private attachment storage. Files are written outside any public web root with random names
 * and are only served through authorised API routes. Swap this module for S3/GCS/R2 in production
 * (keep the same interface: put / read / remove).
 */

export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const AUDIO_MIME = ["audio/ogg", "audio/webm", "audio/mpeg", "audio/mp4", "audio/aac", "audio/amr"];

const MAGIC: Record<string, (b: Buffer) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  "application/pdf": (b) => b.subarray(0, 5).toString("ascii") === "%PDF-",
};

/** Validates declared type, size and file signature (magic bytes) — never trust the extension alone. */
export function validateUpload(buf: Buffer, declaredMime: string, opts: { allowAudio?: boolean } = {}) {
  const max = config.MAX_UPLOAD_MB * 1024 * 1024;
  if (buf.length === 0) throw badRequest("Empty file");
  if (buf.length > max) throw badRequest(`File is larger than ${config.MAX_UPLOAD_MB} MB`);
  const mime = declaredMime.split(";")[0].trim().toLowerCase();
  if (opts.allowAudio && AUDIO_MIME.includes(mime)) return mime;
  if (!(ALLOWED_MIME as readonly string[]).includes(mime)) {
    throw badRequest("Only JPG, PNG, WEBP images and PDF documents are accepted");
  }
  if (!MAGIC[mime](buf)) throw badRequest("File content does not match its type");
  return mime;
}

export function safeFileName(name: string): string {
  const base = path.basename(name || "file").replace(/[^\w.\-() ]+/g, "_").slice(0, 120);
  return base || "file";
}

export async function putObject(tenantId: string, buf: Buffer, mime: string) {
  const ext = mime === "application/pdf" ? "pdf" : mime.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "bin";
  const key = `${tenantId}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  const full = path.join(config.storageDir, key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buf, { mode: 0o600 });
  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  return { storageKey: key, sha256, sizeBytes: buf.length };
}

function resolveKey(key: string) {
  const full = path.resolve(config.storageDir, key);
  if (!full.startsWith(path.resolve(config.storageDir) + path.sep)) throw badRequest("Invalid storage key");
  return full;
}

export async function readObject(key: string): Promise<Buffer> {
  return fs.readFile(resolveKey(key));
}

export async function removeObject(key: string) {
  await fs.rm(resolveKey(key), { force: true });
}
