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
    /** Under the title of each letter; carries the customer's name, never "Utkast". */
    subtitle: (data: MediacleaningStepInput, index: number, total: number) => string;
    paragraphs: (data: MediacleaningStepInput, supplier: Supplier) => string[];
    signatureLabel: string;
  };
  /** The closing page listing every supplier the letters went to. */
  summary: {
    title: string;
    subtitle: (data: MediacleaningStepInput) => string;
    supplierHeading: string;
    noSuppliersText: string;
  };
};

/**
 * Placeholder until the client supplies the approved Mediacleaning wording;
 * swapped wholesale when it arrives. Named after the customer throughout: the
 * client asked for the "Utkast" marks to go, and for the summary page to be
 * headed "Uppsägningar" and included in every delivery.
 */
export const draftMediacleaningTemplate: MediacleaningTemplate = {
  id: "digital-kontakt-mediacleaning-draft-v1",
  cancellation: {
    title: "Uppsägning av avtal",
    subtitle: (data, index, total) => `${data.companyName} · ${index + 1} av ${total}`,
    paragraphs: (data, supplier) => [
      `Härmed säger ${data.companyName} upp samtliga avtal och abonnemang hos ${supplier.name}. ` +
        "Uppsägningen ska gälla från tidigast möjliga datum enligt tillämpliga avtalsvillkor.",
      "Vi begär skriftlig bekräftelse på att uppsägningen har mottagits samt besked om avtalens slutdatum.",
      "Om det är tillämpligt begär kunden även att personuppgifter som inte längre behövs raderas enligt GDPR."
    ],
    signatureLabel: "Kundens underskrift eller namn"
  },
  summary: {
    title: "Uppsägningar",
    subtitle: (data) => data.companyName,
    supplierHeading: "Avtal och leverantörer som sagts upp",
    noSuppliersText: "Inga leverantörer har lagts till."
  }
};
