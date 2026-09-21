/**
 * The contract types a seller can choose between, and the wording each one
 * prints.
 *
 * Text-only, like the Mediacleaning template: the renderer owns layout and
 * pagination, this module owns the words. The client will supply two contract
 * texts and the names they want shown for them; until then both entries are
 * placeholders, and swapping in the real ones must not touch the renderer,
 * the form or the schema — only this file.
 */

export const CONTRACT_TEMPLATE_IDS = ["template-1", "template-2"] as const;

export type ContractTemplateId = (typeof CONTRACT_TEMPLATE_IDS)[number];

export type ContractTemplate = {
  id: ContractTemplateId;
  /** What the seller sees in the "Avtalstyp" list, and what the note records. */
  label: string;
  /** The page title and the line under it. */
  title: string;
  subtitle: string;
  /** Under "Avtalets omfattning". */
  scope: string;
  /** Under the price and interval. */
  paymentTerms: string;
  /** Under the binding period. */
  termAndNotice: string;
  /** Above the signatures. */
  approval: string;
};

export const DEFAULT_CONTRACT_TEMPLATE_ID: ContractTemplateId = "template-1";

export const CONTRACT_TEMPLATES: readonly ContractTemplate[] = [
  {
    id: "template-1",
    label: "Avtalstyp 1",
    title: "Avtalssammanställning",
    subtitle: "Digital Kontakt Sverige AB",
    scope:
      "Avtalet omfattar de tjänster som anges nedan och utgör kundens sammanställning av den beställda digitala leveransen.",
    paymentTerms: "Betalning sker enligt angivet intervall mot faktura.",
    termAndNotice: "Avtalet löper under angiven bindningstid från avtalets startdag.",
    approval:
      "Genom underskrift bekräftar parterna att uppgifterna ovan har kontrollerats och att avtalstexten har godkänts."
  },
  {
    id: "template-2",
    label: "Avtalstyp 2",
    title: "Avtalssammanställning",
    subtitle: "Digital Kontakt Sverige AB",
    scope:
      "Avtalet omfattar de tjänster som anges nedan. Avtalstyp 2 är en platshållare tills kundens andra avtalstext har levererats.",
    paymentTerms: "Betalning sker enligt angivet intervall mot faktura.",
    termAndNotice: "Avtalet löper under angiven bindningstid från avtalets startdag.",
    approval:
      "Genom underskrift bekräftar parterna att uppgifterna ovan har kontrollerats och att avtalstexten har godkänts."
  }
];

/**
 * The template for a given id. The schema only lets known ids through, so the
 * fallback covers callers that predate the selector, such as saved history
 * payloads, rather than bad input.
 */
export function resolveContractTemplate(id: string | undefined): ContractTemplate {
  return CONTRACT_TEMPLATES.find((template) => template.id === id) ?? CONTRACT_TEMPLATES[0];
}
