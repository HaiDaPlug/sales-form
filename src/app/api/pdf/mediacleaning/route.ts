import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireSession, UnauthorizedError } from "@/lib/auth/server";
import { mediacleaningStepSchema } from "@/lib/crm/schemas";
import { recordHistorySafely } from "@/lib/history/store";
import { buildMediacleaningNote, generateMediacleaningPdf } from "@/lib/pdf/service";
import { attachDocument, attachmentHeaders } from "@/lib/pipedrive/attachment";

export async function POST(request: NextRequest) {
  /** Set once the document exists; from then on the request must succeed. */
  let response: NextResponse | undefined;

  try {
    const session = await requireSession();
    const parsed = mediacleaningStepSchema.parse(await request.json());
    const pdf = await generateMediacleaningPdf(parsed);

    // Attached to the deal when one is selected, otherwise to the organization.
    // Never throws: the document exists by now and the seller must receive it
    // even if Pipedrive is unreachable.
    const attachment = await attachDocument({
      dealId: parsed.dealId,
      organizationId: parsed.organizationId,
      createOrganizationFrom: parsed.createOrganization
        ? {
            name: parsed.companyName,
            address: parsed.address,
            city: parsed.city,
            // Mandatory in this step, so a customer registered here carries the
            // same identity as one created from the deal step.
            organizationNumber: parsed.organizationNumber
          }
        : undefined,
      document: pdf,
      noteContent: buildMediacleaningNote(parsed, pdf.fileName)
    });

    // The document itself is returned so the seller actually receives it; the
    // filename travels in a header because the body is now the file.
    //
    // Built before the run is logged, and returned from outside the try block:
    // past this point the PDF exists and may already be uploaded — and an
    // organization may have been created — so nothing may turn this into an
    // error the seller would retry into duplicates.
    response = new NextResponse(pdf.blob, {
      status: 200,
      headers: {
        "Content-Type": pdf.contentType,
        "Content-Disposition": `attachment; filename="${pdf.fileName}"`,
        "X-Document-File-Name": pdf.fileName,
        "X-Document-Draft": "true",
        ...attachmentHeaders(attachment)
      }
    });

    await recordHistorySafely({
      kind: "mediacleaning",
      // The PDF was generated and returned; a failed CRM attachment is a
      // warning on a completed run, not a failed run.
      status: attachment.warning ? "warning" : "success",
      createdBy: session.subject,
      customerName: parsed.companyName,
      summary: `${parsed.documentTypes.join(", ")} för ${parsed.companyName} (${parsed.suppliers.length} leverantörer)`,
      fileName: pdf.fileName,
      pipedriveDealId: parsed.dealId,
      pipedriveOrganizationId: attachment.createdOrganizationId ?? parsed.organizationId,
      errorMessage: attachment.warning,
      payload: parsed
    });
  } catch (error) {
    // The document was already produced, so this failure came from logging or
    // another post-delivery step. Hand over the file rather than reporting a
    // failure the seller would retry.
    if (response) {
      console.error("Mediacleaning document was delivered but a later step failed:", error);
      return response;
    }

    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 401 });
    }

    if (error instanceof ZodError) {
      const message = error.issues.map((issue) => `${issue.path.join(".") || "form"}: ${issue.message}`).join("; ");
      return NextResponse.json({ ok: false, error: message }, { status: 422 });
    }

    console.error("Mediacleaning PDF generation failed:", error);
    return NextResponse.json({ ok: false, error: "Kunde inte skapa dokumentet." }, { status: 500 });
  }

  return response;
}
