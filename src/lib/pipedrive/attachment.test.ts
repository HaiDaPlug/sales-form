import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Pipedrive service is mocked wholesale: these tests are about routing
 * decisions (which record a document and its note land on), not about HTTP.
 */
vi.mock("@/lib/pipedrive/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pipedrive/service")>()),
  assertDealBelongsToOrganization: vi.fn(),
  createNote: vi.fn(),
  createOrganization: vi.fn(),
  uploadFile: vi.fn()
  // `buildOrganizationPayload` and `DealOwnershipError` come from the real
  // module: the first is a pure function whose output these tests assert on,
  // the second is only needed as an error type.
}));

const service = await import("@/lib/pipedrive/service");
const { attachDocument, resolveAttachmentTarget } = await import("@/lib/pipedrive/attachment");
const { resetEnvCache } = await import("@/lib/config/env");

const document = {
  fileName: "mediacleaning-andersson-ab-2026-08-14.pdf",
  contentType: "application/pdf",
  blob: new Blob(["utkast"], { type: "application/pdf" })
};

beforeEach(() => {
  vi.mocked(service.assertDealBelongsToOrganization).mockReset().mockResolvedValue(undefined);
  vi.mocked(service.createNote).mockReset().mockResolvedValue({ id: 900 });
  vi.mocked(service.createOrganization).mockReset().mockResolvedValue({ id: 500 });
  vi.mocked(service.uploadFile).mockReset().mockResolvedValue({ id: 800 });
});

describe("resolveAttachmentTarget (S15, S16, S17, S23)", () => {
  /**
   * The client's rule: documents are sent as Smart Docs from the customer's own
   * page, so the file belongs to the organization whatever sale it came from.
   */
  it("files the document under the organization even when a sale is linked", async () => {
    const resolved = await resolveAttachmentTarget({ leadId: "lead-1", dealId: 42, organizationId: 7 });

    expect(resolved.organizationId).toBe(7);
  });

  it("verifies a linked deal belongs to the organization before using it", async () => {
    await resolveAttachmentTarget({ dealId: 42, organizationId: 7 });

    expect(service.assertDealBelongsToOrganization).toHaveBeenCalledWith(42, 7);
  });

  it("propagates a mismatched deal/organization pairing", async () => {
    vi.mocked(service.assertDealBelongsToOrganization).mockRejectedValue(new Error("fel organisation"));

    await expect(resolveAttachmentTarget({ dealId: 42, organizationId: 7 })).rejects.toThrow("fel organisation");
  });

  /** The internal comment belongs with the sale, in this order of preference. */
  it.each([
    ["the prospect when one is linked", { leadId: "lead-1", dealId: 42, organizationId: 7 }, { kind: "lead", leadId: "lead-1" }],
    ["the deal when there is no prospect", { dealId: 42, organizationId: 7 }, { kind: "deal", dealId: 42 }],
    ["the organization when there is neither", { organizationId: 7 }, { kind: "organization", organizationId: 7 }]
  ])("sends the note to %s", async (_label, input, expected) => {
    const resolved = await resolveAttachmentTarget(input);

    expect(resolved.noteTarget).toEqual(expected);
  });

  it("treats blank ids as absent", async () => {
    // Untouched form fields arrive as empty strings, not undefined.
    const resolved = await resolveAttachmentTarget({ leadId: "", dealId: "", organizationId: 7 });

    expect(resolved.noteTarget).toEqual({ kind: "organization", organizationId: 7 });
  });

  it("creates an organization when asked and none exists (S17)", async () => {
    const result = await resolveAttachmentTarget({
      createOrganizationFrom: { name: "Andersson AB", address: "Storgatan 1", city: "Stockholm" }
    });

    expect(service.createOrganization).toHaveBeenCalledWith({
      name: "Andersson AB",
      address: "Storgatan 1, Stockholm"
    });
    expect(result.organizationId).toBe(500);
    expect(result.createdOrganizationId).toBe(500);
  });

  it("stores the identity number of a customer registered from Mediacleaning (S17)", async () => {
    process.env.PIPEDRIVE_FIELD_ORG_NUMBER = "orgnr_field_key";
    resetEnvCache();

    try {
      await resolveAttachmentTarget({
        createOrganizationFrom: {
          name: "Andersson AB",
          address: "Storgatan 1",
          city: "Stockholm",
          organizationNumber: "556677-8899"
        }
      });

      // A customer registered here must carry the same identity as one created
      // from the prospect step, or the two records cannot be matched later.
      expect(service.createOrganization).toHaveBeenCalledWith(
        expect.objectContaining({ orgnr_field_key: "556677-8899" })
      );
    } finally {
      delete process.env.PIPEDRIVE_FIELD_ORG_NUMBER;
      resetEnvCache();
    }
  });

  it("does not create an organization when one is already selected", async () => {
    await resolveAttachmentTarget({
      organizationId: 7,
      createOrganizationFrom: { name: "Andersson AB" }
    });

    expect(service.createOrganization).not.toHaveBeenCalled();
  });
});

describe("attachDocument (S15, S16, S21, S22, S23)", () => {
  it("uploads the file to the organization and notes the prospect", async () => {
    const result = await attachDocument({
      leadId: "lead-1",
      organizationId: 7,
      document,
      noteContent: "Mediacleaning genomförd"
    });

    expect(service.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 7, fileName: document.fileName })
    );
    expect(service.createNote).toHaveBeenCalledWith(
      expect.objectContaining({ lead_id: "lead-1", content: "Mediacleaning genomförd" })
    );
    expect(result.warning).toBeUndefined();
    expect(result.fileId).toBe(800);
    expect(result.noteId).toBe(900);
  });

  /** The document must never be uploaded to the prospect (client's rule). */
  it("never uploads the file to the prospect or the deal", async () => {
    await attachDocument({ leadId: "lead-1", dealId: 42, organizationId: 7, document, noteContent: "x" });

    const upload = vi.mocked(service.uploadFile).mock.calls[0]?.[0];

    expect(upload).toHaveProperty("organizationId");
    expect(upload).not.toHaveProperty("leadId");
    expect(upload).not.toHaveProperty("dealId");
  });

  it("notes an existing deal when there is no prospect", async () => {
    await attachDocument({ dealId: 42, organizationId: 7, document, noteContent: "Avtal genererat" });

    expect(service.createNote).toHaveBeenCalledWith(expect.objectContaining({ deal_id: 42 }));
  });

  it("returns a warning rather than throwing when the upload fails", async () => {
    // The document already exists at this point — the seller must still get it.
    vi.mocked(service.uploadFile).mockRejectedValue(new Error("403 saknar behörighet"));

    const result = await attachDocument({ organizationId: 7, document, noteContent: "x" });

    expect(result.warning).toContain("403 saknar behörighet");
  });

  it("returns a warning when there is no organization to file under", async () => {
    const result = await attachDocument({ document, noteContent: "x" });

    expect(result.organizationId).toBeUndefined();
    expect(result.warning).toBeTruthy();
    expect(service.uploadFile).not.toHaveBeenCalled();
  });

  it("reports the file as uploaded when only the note failed", async () => {
    // Retrying blind would upload a second copy, so the two outcomes have to be
    // distinguishable.
    vi.mocked(service.createNote).mockRejectedValue(new Error("note misslyckades"));

    const result = await attachDocument({ organizationId: 7, document, noteContent: "x" });

    expect(result.fileId).toBe(800);
    expect(result.noteId).toBeUndefined();
    expect(result.warning).toContain("laddades upp");
    expect(result.warning).toContain("anteckningen");
  });

  it("does not attempt the note when the upload failed", async () => {
    vi.mocked(service.uploadFile).mockRejectedValue(new Error("403"));

    const result = await attachDocument({ organizationId: 7, document, noteContent: "x" });

    expect(service.createNote).not.toHaveBeenCalled();
    expect(result.fileId).toBeUndefined();
  });

  it("keeps a created organization id even when the upload then fails", async () => {
    // The organization exists; losing its id would duplicate it on retry.
    vi.mocked(service.uploadFile).mockRejectedValue(new Error("403"));

    const result = await attachDocument({
      createOrganizationFrom: { name: "Andersson AB" },
      document,
      noteContent: "x"
    });

    expect(result.createdOrganizationId).toBe(500);
    expect(result.warning).toBeTruthy();
  });

  it("returns a warning when the deal belongs to another organization", async () => {
    vi.mocked(service.assertDealBelongsToOrganization).mockRejectedValue(
      new Error("Den valda affären tillhör en annan organisation.")
    );

    const result = await attachDocument({ dealId: 42, organizationId: 7, document, noteContent: "x" });

    expect(result.warning).toContain("annan organisation");
    expect(service.uploadFile).not.toHaveBeenCalled();
  });
});
