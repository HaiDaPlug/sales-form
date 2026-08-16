import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireSession, UnauthorizedError } from "@/lib/auth/server";
import { contractDocumentRequestSchema } from "@/lib/crm/schemas";
import { recordHistorySafely } from "@/lib/history/store";
import {
  buildContractNote,
  buildMediacleaningNote,
  combinedContractFileName,
  combinePdfDocuments,
  generateContractPdf,
  generateMediacleaningPdf
} from "@/lib/pdf/service";
import { attachDocument, attachmentHeaders } from "@/lib/pipedrive/attachment";

export async function POST(request: NextRequest) {
  /** Set once the document exists; from then on the request must succeed. */
  let response: NextResponse | undefined;

  try {
    const session = await requireSession();
    const parsed = contractDocumentRequestSchema.parse(await request.json());
    const contract = parsed.contract;
    const contractPdf = await generateContractPdf(contract);
    const pdf = contract.includeMediacleaningDocuments && parsed.mediacleaning
      ? await combinePdfDocuments(
          [contractPdf, await generateMediacleaningPdf(parsed.mediacleaning)],
          combinedContractFileName(contract.companyName)
        )
      : contractPdf;

    const noteContent = [
      buildContractNote(contract, pdf.fileName),
      contract.includeMediacleaningDocuments && parsed.mediacleaning
        ? buildMediacleaningNote(parsed.mediacleaning, pdf.fileName)
        : ""
    ]
      .filter(Boolean)
      .join("\n\n");

    // Deal first, organization otherwise (S22/S23). Contract generation never
    // creates a deal, and never creates an organization either — the seller
    // must have selected one.
    const attachment = await attachDocument({
      dealId: contract.dealId,
      organizationId: contract.organizationId,
      document: pdf,
      noteContent
    });

    // The document itself is returned so the seller actually receives it; the
    // filename travels in a header because the body is now the file.
    //
    // Built before the run is logged, and returned from outside the try block:
    // past this point the PDF exists and may already be uploaded, so nothing —
    // including a broken history store — may turn this into an error the seller
    // would retry into a duplicate upload.
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
      kind: "contract",
      // The PDF was generated and returned; a failed CRM attachment is a
      // warning on a completed run, not a failed run.
      status: attachment.warning ? "warning" : "success",
      createdBy: session.subject,
      customerName: contract.companyName,
      summary: `Avtal för ${contract.companyName} — ${contract.price} (${contract.paymentInterval})${
        contract.includeMediacleaningDocuments ? " + Mediacleaning" : ""
      }`,
      fileName: pdf.fileName,
      pipedriveDealId: contract.dealId,
      pipedriveOrganizationId: contract.organizationId,
      errorMessage: attachment.warning,
      payload: parsed
    });
  } catch (error) {
    // The document was already produced, so this failure came from logging or
    // another post-delivery step. Hand over the file rather than reporting a
    // failure the seller would retry.
    if (response) {
      console.error("Contract document was delivered but a later step failed:", error);
      return response;
    }

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

  return response;
}
