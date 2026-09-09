import type { NextRequest } from "next/server";
import { requireSession, sellerFromSession } from "@/lib/auth/server";
import { AUDIO_MAX_BYTES, isAcceptedAudio, sanitizeFileName } from "@/lib/audio/config";
import { recordHistorySafely } from "@/lib/history/store";
import { BadRequestError, jsonError, jsonOk } from "@/lib/http/respond";
import { attachAudioToProspect, AudioStatusError } from "@/lib/prospects/audio";

type RouteContext = { params: Promise<{ leadId: string }> };

/**
 * Direct multipart upload of a recording, used where the server can take the
 * whole file in one request (local development, or any host without Vercel's
 * body limit). On Vercel the browser uses Blob and the commit route instead.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    const seller = sellerFromSession(session);
    const { leadId } = await context.params;

    const form = await request.formData().catch(() => {
      throw new BadRequestError("Anropet måste vara multipart/form-data med fältet file.");
    });
    const file = form.get("file");

    if (!(file instanceof File) || file.size === 0) {
      throw new BadRequestError("Ingen ljudfil skickades.");
    }

    if (!isAcceptedAudio(file.name, file.type)) {
      throw new BadRequestError("Endast ljudfiler (mp3, m4a, wav, ogg) kan laddas upp som underlag.");
    }

    if (file.size > AUDIO_MAX_BYTES) {
      throw new BadRequestError(`Ljudfilen är för stor (max ${Math.round(AUDIO_MAX_BYTES / (1024 * 1024))} MB).`);
    }

    const fileName = sanitizeFileName(file.name);

    try {
      const result = await attachAudioToProspect({ leadId, file, fileName, seller });

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
        summary: `Ljudfil kunde inte laddas upp: ${fileName}`,
        pipedriveLeadId: leadId,
        errorMessage: error instanceof Error ? error.message : String(error)
      });

      // The file is in Pipedrive; the seller must not upload it twice.
      return jsonError(error, error instanceof AudioStatusError ? { fileUploaded: true } : {});
    }
  } catch (error) {
    return jsonError(error);
  }
}
