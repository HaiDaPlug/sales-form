"use client";

import { upload } from "@vercel/blob/client";
import { blobPathnameFor } from "@/lib/audio/config";

/**
 * Delivers a recording to Pipedrive, by whichever route the deployment allows.
 *
 * On Vercel a function cannot receive more than 4.5 MB, so the file goes to
 * private Blob storage first and the server fetches it from there. Elsewhere it
 * is posted straight to the route. The server decides which; the wizard only
 * calls this.
 *
 * Throws with the server's message on failure. The prospect already exists at
 * this point, so the caller reports the failure without undoing anything.
 */
export async function uploadProspectAudio(leadId: string, file: File): Promise<{ warning?: string }> {
  const transport = await readTransport();

  return transport === "blob" ? uploadViaBlob(leadId, file) : uploadDirect(leadId, file);
}

async function readTransport(): Promise<"blob" | "direct"> {
  try {
    const response = await fetch("/api/prospects/audio/config");
    const payload = (await response.json()) as { ok: boolean; data?: { transport?: "blob" | "direct" } };

    // Falling back to the direct route is the safe guess: it fails with a clear
    // message on a host with a body limit, rather than silently uploading
    // nowhere.
    return payload.data?.transport === "blob" ? "blob" : "direct";
  } catch {
    return "direct";
  }
}

async function uploadViaBlob(leadId: string, file: File): Promise<{ warning?: string }> {
  const blob = await upload(blobPathnameFor(leadId, file.name), file, {
    access: "private",
    handleUploadUrl: "/api/prospects/audio/upload-token",
    clientPayload: JSON.stringify({ leadId })
  });

  return commit(`/api/prospects/${encodeURIComponent(leadId)}/audio/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blobUrl: blob.url, pathname: blob.pathname, fileName: file.name })
  });
}

async function uploadDirect(leadId: string, file: File): Promise<{ warning?: string }> {
  const form = new FormData();
  form.set("file", file, file.name);

  return commit(`/api/prospects/${encodeURIComponent(leadId)}/audio`, { method: "POST", body: form });
}

async function commit(url: string, init: RequestInit): Promise<{ warning?: string }> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as
    | { ok: boolean; error?: string; data?: { warning?: string } }
    | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? "Ljudfilen kunde inte laddas upp.");
  }

  return { warning: payload.data?.warning };
}
