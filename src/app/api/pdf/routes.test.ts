import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level failure boundaries for the two document workflows.
 *
 * The point of no return is document generation: from there on the seller is
 * getting a file, and possibly a Pipedrive upload. Nothing after that may turn
 * the request into an error, because the seller's retry is what creates a
 * second upload — and, for Mediacleaning, a second organization.
 */
vi.mock("@/lib/auth/server", () => ({
  requireSession: vi.fn(async () => ({ subject: "Roble", username: "roble", sellerOptionId: 73 })),
  sellerFromSession: (session: { subject: string; sellerOptionId: number }) => ({
    optionId: session.sellerOptionId,
    name: session.subject
  }),
  UnauthorizedError: class UnauthorizedError extends Error {}
}));

vi.mock("@/lib/history/store", () => ({
  recordHistory: vi.fn(),
  recordHistorySafely: vi.fn()
}));

vi.mock("@/lib/pipedrive/attachment", () => ({
  attachDocument: vi.fn(),
  attachmentHeaders: vi.fn(() => ({ "X-Attachment-Target": "deal" }))
}));

const { recordHistorySafely } = await import("@/lib/history/store");
const { attachDocument } = await import("@/lib/pipedrive/attachment");
const { POST: mediacleaningPost } = await import("@/app/api/pdf/mediacleaning/route");
const { POST: contractPost } = await import("@/app/api/pdf/contract/route");

function request(body: unknown) {
  return new Request("http://localhost/api/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }) as never;
}

const mediacleaningBody = {
  companyName: "Andersson AB",
  organizationNumber: "556677-8899",
  address: "Storgatan 1",
  city: "Stockholm",
  signerName: "Anna Andersson",
  documentTypes: ["cancellation"],
  suppliers: [{ name: "Eniro Group AB", noticeAddress: "Box 100, 111 11 Stockholm" }],
  organizationId: 7,
  dealId: 42
};

const contractBody = {
  contract: {
    companyName: "Andersson AB",
    organizationNumber: "556677-8899",
    signerName: "Anna Andersson",
    address: "Storgatan 1",
    price: 1200,
    paymentInterval: "monthly",
    bindingPeriodMonths: 12,
    includedServices: ["Digital Kontakt"],
    dealId: 42
  }
};

beforeEach(() => {
  vi.mocked(recordHistorySafely).mockReset().mockResolvedValue(undefined);
  vi.mocked(attachDocument)
    .mockReset()
    .mockResolvedValue({ organizationId: 7, noteTarget: { kind: "lead", leadId: "lead-1" }, fileId: 800, noteId: 900 });
});

describe.each([
  ["mediacleaning", mediacleaningPost, mediacleaningBody],
  ["contract", contractPost, contractBody]
])("%s route history failure", (_name, handler, body) => {
  it("still returns the generated PDF when history recording fails", async () => {
    // The file is already uploaded at this point; failing the request would
    // make the seller retry and upload a duplicate.
    vi.mocked(recordHistorySafely).mockRejectedValue(new Error("disk full"));

    const response = await handler(request(body));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("attaches exactly once during a request whose history fails", async () => {
    vi.mocked(recordHistorySafely).mockRejectedValue(new Error("disk full"));

    await handler(request(body));

    expect(attachDocument).toHaveBeenCalledTimes(1);
  });

  it("returns the PDF and attaches once on the happy path", async () => {
    const response = await handler(request(body));

    expect(response.status).toBe(200);
    expect(attachDocument).toHaveBeenCalledTimes(1);
  });

  it("still returns the document when the attachment failed", async () => {
    vi.mocked(attachDocument).mockResolvedValue({
      warning: "Kunde inte kopplas i Pipedrive."
    });

    const response = await handler(request(body));

    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("records a failed attachment as a warning, not an error", async () => {
    vi.mocked(attachDocument).mockResolvedValue({
      warning: "Kunde inte kopplas i Pipedrive."
    });

    await handler(request(body));

    expect(recordHistorySafely).toHaveBeenCalledWith(expect.objectContaining({ status: "warning" }));
  });

  it("records a successful run as success, scoped to the session's seller", async () => {
    await handler(request(body));

    expect(recordHistorySafely).toHaveBeenCalledWith(
      expect.objectContaining({ status: "success", createdBy: "Roble", sellerOptionId: 73 })
    );
  });

  it("rejects an invalid submission before generating anything", async () => {
    const response = await handler(request({}));

    expect(response.status).toBe(422);
    expect(attachDocument).not.toHaveBeenCalled();
  });
});
