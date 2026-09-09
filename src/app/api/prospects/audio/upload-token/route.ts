import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession, sellerFromSession } from "@/lib/auth/server";
import { AUDIO_CONTENT_TYPES, AUDIO_MAX_BYTES, isAcceptedAudio, isBlobPathnameForLead } from "@/lib/audio/config";
import { BadRequestError, jsonError } from "@/lib/http/respond";
import { assertProspectBelongsToSeller } from "@/lib/prospects/audio";

const clientPayloadSchema = z.object({ leadId: z.string().min(1) });

/**
 * Issues the short-lived token a browser needs to put a recording straight
 * into Vercel Blob, bypassing the function's 4.5 MB request limit.
 *
 * The token is scoped hard: one prospect's folder, audio only, the size cap,
 * and only for a prospect assigned to the logged-in seller. The upload itself
 * proves nothing to Pipedrive — the commit route does that once the file is
 * in Blob.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const seller = sellerFromSession(session);
    const body = (await request.json()) as HandleUploadBody;

    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = clientPayloadSchema.safeParse(JSON.parse(clientPayload ?? "{}"));

        if (!payload.success) {
          throw new BadRequestError("Uppladdningen saknar prospekt-id.");
        }

        const { leadId } = payload.data;

        if (!isBlobPathnameForLead(pathname, leadId)) {
          throw new BadRequestError("Filen måste laddas upp under prospektets egen mapp.");
        }

        if (!isAcceptedAudio(pathname)) {
          throw new BadRequestError("Endast ljudfiler (mp3, m4a, wav, ogg) kan laddas upp som underlag.");
        }

        await assertProspectBelongsToSeller(leadId, seller);

        return {
          allowedContentTypes: AUDIO_CONTENT_TYPES,
          maximumSizeInBytes: AUDIO_MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ leadId, sellerOptionId: session.sellerOptionId })
        };
      },
      // Vercel calls this from its own servers after the upload. The gate in
      // front of every route has no session for that call, and the browser
      // commits the file explicitly anyway, so nothing happens here.
      onUploadCompleted: async () => {}
    });

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
