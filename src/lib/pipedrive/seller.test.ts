import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/config/env";

vi.mock("@/lib/pipedrive/client", () => ({
  pipedriveRequest: vi.fn(),
  PipedriveApiError: class PipedriveApiError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
}));

const { pipedriveRequest } = await import("@/lib/pipedrive/client");
const { getSellers, resetDealFieldsCache } = await import("@/lib/pipedrive/service");

/**
 * "Affärens säljare" holds the sellers as enum options because they have no
 * Pipedrive user account of their own. Keys are account-specific, so the tests
 * set them from the environment rather than hardcoding the live ones.
 */
const SELLER_KEY = "seller_field_key";

beforeEach(() => {
  vi.mocked(pipedriveRequest).mockReset();
  resetDealFieldsCache();
  process.env.PIPEDRIVE_FIELD_AFFARENS_SALJARE = SELLER_KEY;
  resetEnvCache();
});

afterEach(() => {
  delete process.env.PIPEDRIVE_FIELD_AFFARENS_SALJARE;
  resetEnvCache();
  resetDealFieldsCache();
});

const dealFields = [
  { key: "unrelated_field", name: "Faktura status", options: [{ id: 1, label: "Betald" }] },
  {
    key: SELLER_KEY,
    name: "Affärens säljare",
    options: [
      { id: 72, label: "Filippa" },
      { id: 73, label: "Robin" },
      { id: 74, label: "Adam Westin" },
      { id: 75, label: "Daniel Krans" }
    ]
  }
];

describe("getSellers", () => {
  it("returns the options of the seller field, keyed by option id", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue(dealFields);

    await expect(getSellers()).resolves.toEqual([
      { id: 72, name: "Filippa" },
      { id: 73, name: "Robin" },
      { id: 74, name: "Adam Westin" },
      { id: 75, name: "Daniel Krans" }
    ]);
  });

  /**
   * The sellers are not user accounts, so reading them from `/users` returned
   * unrelated service accounts and never the four names the form has to offer.
   */
  it("reads the deal fields rather than the user list", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue(dealFields);

    await getSellers();

    expect(pipedriveRequest).toHaveBeenCalledWith("/dealFields");
  });

  it("returns nothing when the account has not mapped the field", async () => {
    delete process.env.PIPEDRIVE_FIELD_AFFARENS_SALJARE;
    resetEnvCache();

    await expect(getSellers()).resolves.toEqual([]);
    expect(pipedriveRequest).not.toHaveBeenCalled();
  });

  /** A field deleted in Pipedrive must degrade to an empty list, not crash. */
  it("returns nothing when the field no longer exists", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([{ key: "unrelated_field", options: [] }]);

    await expect(getSellers()).resolves.toEqual([]);
  });

  it("reads the field list once for repeated lookups", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue(dealFields);

    await getSellers();
    await getSellers();

    expect(pipedriveRequest).toHaveBeenCalledTimes(1);
  });
});
