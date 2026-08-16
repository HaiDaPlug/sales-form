import type { MediacleaningStepInput } from "@/lib/crm/schemas";

type Supplier = MediacleaningStepInput["suppliers"][number];

/**
 * Text-only contract between the PDF renderer and the client's legal template.
 * Replacing approved wording later should require a new template object, not
 * changes to pagination, Pipedrive attachment logic or form handling.
 */
export type MediacleaningTemplate = {
  id: string;
  cancellation: {
    title: string;
    subtitle: (index: number, total: number) => string;
    draftNotice: string;
    paragraphs: (data: MediacleaningStepInput, supplier: Supplier) => string[];
    signatureLabel: string;
  };
  agreementSummary: {
    title: string;
    subtitle: string;
    draftNotice: string;
    supplierHeading: string;
    noSuppliersText: string;
  };
};

/**
 * Safe placeholder until the client confirms the supplied Mediacleaning
 * template. It remains visibly marked as a draft and can be swapped wholesale.
 */
export const draftMediacleaningTemplate: MediacleaningTemplate = {
  id: "digital-kontakt-mediacleaning-draft-v1",
  cancellation: {
    title: "Uppsägning av avtal",
    subtitle: (index, total) => `Utkast ${index + 1} av ${total}`,
    draftNotice: "Texten ska stämmas av mot kundens godkända Mediacleaning-mall före utskick.",
    paragraphs: (data, supplier) => [
      `Härmed säger ${data.companyName} upp samtliga avtal och abonnemang hos ${supplier.name}. ` +
        "Uppsägningen ska gälla från tidigast möjliga datum enligt tillämpliga avtalsvillkor.",
      "Vi begär skriftlig bekräftelse på att uppsägningen har mottagits samt besked om avtalens slutdatum.",
      "Om det är tillämpligt begär kunden även att personuppgifter som inte längre behövs raderas enligt GDPR."
    ],
    signatureLabel: "Kundens underskrift eller namn"
  },
  agreementSummary: {
    title: "Avtalssammanställning",
    subtitle: "Mediacleaning - utkast",
    draftNotice: "Sammanställningen är ett arbetsunderlag och ska kontrolleras av säljaren.",
    supplierHeading: "Avtal och leverantörer som ska hanteras",
    noSuppliersText: "Inga leverantörer har lagts till."
  }
};
