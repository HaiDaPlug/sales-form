import { requireSession, sellerFromSession } from "@/lib/auth/server";
import { jsonError, jsonOk } from "@/lib/http/respond";
import { getSellerStatus } from "@/lib/status/service";

/**
 * The seller's own prospects, deals and customers.
 *
 * Read-only by construction: there is no counterpart that writes. Approval and
 * conversion happen in Pipedrive, and this route offers no way to reach them.
 */
export async function GET() {
  try {
    const session = await requireSession();

    // Scoped to the session's seller, never to anything the caller asked for.
    return jsonOk(await getSellerStatus(sellerFromSession(session)));
  } catch (error) {
    return jsonError(error);
  }
}
