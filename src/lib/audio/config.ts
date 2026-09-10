import { getEnv } from "@/lib/config/env";

/**
 * Recorded sales calls, uploaded as the evidence a prospect is quality-checked
 * against.
 *
 * The cap matches what the Pipedrive community reports as the per-file limit
 * on `/files`; it is not documented officially, so the first live upload of a
 * long call is the real test. Formats are what phone and desktop recorders
 * produce.
 */
export const AUDIO_MAX_BYTES = 50 * 1024 * 1024;

export const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".mp4", ".wav", ".ogg", ".oga", ".webm", ".aac", ".flac"];

/** Sent to Vercel Blob as the allowed content types; wildcards are supported. */
export const AUDIO_CONTENT_TYPES = ["audio/*", "video/mp4", "video/webm", "application/octet-stream"];

/**
 * Browsers are inconsistent about the MIME type of a recording (Windows often
 * reports `application/octet-stream` for `.m4a`), so the file name decides and
 * the type is only consulted when the name has no recognisable extension.
 */
export function isAcceptedAudio(fileName: string, contentType?: string): boolean {
  const name = fileName.trim().toLowerCase();

  if (AUDIO_EXTENSIONS.some((extension) => name.endsWith(extension))) return true;

  return typeof contentType === "string" && contentType.toLowerCase().startsWith("audio/");
}

/** How the browser gets the file to the server; decided by the deployment. */
export type AudioTransport = "blob" | "direct";

/**
 * Vercel functions accept at most 4.5 MB per request, so on Vercel the file
 * goes browser → private Vercel Blob → server → Pipedrive. Without a Blob
 * token — local development — a plain multipart upload to the route is used.
 */
export function audioTransport(): AudioTransport {
  return getEnv().BLOB_READ_WRITE_TOKEN ? "blob" : "direct";
}

const BLOB_PREFIX = "prospects/";

/**
 * Where a prospect's recording is staged in Blob. The lead id is in the path
 * so the server can tell, from the path alone, which prospect an upload was
 * authorised for.
 */
export function blobPathnameFor(leadId: string, fileName: string): string {
  return `${BLOB_PREFIX}${leadId}/${sanitizeFileName(fileName)}`;
}

/** True when `pathname` is under the prospect's own folder and nothing else. */
export function isBlobPathnameForLead(pathname: string, leadId: string): boolean {
  const prefix = `${BLOB_PREFIX}${leadId}/`;

  return pathname.startsWith(prefix) && pathname.length > prefix.length && !pathname.includes("..");
}

/** Keeps the original name readable in Pipedrive while dropping path characters. */
export function sanitizeFileName(fileName: string): string {
  const cleaned = fileName
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ");

  return cleaned || "ljudfil";
}
