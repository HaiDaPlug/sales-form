import type { ContractStepData, MediacleaningStepData } from "@/lib/crm/types";

export type GeneratedPdf = {
  fileName: string;
  blob: Blob;
};

export async function generateMediacleaningPdf(data: MediacleaningStepData): Promise<GeneratedPdf> {
  const body = [
    "DRAFT PDF PLACEHOLDER",
    "Mediacleaning",
    `Kund: ${data.companyName}`,
    `Org.nr: ${data.organizationNumber}`,
    `Adress: ${data.address}, ${data.city}`,
    `Dokument: ${data.documentTypes.join(", ")}`,
    `Leverantörer: ${data.suppliers.map((supplier) => supplier.name).join(", ")}`,
    "",
    "Approved Swedish legal copy must be added before production use."
  ].join("\n");

  return textPdfPlaceholder(`mediacleaning-${data.organizationNumber}.pdf`, body);
}

export async function generateContractPdf(data: ContractStepData): Promise<GeneratedPdf> {
  const body = [
    "DRAFT PDF PLACEHOLDER",
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
    "Approved Swedish legal copy must be added before production use."
  ].join("\n");

  return textPdfPlaceholder(`avtal-${data.organizationNumber}.pdf`, body);
}

function textPdfPlaceholder(fileName: string, body: string): GeneratedPdf {
  return {
    fileName,
    blob: new Blob([body], { type: "application/pdf" })
  };
}
