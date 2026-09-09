import { NextRequest, NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/auth/server";
import { listHistory } from "@/lib/history/store";
import { WORKFLOW_KINDS, type WorkflowKind } from "@/lib/history/types";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();

    const kindParam = request.nextUrl.searchParams.get("kind");
    const kind = WORKFLOW_KINDS.includes(kindParam as WorkflowKind) ? (kindParam as WorkflowKind) : undefined;
    const limitParam = Number(request.nextUrl.searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;

    // Scoped to the logged-in seller: other sellers' runs are never returned,
    // whatever the query says.
    return NextResponse.json({
      ok: true,
      data: await listHistory({ kind, limit, sellerOptionId: session.sellerOptionId })
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 401 });
    }

    console.error("Failed to read history:", error);
    return NextResponse.json({ ok: false, error: "Kunde inte läsa historiken." }, { status: 500 });
  }
}
