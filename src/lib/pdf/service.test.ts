import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  buildContractNote,
  buildMediacleaningNote,
  combinedContractFileName,
  combinePdfDocuments,
  generateContractPdf,
  generateMediacleaningPdf
} from "@/lib/pdf/service";
import { draftMediacleaningTemplate } from "@/lib/pdf/templates/mediacleaning";
import type { ContractStepInput, MediacleaningStepInput } from "@/lib/crm/schemas";

function supplier(overrides: Record<string, unknown> = {}) {
  return { name: "Eniro Group AB", noticeAddress: "Box 100, 111 11 Stockholm", ...overrides };
}

function mediacleaning(overrides: Partial<MediacleaningStepInput> = {}): MediacleaningStepInput {
  return {
    companyName: "Andersson AB",
    organizationNumber: "556677-8899",
    address: "Storgatan 1",
    city: "Stockholm",
    documentTypes: ["cancellation"],
    suppliers: [supplier()],
    ...overrides
  } as MediacleaningStepInput;
}

function contract(overrides: Partial<ContractStepInput> = {}): ContractStepInput {
  return {
    companyName: "Andersson AB",
    organizationNumber: "556677-8899",
    signerName: "Anna Andersson",
    address: "Storgatan 1",
    sellerName: "Roble",
    price: 1200,
    paymentInterval: "monthly",
    bindingPeriodMonths: 12,
    includedServices: ["Digital Kontakt", "Företagsprofil"],
    ...overrides
  } as ContractStepInput;
}

/** Parses the produced bytes back, which also proves the file is a valid PDF. */
async function pageCount(blob: Blob): Promise<number> {
  const document = await PDFDocument.load(await blob.arrayBuffer());
  return document.getPageCount();
}

describe("generateMediacleaningPdf (S18, S24)", () => {
  it("produces a real, parseable PDF", async () => {
    const result = await generateMediacleaningPdf(mediacleaning());

    expect(result.contentType).toBe("application/pdf");
    expect(result.fileName.endsWith(".pdf")).toBe(true);
    await expect(pageCount(result.blob)).resolves.toBeGreaterThan(0);
  });

  it("writes one cancellation page per supplier (S18)", async () => {
    const result = await generateMediacleaningPdf(
      mediacleaning({
        suppliers: [supplier({ name: "Eniro" }), supplier({ name: "Hitta.se" }), supplier({ name: "Merinfo" })]
      })
    );

    expect(await pageCount(result.blob)).toBe(3);
  });

  it("adds a page for the agreement summary when both are selected (S24)", async () => {
    const result = await generateMediacleaningPdf(
      mediacleaning({ documentTypes: ["cancellation", "agreementSummary"] })
    );

    // One cancellation plus one summary.
    expect(await pageCount(result.blob)).toBe(2);
  });

  it("produces only the summary when no cancellation is selected", async () => {
    const result = await generateMediacleaningPdf(
      mediacleaning({ documentTypes: ["agreementSummary"], suppliers: [] })
    );

    expect(await pageCount(result.blob)).toBe(1);
  });

  it("puts the customer name and date in the file name", async () => {
    const result = await generateMediacleaningPdf(mediacleaning());

    expect(result.fileName).toMatch(/^Uppsagningar_Andersson_AB_\d{4}-\d{2}-\d{2}_utkast\.pdf$/);
  });

  it("folds Swedish characters in the file name instead of dropping them", async () => {
    const result = await generateMediacleaningPdf(mediacleaning({ companyName: "Åkessons Måleri" }));

    expect(result.fileName).toContain("Akessons_Maleri");
  });

  it("names the file after the summary when only the summary is produced", async () => {
    const result = await generateMediacleaningPdf(
      mediacleaning({ documentTypes: ["agreementSummary"], suppliers: [] })
    );

    expect(result.fileName).toMatch(/^Avtalssammanstallning_/);
  });

  it("renders a personnummer customer without failing on the identity field", async () => {
    const result = await generateMediacleaningPdf(
      mediacleaning({ companyName: "Anna Andersson", organizationNumber: "850101-1234" })
    );

    await expect(pageCount(result.blob)).resolves.toBe(1);
  });

  it("accepts a replaceable client template without changing the renderer", async () => {
    const result = await generateMediacleaningPdf(mediacleaning(), {
      ...draftMediacleaningTemplate,
      id: "client-template-v1",
      cancellation: {
        ...draftMediacleaningTemplate.cancellation,
        paragraphs: () => ["Godkänd malltext placeras här."]
      }
    });

    await expect(pageCount(result.blob)).resolves.toBe(1);
  });
});

describe("generateContractPdf (S22)", () => {
  it("produces a real, parseable PDF", async () => {
    const result = await generateContractPdf(contract());

    expect(result.contentType).toBe("application/pdf");
    await expect(pageCount(result.blob)).resolves.toBeGreaterThan(0);
  });

  it("puts the customer name and date in the file name", async () => {
    const result = await generateContractPdf(contract());

    expect(result.fileName).toMatch(/^Avtal_Andersson_AB_\d{4}-\d{2}-\d{2}_utkast\.pdf$/);
  });

  it("renders every included service without failing", async () => {
    const result = await generateContractPdf(
      contract({ includedServices: Array.from({ length: 25 }, (_, index) => `Tjänst ${index + 1}`) })
    );

    // Long lists must flow onto a second page rather than overflow one.
    expect(await pageCount(result.blob)).toBeGreaterThan(1);
  });
});

describe("combined contract and Mediacleaning package (5.4)", () => {
  it("contains all pages from both generated documents", async () => {
    const contractPdf = await generateContractPdf(contract());
    const mediaPdf = await generateMediacleaningPdf(
      mediacleaning({ documentTypes: ["cancellation", "agreementSummary"] })
    );
    const combined = await combinePdfDocuments(
      [contractPdf, mediaPdf],
      combinedContractFileName("Andersson AB")
    );

    expect(await pageCount(combined.blob)).toBe(
      (await pageCount(contractPdf.blob)) + (await pageCount(mediaPdf.blob))
    );
    expect(combined.fileName).toMatch(/^Avtal_och_Mediacleaning_Andersson_AB_/);
  });
});

/** S21 — the note must be consistent enough to search and follow up. */
describe("buildMediacleaningNote (S21)", () => {
  it("names the suppliers, documents and file", () => {
    const note = buildMediacleaningNote(
      mediacleaning({ suppliers: [supplier({ name: "Eniro" }), supplier({ name: "Merinfo" })] }),
      "Uppsagningar_Andersson_AB_2026-08-14_utkast.pdf"
    );

    expect(note).toContain("Mediacleaning genomförd");
    expect(note).toContain("Leverantörer: Eniro, Merinfo");
    expect(note).toContain("Dokument: Uppsägning");
    expect(note).toContain("Fil: Uppsagningar_Andersson_AB_2026-08-14_utkast.pdf");
  });

  it("includes the date", () => {
    expect(buildMediacleaningNote(mediacleaning(), "fil.pdf")).toMatch(/Datum: \d{4}-\d{2}-\d{2}/);
  });

  it("includes the internal comment when there is one", () => {
    const note = buildMediacleaningNote(mediacleaning({ internalComment: "Kund vill bli uppringd" }), "fil.pdf");

    expect(note).toContain("Intern kommentar: Kund vill bli uppringd");
  });

  it("omits the internal comment line when there is none", () => {
    expect(buildMediacleaningNote(mediacleaning(), "fil.pdf")).not.toContain("Intern kommentar");
  });
});

describe("buildContractNote (S22)", () => {
  it("records price, interval, binding period, seller and file", () => {
    const note = buildContractNote(contract(), "avtal.pdf");

    expect(note).toContain("Avtalssammanställning genererad");
    expect(note).toContain("Pris: 1200");
    expect(note).toContain("Betalningsintervall: Månadsvis");
    expect(note).toContain("Bindningstid: 12 månader");
    expect(note).toContain("Säljare: Roble");
    expect(note).toContain("Fil: avtal.pdf");
  });
});
