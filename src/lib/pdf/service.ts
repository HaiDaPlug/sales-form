import type { ContractStepInput, MediacleaningStepInput } from "@/lib/crm/schemas";

/**
 * Draft document generation.
 *
 * These are NOT PDFs yet. No PDF library is installed and the approved Swedish
 * legal copy is still outstanding from the client, so this emits plain text
 * with an honest `.txt` name and `text/plain` type — the previous version
 * labelled the same text as `application/pdf`, which produces a file no reader
 * can open.
 *
 * Replacing this with real PDF rendering means changing this file only; the
 * routes already stream `blob` with `contentType`.
 */
export type GeneratedDocument = {
  fileName: string;
  contentType: string;
  blob: Blob;
};

export async function generateMediacleaningPdf(data: MediacleaningStepInput): Promise<GeneratedDocument> {
  const body = [
    "UTKAST — EJ FÄRDIGT DOKUMENT",
    "Mediacleaning",
    `Kund: ${data.companyName}`,
    `Org.nr: ${data.organizationNumber}`,
    `Adress: ${data.address}, ${data.city}`,
    `Dokument: ${data.documentTypes.join(", ")}`,
    `Leverantörer: ${data.suppliers.map((supplier) => supplier.name).join(", ")}`,
    "",
    "Godkänd svensk avtalstext måste läggas till före produktionsbruk."
  ].join("\n");

  return draftDocument(`mediacleaning-${sanitizeFileNamePart(data.organizationNumber)}`, body);
}

export async function generateContractPdf(data: ContractStepInput): Promise<GeneratedDocument> {
  const body = [
    "UTKAST — EJ FÄRDIGT DOKUMENT",
    "Avtalssammanfattning",
    "Leverantör: Digital Kontakt",
    `Kund: ${data.companyName}`,
    `Org.nr: ${data.organizationNumber}`,
    `Firmatecknare/kontaktperson: ${data.signerName}`,
    `Pris: ${data.price}`,
    `Betalningsintervall: ${data.paymentInterval}`,
    `Bindningstid: ${data.bindingPeriodMonths} månader`,
    `Tjänster: ${data.includedServices.join(", ")}`,
    "",
    "Godkänd svensk avtalstext måste läggas till före produktionsbruk."
  ].join("\n");

  return draftDocument(`avtal-${sanitizeFileNamePart(data.organizationNumber)}`, body);
}

function draftDocument(baseName: string, body: string): GeneratedDocument {
  return {
    fileName: `${baseName}-utkast.txt`,
    contentType: "text/plain; charset=utf-8",
    blob: new Blob([body], { type: "text/plain; charset=utf-8" })
  };
}

/** Keeps user input out of the Content-Disposition header structure. */
function sanitizeFileNamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]/g, "") || "okant";
}
