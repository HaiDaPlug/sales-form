import { requireSession } from "@/lib/auth/server";
import { AUDIO_MAX_BYTES, audioTransport } from "@/lib/audio/config";
import { jsonError, jsonOk } from "@/lib/http/respond";

/**
 * Tells the browser how to deliver a recording. Decided here rather than
 * baked into the client bundle, so the same build works on Vercel (via Blob)
 * and on a laptop (straight to the route).
 */
export async function GET() {
  try {
    await requireSession();

    return jsonOk({ transport: audioTransport(), maxBytes: AUDIO_MAX_BYTES });
  } catch (error) {
    return jsonError(error);
  }
}
