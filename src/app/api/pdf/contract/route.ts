import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireSession, UnauthorizedError } from "@/lib/auth/server";
import { contractStepSchema } from "@/lib/crm/schemas";
import { recordHistory } from "@/lib/history/store";
import { generateContractPdf } from "@/lib/pdf/service";

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const parsed = contractStepSchema.parse(await request.json());
    const pdf = await generateContractPdf(parsed);

    await recordHistory({
      kind: "contract",
      status: "success",
      createdBy: session.subject,
      customerName: parsed.companyName,
      summary: `Avtal för ${parsed.companyName} — ${parsed.price} (${parsed.paymentInterval})`,
      fileName: pdf.fileName,
      pipedriveDealId: parsed.dealId,
      pipedriveOrganizationId: parsed.organizationId,
      payload: parsed
    });

    // The document itself is returned so the seller actually receives it; the
    // filename travels in a header because the body is now the file.
    return new NextResponse(pdf.blob, {
      status: 200,
      headers: {
        "Content-Type": pdf.contentType,
        "Content-Disposition": `attachment; filename="${pdf.fileName}"`,
        "X-Document-File-Name": pdf.fileName,
        "X-Document-Draft": "true"
      }
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 401 });
    }

    if (error instanceof ZodError) {
      const message = error.issues.map((issue) => `${issue.path.join(".") || "form"}: ${issue.message}`).join("; ");
      return NextResponse.json({ ok: false, error: message }, { status: 422 });
    }

    console.error("Contract PDF generation failed:", error);
    return NextResponse.json({ ok: false, error: "Kunde inte skapa dokumentet." }, { status: 500 });
  }
}
