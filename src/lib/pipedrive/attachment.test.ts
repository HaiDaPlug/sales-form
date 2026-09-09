import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Pipedrive service is mocked wholesale: these tests are about routing
 * decisions (which record a document lands on), not about HTTP.
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
  fileName: "mediacleaning-andersson-ab-2026-08-14.txt",
  contentType: "text/plain; charset=utf-8",
  blob: new Blob(["utkast"], { type: "text/plain" })
};

beforeEach(() => {
  vi.mocked(service.assertDealBelongsToOrganization).mockReset().mockResolvedValue(undefined);
  vi.mocked(service.createNote).mockReset().mockResolvedValue({ id: 900 });
  vi.mocked(service.createOrganization).mockReset().mockResolvedValue({ id: 500 });
  vi.mocked(service.uploadFile).mockReset().mockResolvedValue({ id: 800 });
});

describe("resolveAttachmentTarget (S15, S16, S17, S23)", () => {
  it("prefers the deal when both a deal and an organization are given", () => {
    return expect(resolveAttachmentTarget({ dealId: 42, organizationId: 7 })).resolves.toMatchObject({
      target: { kind: "deal", dealId: 42 }
    });
  });

  it("verifies the deal belongs to the organization before using it", async () => {
    await resolveAttachmentTarget({ dealId: 42, organizationId: 7 });

    expect(service.assertDealBelongsToOrganization).toHaveBeenCalledWith(42, 7);
  });

  it("propagates a mismatched deal/organization pairing", async () => {
    vi.mocked(service.assertDealBelongsToOrganization).mockRejectedValue(new Error("fel organisation"));

    await expect(resolveAttachmentTarget({ dealId: 42, organizationId: 7 })).rejects.toThrow("fel organisation");
  });

  it("falls back to the organization when there is no deal", () => {
    return expect(resolveAttachmentTarget({ organizationId: 7 })).resolves.toMatchObject({
      target: { kind: "organization", organizationId: 7 }
    });
  });

  it("treats a blank deal id as no deal", () => {
    // Untouched form fields arrive as empty strings, not undefined.
    return expect(resolveAttachmentTarget({ dealId: "", organizationId: 7 })).resolves.toMatchObject({
      target: { kind: "organization", organizationId: 7 }
    });
  });

  it("creates an organization when asked and none exists (S17)", async () => {
    const result = await resolveAttachmentTarget({
      createOrganizationFrom: { name: "Andersson AB", address: "Storgatan 1", city: "Stockholm" }
    });

    expect(service.createOrganization).toHaveBeenCalledWith({
      name: "Andersson AB",
      address: "Storgatan 1, Stockholm"
    });
    expect(result.target).toMatchObject({ kind: "organization", organizationId: 500 });
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
      // from the deal step, or the two records cannot be matched later.
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

  it("reports no target when nothing is selected and nothing is to be created", () => {
    return expect(resolveAttachmentTarget({})).resolves.toMatchObject({ target: { kind: "none" } });
  });
});

describe("attachDocument (S15, S16, S21, S22, S23)", () => {
  it("uploads the file and note to the deal when one is selected", async () => {
    const result = await attachDocument({
      dealId: 42,
      organizationId: 7,
      document,
      noteContent: "Mediacleaning genomförd"
    });

    expect(service.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ dealId: 42, fileName: document.fileName })
    );
    expect(service.createNote).toHaveBeenCalledWith(
      expect.objectContaining({ deal_id: 42, content: "Mediacleaning genomförd" })
    );
    expect(result.warning).toBeUndefined();
    expect(result.fileId).toBe(800);
    expect(result.noteId).toBe(900);
  });

  it("uploads to the organization when there is no deal (S16, S23)", async () => {
    await attachDocument({ organizationId: 7, document, noteContent: "Avtal genererat" });

    expect(service.uploadFile).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 7 }));
    expect(service.createNote).toHaveBeenCalledWith(expect.objectContaining({ org_id: 7 }));
  });

  it("never attaches to both a deal and an organization at once", async () => {
    await attachDocument({ dealId: 42, organizationId: 7, document, noteContent: "x" });

    const upload = vi.mocked(service.uploadFile).mock.calls[0]?.[0];

    expect(upload).toHaveProperty("dealId");
    expect(upload).not.toHaveProperty("organizationId");
  });

  it("returns a warning rather than throwing when the upload fails", async () => {
    // The document already exists at this point — the seller must still get it.
    vi.mocked(service.uploadFile).mockRejectedValue(new Error("403 saknar behörighet"));

    const result = await attachDocument({ dealId: 42, document, noteContent: "x" });

    expect(result.warning).toContain("403 saknar behörighet");
  });

  it("returns a warning when there is nowhere to attach", async () => {
    const result = await attachDocument({ document, noteContent: "x" });

    expect(result.target.kind).toBe("none");
    expect(result.warning).toBeTruthy();
    expect(service.uploadFile).not.toHaveBeenCalled();
  });

  it("reports the file as uploaded when only the note failed", async () => {
    // Retrying blind would upload a second copy, so the two outcomes have to be
    // distinguishable.
    vi.mocked(service.createNote).mockRejectedValue(new Error("note misslyckades"));

    const result = await attachDocument({ dealId: 42, document, noteContent: "x" });

    expect(result.fileId).toBe(800);
    expect(result.noteId).toBeUndefined();
    expect(result.warning).toContain("laddades upp");
    expect(result.warning).toContain("anteckningen");
  });

  it("does not attempt the note when the upload failed", async () => {
    vi.mocked(service.uploadFile).mockRejectedValue(new Error("403"));

    const result = await attachDocument({ dealId: 42, document, noteContent: "x" });

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
