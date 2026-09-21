import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage
} from "pdf-lib";
import type { ContractStepInput, MediacleaningStepInput } from "@/lib/crm/schemas";
import type { SellerIdentity } from "@/lib/crm/types";
import { resolveContractTemplate, type ContractTemplate } from "@/lib/pdf/templates/contract";
import {
  draftMediacleaningTemplate,
  type MediacleaningTemplate
} from "@/lib/pdf/templates/mediacleaning";

export type GeneratedDocument = {
  fileName: string;
  contentType: string;
  blob: Blob;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BRAND_NAVY = rgb(22 / 255, 41 / 255, 68 / 255);
const ACCENT_BLUE = rgb(33 / 255, 118 / 255, 222 / 255);
const MUTED = rgb(92 / 255, 105 / 255, 122 / 255);

/**
 * Produces one cancellation letter per supplier, closed by the "Uppsägningar"
 * summary page, in one parseable PDF.
 *
 * The summary is always included and the document carries the customer's
 * name where it used to say "Utkast", both at the client's request. The
 * wording itself is still the placeholder template until theirs arrives.
 */
export async function generateMediacleaningPdf(
  data: MediacleaningStepInput,
  template: MediacleaningTemplate = draftMediacleaningTemplate
): Promise<GeneratedDocument> {
  const document = await PDFDocument.create();
  const writer = await PdfWriter.create(document);

  if (data.documentTypes.includes("cancellation")) {
    data.suppliers.forEach((supplier, index) => {
      writer.startPage(
        template.cancellation.title,
        template.cancellation.subtitle(data, index, data.suppliers.length)
      );
      writer.keyValue("Datum", today());

      writer.heading("Mottagare");
      writer.keyValue("Företag", supplier.name);
      // Blank for most of the shipped list until the client supplies the
      // numbers; `keyValue` omits an empty value rather than printing a label
      // with nothing after it.
      writer.keyValue("Organisationsnummer", supplier.organizationNumber);
      writer.keyValue("Adress", supplier.noticeAddress);
      if (supplier.email) writer.keyValue("E-post", supplier.email);

      writer.heading("Kund");
      writer.keyValue("Namn/företagsnamn", data.companyName);
      // The customer's identity number is what the supplier matches the
      // cancellation to; there is no customer number any more.
      writer.keyValue("Organisationsnummer/personnummer", data.organizationNumber);
      writer.keyValue("Adress", `${data.address}, ${data.city}`);
      writer.keyValue("Firmatecknare", data.signerName);

      writer.heading("Uppsägning");
      template.cancellation.paragraphs(data, supplier).forEach((paragraph) => writer.paragraph(paragraph));
      if (supplier.comment) {
        writer.heading("Kompletterande uppgift");
        writer.paragraph(supplier.comment);
      }

      writer.signature(template.cancellation.signatureLabel, data.signerName);
    });
  }

  // The summary closes every delivery, whatever was selected.
  writer.startPage(template.summary.title, template.summary.subtitle(data));
  writer.heading("Kunduppgifter");
  writer.keyValue("Namn/företagsnamn", data.companyName);
  writer.keyValue("Organisationsnummer/personnummer", data.organizationNumber);
  writer.keyValue("Adress", `${data.address}, ${data.city}`);
  writer.keyValue("Firmatecknare", data.signerName);

  writer.heading(template.summary.supplierHeading);
  if (data.suppliers.length === 0) {
    writer.paragraph(template.summary.noSuppliersText);
  } else {
    data.suppliers.forEach((supplier) => {
      const details = [supplier.organizationNumber, supplier.noticeAddress].filter(Boolean).join(" - ");
      writer.bullet(details ? `${supplier.name} - ${details}` : supplier.name);
    });
  }

  return writer.finish(`Uppsagningar_${sanitizeFileNamePart(data.companyName)}_${today()}.pdf`, data.companyName);
}

/** Combines already-rendered PDFs without coupling their individual templates. */
export async function combinePdfDocuments(
  documents: GeneratedDocument[],
  fileName: string
): Promise<GeneratedDocument> {
  const combined = await PDFDocument.create();

  for (const generated of documents) {
    const source = await PDFDocument.load(await generated.blob.arrayBuffer());
    const pages = await combined.copyPages(source, source.getPageIndices());
    pages.forEach((page) => combined.addPage(page));
  }

  const bytes = await combined.save();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return {
    fileName,
    contentType: "application/pdf",
    blob: new Blob([buffer], { type: "application/pdf" })
  };
}

export function combinedContractFileName(companyName: string): string {
  return `Avtal_och_Mediacleaning_${sanitizeFileNamePart(companyName)}_${today()}.pdf`;
}

/**
 * Creates the contract summary as PDF, in the wording of the contract type
 * the seller chose.
 *
 * The seller printed on it is the logged-in seller, passed in by the route
 * from the session, so the document can never name a colleague. No draft
 * mark anywhere: the seller reviews the document before sending it, so the
 * client asked for it to be delivered as is, named after the customer.
 */
export async function generateContractPdf(
  data: ContractStepInput,
  seller: SellerIdentity,
  template: ContractTemplate = resolveContractTemplate(data.templateId)
): Promise<GeneratedDocument> {
  const document = await PDFDocument.create();
  const writer = await PdfWriter.create(document);

  writer.startPage(template.title, template.subtitle);

  writer.heading("Avtalsparter");
  writer.keyValue("Avtalstyp", template.label);
  writer.keyValue("Leverantör", "Digital Kontakt Sverige AB");
  writer.keyValue("Kund", data.companyName);
  writer.keyValue("Organisationsnummer/personnummer", data.organizationNumber);
  writer.keyValue("Kundens adress", data.address);
  writer.keyValue("Firmatecknare/kontaktperson", data.signerName);
  writer.keyValue("Ansvarig säljare", seller.name);

  writer.heading("Avtalets omfattning");
  writer.paragraph(template.scope);

  writer.heading("Tjänster som ingår");
  data.includedServices.forEach((service) => writer.bullet(service));

  writer.heading("Pris och betalningsvillkor");
  writer.keyValue("Pris/kostnad", formatCurrency(data.price));
  writer.keyValue("Betalningsintervall", paymentIntervalLabel(data.paymentInterval));
  writer.paragraph(template.paymentTerms);

  writer.heading("Avtalstid och uppsägning");
  writer.keyValue("Bindningstid", `${data.bindingPeriodMonths} månader`);
  writer.paragraph(template.termAndNotice);

  writer.keepTogether(190);
  writer.heading("Godkännande");
  writer.paragraph(template.approval);
  writer.signature("För kunden", data.signerName);
  writer.signature("För Digital Kontakt Sverige AB", seller.name);

  return writer.finish(`Avtal_${sanitizeFileNamePart(data.companyName)}_${today()}.pdf`, data.companyName);
}

export function buildMediacleaningNote(data: MediacleaningStepInput, fileName: string): string {
  const suppliers = data.suppliers.map((supplier) => supplier.name).filter(Boolean);

  return [
    "Mediacleaning genomförd",
    `Datum: ${today()}`,
    `Kund: ${data.companyName} (${data.organizationNumber})`,
    `Firmatecknare: ${data.signerName}`,
    `Dokument: ${data.documentTypes.map(documentTypeLabel).join(", ")}`,
    `Leverantörer: ${suppliers.length > 0 ? suppliers.join(", ") : "-"}`,
    `Fil: ${fileName}`,
    data.internalComment ? `Intern kommentar: ${data.internalComment}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildContractNote(data: ContractStepInput, seller: SellerIdentity, fileName: string): string {
  return [
    "Avtalssammanställning genererad",
    `Datum: ${today()}`,
    `Avtalstyp: ${resolveContractTemplate(data.templateId).label}`,
    `Kund: ${data.companyName} (${data.organizationNumber})`,
    `Firmatecknare/kontaktperson: ${data.signerName}`,
    `Pris: ${data.price}`,
    `Betalningsintervall: ${paymentIntervalLabel(data.paymentInterval)}`,
    `Bindningstid: ${data.bindingPeriodMonths} månader`,
    `Säljare: ${seller.name}`,
    `Fil: ${fileName}`
  ].join("\n");
}

function documentTypeLabel(type: MediacleaningStepInput["documentTypes"][number]): string {
  return type === "cancellation" ? "Uppsägning" : "Uppsägningar (sammanställning)";
}

function paymentIntervalLabel(interval: ContractStepInput["paymentInterval"]): string {
  const labels = {
    monthly: "Månadsvis",
    quarterly: "Kvartalsvis",
    semiannual: "Var 6:e månad / halvårsvis"
  } as const;
  return labels[interval];
}

function formatCurrency(value: number): string {
  return `${new Intl.NumberFormat("sv-SE").format(value)} SEK`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function sanitizeFileNamePart(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "okant"
  );
}

class PdfWriter {
  private page!: PDFPage;
  private y = 0;
  private pageTitle = "";
  private pageSubtitle = "";

  private constructor(
    private readonly document: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont
  ) {}

  static async create(document: PDFDocument): Promise<PdfWriter> {
    const regular = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    return new PdfWriter(document, regular, bold);
  }

  startPage(title: string, subtitle: string): void {
    this.pageTitle = title;
    this.pageSubtitle = subtitle;
    this.page = this.document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 92, width: PAGE_WIDTH, height: 92, color: BRAND_NAVY });
    this.page.drawText(pdfText(title), { x: MARGIN, y: PAGE_HEIGHT - 55, size: 20, font: this.bold, color: rgb(1, 1, 1) });
    this.page.drawText(pdfText(subtitle), { x: MARGIN, y: PAGE_HEIGHT - 76, size: 9, font: this.regular, color: rgb(0.8, 0.86, 0.94) });
    this.y = PAGE_HEIGHT - 122;
  }

  heading(text: string): void {
    this.ensureSpace(34);
    this.y -= 8;
    this.page.drawText(pdfText(text), { x: MARGIN, y: this.y, size: 13, font: this.bold, color: BRAND_NAVY });
    this.page.drawLine({ start: { x: MARGIN, y: this.y - 6 }, end: { x: MARGIN + CONTENT_WIDTH, y: this.y - 6 }, thickness: 1, color: ACCENT_BLUE });
    this.y -= 25;
  }

  keyValue(label: string, value: string | number | undefined): void {
    if (value === undefined || String(value).trim() === "") return;
    this.ensureSpace(18);
    const labelText = `${label}:`;
    const labelWidth = Math.min(220, Math.max(150, this.bold.widthOfTextAtSize(pdfText(labelText), 9.5) + 14));
    this.page.drawText(pdfText(labelText), { x: MARGIN, y: this.y, size: 9.5, font: this.bold, color: BRAND_NAVY });
    this.drawWrapped(String(value), MARGIN + labelWidth, this.y, 9.5, CONTENT_WIDTH - labelWidth, this.regular, rgb(0.08, 0.12, 0.18), 13);
    this.y -= Math.max(17, wrappedLineCount(String(value), this.regular, 9.5, CONTENT_WIDTH - labelWidth) * 13);
  }

  keepTogether(height: number): void {
    this.ensureSpace(height);
  }

  paragraph(text: string): void {
    const lines = wrappedLineCount(text, this.regular, 9.5, CONTENT_WIDTH);
    this.ensureSpace(lines * 14 + 10);
    this.drawWrapped(text, MARGIN, this.y, 9.5, CONTENT_WIDTH, this.regular, rgb(0.08, 0.12, 0.18), 14);
    this.y -= lines * 14 + 10;
  }

  bullet(text: string): void {
    const width = CONTENT_WIDTH - 18;
    const lines = wrappedLineCount(text, this.regular, 9.5, width);
    this.ensureSpace(lines * 14 + 4);
    this.page.drawCircle({ x: MARGIN + 4, y: this.y + 3, size: 2, color: ACCENT_BLUE });
    this.drawWrapped(text, MARGIN + 16, this.y, 9.5, width, this.regular, rgb(0.08, 0.12, 0.18), 14);
    this.y -= lines * 14 + 4;
  }

  signature(label: string, printedName: string): void {
    this.ensureSpace(62);
    this.y -= 25;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: MARGIN + 220, y: this.y }, thickness: 0.8, color: MUTED });
    this.page.drawText(pdfText(label), { x: MARGIN, y: this.y - 15, size: 8, font: this.regular, color: MUTED });
    this.page.drawText(pdfText(printedName), { x: MARGIN + 235, y: this.y - 1, size: 9, font: this.regular, color: BRAND_NAVY });
    this.y -= 36;
  }

  /** `footerLabel` sits between the company and the page count: the customer's name. */
  async finish(fileName: string, footerLabel: string): Promise<GeneratedDocument> {
    this.document.setTitle(pdfText(this.pageTitle));
    this.document.setAuthor("Digital Kontakt Sverige AB");
    this.document.setCreator("Digital Kontakt Sales Portal");
    this.document.setCreationDate(new Date());

    const pages = this.document.getPages();
    pages.forEach((page, index) => {
      const footer = `Digital Kontakt Sverige AB  |  ${footerLabel}  |  Sida ${index + 1} av ${pages.length}`;
      page.drawText(pdfText(footer), { x: MARGIN, y: 24, size: 7.5, font: this.regular, color: MUTED });
    });

    const bytes = await this.document.save();
    const pdfBytes = new Uint8Array(bytes);
    return {
      fileName,
      contentType: "application/pdf",
      blob: new Blob([pdfBytes], { type: "application/pdf" })
    };
  }

  private ensureSpace(height: number): void {
    if (this.y - height >= 54) return;
    this.startPage(this.pageTitle, `${this.pageSubtitle} - fortsättning`);
  }

  private drawWrapped(
    text: string,
    x: number,
    y: number,
    size: number,
    maxWidth: number,
    font: PDFFont,
    color: ReturnType<typeof rgb>,
    lineHeight: number
  ): void {
    wrapText(text, font, size, maxWidth).forEach((line, index) => {
      this.page.drawText(line, { x, y: y - index * lineHeight, size, font, color });
    });
  }
}

function wrappedLineCount(text: string, font: PDFFont, size: number, maxWidth: number): number {
  return wrapText(text, font, size, maxWidth).length;
}

function wrapText(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = pdfText(value)
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => splitWideWord(word, font, size, maxWidth));
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let line = words[0];

  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }

  lines.push(line);
  return lines;
}

function splitWideWord(word: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];

  const chunks: string[] = [];
  let chunk = "";

  for (const character of word) {
    const candidate = `${chunk}${character}`;
    if (chunk && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      chunks.push(chunk);
      chunk = character;
    } else {
      chunk = candidate;
    }
  }

  if (chunk) chunks.push(chunk);
  return chunks;
}

/** Standard PDF fonts use WinAnsi; keep Swedish text and replace unsupported glyphs safely. */
function pdfText(value: string): string {
  return value
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\u0009\u000A\u000D\u0020-\u00FF]/g, "?");
}
