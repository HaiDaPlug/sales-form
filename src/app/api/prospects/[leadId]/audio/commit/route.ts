import { del, get } from "@vercel/blob";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession, sellerFromSession } from "@/lib/auth/server";
import { AUDIO_MAX_BYTES, isAcceptedAudio, isBlobPathnameForLead, sanitizeFileName } from "@/lib/audio/config";
import { recordHistorySafely } from "@/lib/history/store";
import { BadRequestError, jsonError, jsonOk } from "@/lib/http/respond";
import { attachAudioToProspect, AudioStatusError } from "@/lib/prospects/audio";

type RouteContext = { params: Promise<{ leadId: string }> };

const commitSchema = z.object({
  /** Where the browser put the file; the URL Blob returned after the upload. */
  blobUrl: z.string().trim().url("Ogiltig blob-URL"),
  pathname: z.string().trim().min(1, "Blob-sökväg krävs"),
  fileName: z.string().trim().min(1, "Filnamn krävs")
});

/**
 * Moves a staged recording from Vercel Blob into Pipedrive.
 *
 * The browser uploads straight to Blob because a Vercel function cannot take a
 * request larger than 4.5 MB. This route is the second half: it fetches the
 * staged file server-side, attaches it to the prospect, sets the status, and
 * only then deletes the staging copy.
 *
 * The blob is deliberately *not* deleted when the transfer fails. It is the
 * only copy the seller has already uploaded, so keeping it lets a retry finish
 * without asking them to pick the file again.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    const seller = sellerFromSession(session);
    const { leadId } = await context.params;
    const body = commitSchema.parse(await request.json());

    // The pathname is what the token was scoped to, so it is what decides
    // whether this file belongs to this prospect.
    if (!isBlobPathnameForLead(body.pathname, leadId)) {
      throw new BadRequestError("Filen hör inte till det här prospektet.");
    }

    const fileName = sanitizeFileName(body.fileName);

    if (!isAcceptedAudio(fileName) && !isAcceptedAudio(body.pathname)) {
      throw new BadRequestError("Endast ljudfiler (mp3, m4a, wav, ogg) kan laddas upp som underlag.");
    }

    const staged = await get(body.blobUrl, { access: "private", useCache: false });

    if (!staged || staged.statusCode !== 200) {
      throw new BadRequestError("Den uppladdade ljudfilen kunde inte läsas. Försök ladda upp den igen.");
    }

    if (staged.blob.size > AUDIO_MAX_BYTES) {
      throw new BadRequestError(`Ljudfilen är för stor (max ${Math.round(AUDIO_MAX_BYTES / (1024 * 1024))} MB).`);
    }

    const file = new Blob([await new Response(staged.stream).arrayBuffer()], {
      type: staged.blob.contentType || "application/octet-stream"
    });

    try {
      const result = await attachAudioToProspect({ leadId, file, fileName, seller });

      // Pipedrive holds the recording now; the staging copy has no further use.
      // Its removal is not worth failing the request over.
      await del(body.blobUrl).catch((error) => {
        console.error("Staged audio blob could not be deleted:", error);
      });

      await recordHistorySafely({
        kind: "prospect",
        status: result.warning ? "warning" : "success",
        createdBy: session.subject,
        sellerOptionId: session.sellerOptionId,
        customerName: result.leadTitle,
        summary: `Ljudfil uppladdad: ${fileName}`,
        pipedriveLeadId: leadId,
        pipedriveOrganizationId: result.organizationId,
        errorMessage: result.warning
      });

      return jsonOk({ fileId: result.fileId, warning: result.warning });
    } catch (error) {
      await recordHistorySafely({
        kind: "prospect",
        status: "error",
        createdBy: session.subject,
        sellerOptionId: session.sellerOptionId,
        summary: `Ljudfil kunde inte kopplas till prospektet: ${fileName}`,
        pipedriveLeadId: leadId,
        errorMessage: error instanceof Error ? error.message : String(error)
      });

      return jsonError(error, error instanceof AudioStatusError ? { fileUploaded: true } : {});
    }
  } catch (error) {
    return jsonError(error);
  }
}
