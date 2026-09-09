import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DealStepInput, MeetingStepInput } from "@/lib/crm/schemas";

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
const { buildOrganizationPayload, resolveDealParties, resolveMeetingParties, searchOrganizations } = await import(
  "@/lib/pipedrive/service"
);
const { resetEnvCache } = await import("@/lib/config/env");

/**
 * Stand-ins for the account's real 40-character hashes. The keys are read from
 * the environment precisely so they are never hardcoded in the app; the tests
 * follow the same rule.
 */
const ORG_NUMBER_KEY = "orgnr_field_key";
const WEBSITE_KEY = "website_field_key";

beforeEach(() => {
  vi.mocked(pipedriveRequest).mockReset();
  process.env.PIPEDRIVE_FIELD_ORG_NUMBER = ORG_NUMBER_KEY;
  process.env.PIPEDRIVE_FIELD_ORG_WEBSITE = WEBSITE_KEY;
  resetEnvCache();
});

afterEach(() => {
  delete process.env.PIPEDRIVE_FIELD_ORG_NUMBER;
  delete process.env.PIPEDRIVE_FIELD_ORG_WEBSITE;
  resetEnvCache();
});

function meetingParties(overrides: Partial<MeetingStepInput> = {}): MeetingStepInput {
  return {
    person: { name: "Anna Andersson", email: "anna@example.se", phone: "0701234567" },
    meetingType: "IT-genomgång",
    agenda: "Genomgång",
    technicianNotes: "Ta med demokonto",
    date: "2026-09-01",
    time: "13:30",
    durationMinutes: 60,
    locationOrLink: "Teams",
    ...overrides
  } as MeetingStepInput;
}

function dealParties(overrides: Partial<DealStepInput> = {}): DealStepInput {
  return {
    person: { name: "Anna Andersson", email: "anna@example.se", phone: "0701234567" },
    organization: {
      name: "Andersson AB",
      organizationNumber: "556677-8899",
      website: "https://andersson.se",
      address: "Storgatan 1",
      city: "Stockholm"
    },
    deal: { title: "Andersson AB - Digital Kontakt", value: 12000, currency: "SEK", pipelineId: "1" },
    sellerId: "7",
    viktigastForKunden: "Synlighet",
    fakturaStart: "2026-09-01",
    fakturagrupp: "Standard",
    ...overrides
  } as DealStepInput;
}

/** S03, S04 — the identity number must reach Pipedrive, not just the PDF. */
describe("buildOrganizationPayload", () => {
  it("writes the identity number to the account's custom field", () => {
    const payload = buildOrganizationPayload({ name: "Andersson AB", organizationNumber: "556677-8899" });

    expect(payload[ORG_NUMBER_KEY]).toBe("556677-8899");
  });

  it("writes a personnummer to the same field as an organisationsnummer (S04)", () => {
    const payload = buildOrganizationPayload({ name: "Anna Andersson", organizationNumber: "850101-1234" });

    expect(payload[ORG_NUMBER_KEY]).toBe("850101-1234");
  });

  it("writes the website to the custom field, not Pipedrive's native one", () => {
    // The account stores every website in its custom field and none in the
    // native `website`, so writing there would hide the value.
    const payload = buildOrganizationPayload({ name: "Andersson AB", website: "https://andersson.se" });

    expect(payload[WEBSITE_KEY]).toBe("https://andersson.se");
    expect(payload.website).toBeUndefined();
  });

  it("folds the city into the address, which is the only editable location field", () => {
    const payload = buildOrganizationPayload({ name: "Andersson AB", address: "Storgatan 1", city: "Stockholm" });

    expect(payload.address).toBe("Storgatan 1, Stockholm");
  });

  it.each([
    ["address only", { address: "Storgatan 1" }, "Storgatan 1"],
    ["city only", { city: "Stockholm" }, "Stockholm"],
    ["neither", {}, undefined]
  ])("joins %s without stray separators", (_label, parts, expected) => {
    expect(buildOrganizationPayload({ name: "Andersson AB", ...parts }).address).toBe(expected);
  });

  it("omits fields the seller left blank rather than sending empty strings", () => {
    const payload = buildOrganizationPayload({ name: "Andersson AB", organizationNumber: "", website: "   " });

    expect(payload).not.toHaveProperty(ORG_NUMBER_KEY);
    expect(payload).not.toHaveProperty(WEBSITE_KEY);
  });

  /**
   * These keys are account-specific. A deployment that has not mapped them must
   * still be able to book meetings and create deals, so an unmapped field is
   * skipped rather than fatal — unlike the deal fields, which block creation.
   */
  it("skips custom fields when the account has not mapped them", () => {
    delete process.env.PIPEDRIVE_FIELD_ORG_NUMBER;
    delete process.env.PIPEDRIVE_FIELD_ORG_WEBSITE;
    resetEnvCache();

    const payload = buildOrganizationPayload({
      name: "Andersson AB",
      organizationNumber: "556677-8899",
      website: "https://andersson.se",
      address: "Storgatan 1"
    });

    expect(payload).toEqual({ name: "Andersson AB", address: "Storgatan 1" });
  });
});

/** The identity must be stored no matter which workflow created the record. */
describe("organization identity across creation paths", () => {
  it("stores the identity when the deal step creates the organization (S05)", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValueOnce({ id: 7 }).mockResolvedValueOnce({ id: 11 });

    await resolveDealParties(dealParties());

    const [path, options] = vi.mocked(pipedriveRequest).mock.calls[0];
    expect(path).toBe("/organizations");
    expect(options?.body).toMatchObject({
      name: "Andersson AB",
      address: "Storgatan 1, Stockholm",
      [ORG_NUMBER_KEY]: "556677-8899",
      [WEBSITE_KEY]: "https://andersson.se"
    });
  });

  it("stores the identity when the meeting step creates the organization (S03)", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValueOnce({ id: 7 }).mockResolvedValueOnce({ id: 11 });

    await resolveMeetingParties(
      meetingParties({
        organization: {
          name: "Andersson AB",
          address: "Storgatan 1",
          city: "Stockholm",
          organizationNumber: "556677-8899"
        }
      })
    );

    expect(vi.mocked(pipedriveRequest).mock.calls[0][1]?.body).toMatchObject({
      [ORG_NUMBER_KEY]: "556677-8899",
      address: "Storgatan 1, Stockholm"
    });
  });

  it("stores a personnummer for a private individual booking a meeting (S04)", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValueOnce({ id: 7 }).mockResolvedValueOnce({ id: 11 });

    await resolveMeetingParties(
      meetingParties({
        organization: { name: "Anna Andersson", customerType: "individual", organizationNumber: "850101-1234" }
      })
    );

    expect(vi.mocked(pipedriveRequest).mock.calls[0][1]?.body).toMatchObject({
      name: "Anna Andersson",
      [ORG_NUMBER_KEY]: "850101-1234"
    });
  });

  it("does not touch an organization the seller selected", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValueOnce({ id: 11 });

    await resolveDealParties(dealParties({ organization: { ...dealParties().organization, id: 7 } }));

    // Existing CRM records are read-only: only the person is created.
    expect(vi.mocked(pipedriveRequest).mock.calls.map(([path]) => path)).toEqual(["/persons"]);
  });
});

/** The identity number is the strongest deduplication key the scenarios have. */
describe("searchOrganizations", () => {
  it("searches custom fields so an organisationsnummer is findable", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue({ items: [] });

    await searchOrganizations("556677-8899");

    // `name,address` alone returns nothing for an org number, because it lives
    // in a custom field in this account.
    expect(vi.mocked(pipedriveRequest).mock.calls[0][1]?.query).toMatchObject({
      fields: "name,address,custom_fields"
    });
  });

  it("returns the identity number so the seller can tell similar names apart", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue({
      items: [
        {
          item: {
            id: 7,
            name: "Andersson AB",
            address: "Storgatan 1",
            [ORG_NUMBER_KEY]: "556677-8899"
          }
        }
      ]
    });

    const [hit] = await searchOrganizations("Andersson");

    expect(hit).toMatchObject({ id: 7, organizationNumber: "556677-8899" });
    expect(hit.detail).toContain("556677-8899");
  });

  it("still returns hits when the account has not mapped the identity field", async () => {
    delete process.env.PIPEDRIVE_FIELD_ORG_NUMBER;
    resetEnvCache();

    vi.mocked(pipedriveRequest).mockResolvedValue({
      items: [{ item: { id: 7, name: "Andersson AB", address: "Storgatan 1" } }]
    });

    const [hit] = await searchOrganizations("Andersson");

    expect(hit).toMatchObject({ id: 7, name: "Andersson AB" });
    expect(hit.organizationNumber).toBeUndefined();
  });
});
