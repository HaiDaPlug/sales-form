import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DealStepInput } from "@/lib/crm/schemas";
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
const { buildDealPayload, getSellers } = await import("@/lib/pipedrive/service");

/**
 * "Affärens säljare" holds the sellers as enum options because they have no
 * Pipedrive user account of their own. Keys are account-specific, so the tests
 * set them from the environment rather than hardcoding the live ones.
 */
const SELLER_KEY = "seller_field_key";
const FAKTURA_START_KEY = "faktura_start_key";
const FAKTURAGRUPP_KEY = "fakturagrupp_key";
const VIKTIGAST_KEY = "viktigast_key";

beforeEach(() => {
  vi.mocked(pipedriveRequest).mockReset();
  process.env.PIPEDRIVE_FIELD_AFFARENS_SALJARE = SELLER_KEY;
  process.env.PIPEDRIVE_FIELD_FAKTURA_START = FAKTURA_START_KEY;
  process.env.PIPEDRIVE_FIELD_FAKTURAGRUPP = FAKTURAGRUPP_KEY;
  process.env.PIPEDRIVE_FIELD_VIKTIGAST_FOR_KUNDEN = VIKTIGAST_KEY;
  resetEnvCache();
});

afterEach(() => {
  delete process.env.PIPEDRIVE_FIELD_AFFARENS_SALJARE;
  delete process.env.PIPEDRIVE_FIELD_FAKTURA_START;
  delete process.env.PIPEDRIVE_FIELD_FAKTURAGRUPP;
  delete process.env.PIPEDRIVE_FIELD_VIKTIGAST_FOR_KUNDEN;
  resetEnvCache();
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
      { id: 75, label: "Tobias Ek" }
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
      { id: 75, name: "Tobias Ek" }
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

  /** A field deleted in Pipedrive must degrade to a text input, not crash. */
  it("returns nothing when the field no longer exists", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([{ key: "unrelated_field", options: [] }]);

    await expect(getSellers()).resolves.toEqual([]);
  });
});

function dealInput(overrides: Partial<DealStepInput> = {}): DealStepInput {
  return {
    person: { id: 11, name: "Anna Andersson", email: "anna@example.se", phone: "0701234567" },
    organization: {
      id: 7,
      name: "Andersson AB",
      organizationNumber: "556677-8899",
      website: "https://example.se",
      address: "Storgatan 1"
    },
    deal: { title: "Digital Kontakt", value: 12000, currency: "SEK", pipelineId: 1, stageId: 5 },
    sellerId: 74,
    viktigastForKunden: "Synlighet",
    fakturaStart: "2026-09-01",
    fakturagrupp: "Standard",
    ...overrides
  };
}

const parties = {
  personId: 11,
  organizationId: 7,
  createdPerson: false,
  createdOrganization: false,
  personLinkedToOrganization: true
};

describe("buildDealPayload seller", () => {
  it("writes the chosen seller to the custom field", async () => {
    const payload = await buildDealPayload(dealInput(), parties);

    expect(payload[SELLER_KEY]).toBe(74);
  });

  /**
   * The option id is not a user id. Sending it as `user_id` made Pipedrive
   * reject the deal as belonging to an unknown user.
   */
  it("does not assign the deal to the option id as a user", async () => {
    const payload = await buildDealPayload(dealInput(), parties);

    expect(payload.user_id).toBeUndefined();
  });
});
