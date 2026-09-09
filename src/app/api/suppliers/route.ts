import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/server";
import { jsonError, jsonOk } from "@/lib/http/respond";
import { addSupplier, listSuppliers } from "@/lib/suppliers/store";
import { newSupplierSchema } from "@/lib/suppliers/types";

/** The suppliers a cancellation can be addressed to, shared by every seller. */
export async function GET() {
  try {
    await requireSession();

    return jsonOk(await listSuppliers());
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * Adds a supplier the list does not have. Shared, not per-seller: the next
 * colleague to cancel with the same company should find it already there.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const supplier = newSupplierSchema.parse(await request.json());

    return jsonOk(await addSupplier(supplier, session.subject), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
