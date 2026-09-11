import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProspectStepInput } from "@/lib/crm/schemas";
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
const { ConfigurationError } = await import("@/lib/config/pipedrive");
const { buildLeadPayload, buildProspectNote, readUnderlagStatus, resetDealFieldsCache, setLeadUnderlag } =
  await import("@/lib/pipedrive/service");

/** Stand-ins for the account's 40-character keys; the code never hardcodes them. */
const KEYS = {
  fakturaStart: "faktura_start_key",
  fakturagrupp: "fakturagrupp_key",
  viktigast: "viktigast_key",
  seller: "seller_key",
  underlag: "underlag_key",
  original: "original_seller_key"
};

/**
 * Two enum fields listing the same four names under *different* option ids,
 * exactly as Pipedrive does — which is why the original seller has to be
 * mapped through its label rather than copied.
 */
const dealFields = [
  {
    key: KEYS.seller,
    name: "Affärens säljare",
    options: [
      { id: 72, label: "Filippa" },
      { id: 74, label: "Adam Westin" }
    ]
  },
  {
    key: KEYS.original,
    name: "Ursprunglig säljare",
    options: [
      { id: 172, label: "Filippa" },
      { id: 174, label: "Adam Westin" }
    ]
  },
  {
    key: KEYS.underlag,
    name: "Underlag",
    options: [
      { id: 201, label: "Digital signering krävs" },
      { id: 202, label: "Ljudfil uppladdad" },
      { id: 203, label: "Väntar på signering" },
      { id: 204, label: "Avtal signerat" }
    ]
  },
  {
    // Also a single option field: Pipedrive rejects the label and wants the id.
    // The irregular inner spacing is the account's own, and is kept here on
    // purpose — it is exactly what a seller could never retype reliably.
    key: KEYS.fakturagrupp,
    name: "Fakturagrupp",
    options: [
      { id: 19, label: "A - (Kvartal - Jan,Apr,Jul,Okt)" },
      { id: 38, label: "E - ( Månadsvis)" },
      { id: 59, label: "F - (Årligt)" }
    ]
  }
];

beforeEach(() => {
  vi.mocked(pipedriveRequest).mockReset().mockResolvedValue(dealFields);
  resetDealFieldsCache();
  process.env.PIPEDRIVE_FIELD_FAKTURA_START = KEYS.fakturaStart;
  process.env.PIPEDRIVE_FIELD_FAKTURAGRUPP = KEYS.fakturagrupp;
  process.env.PIPEDRIVE_FIELD_VIKTIGAST_FOR_KUNDEN = KEYS.viktigast;
  process.env.PIPEDRIVE_FIELD_AFFARENS_SALJARE = KEYS.seller;
  process.env.PIPEDRIVE_FIELD_UNDERLAG = KEYS.underlag;
  process.env.PIPEDRIVE_FIELD_URSPRUNGLIG_SALJARE = KEYS.original;
  delete process.env.PIPEDRIVE_LEAD_OWNER_USER_ID;
  resetEnvCache();
});

afterEach(() => {
  for (const name of [
    "PIPEDRIVE_FIELD_FAKTURA_START",
    "PIPEDRIVE_FIELD_FAKTURAGRUPP",
    "PIPEDRIVE_FIELD_VIKTIGAST_FOR_KUNDEN",
    "PIPEDRIVE_FIELD_AFFARENS_SALJARE",
    "PIPEDRIVE_FIELD_UNDERLAG",
    "PIPEDRIVE_FIELD_URSPRUNGLIG_SALJARE",
    "PIPEDRIVE_LEAD_OWNER_USER_ID"
  ]) {
    delete process.env[name];
  }
  resetEnvCache();
  resetDealFieldsCache();
});

function prospect(overrides: Partial<ProspectStepInput> = {}): ProspectStepInput {
  return {
    person: { id: 11, name: "Anna Andersson", email: "anna@example.se", phone: "0701234567", organizationId: 7 },
    organization: {
      id: 7,
      name: "Andersson AB",
      organizationNumber: "556677-8899",
      website: "https://andersson.se",
      address: "Storgatan 1"
    },
    value: 12000,
    currency: "SEK",
    evidenceMethod: "signature",
    viktigastForKunden: "Synlighet på Google",
    fakturaAvtalStart: "2026-10-01",
    fakturagrupp: "E - ( Månadsvis)",
    contractLengthMonths: 12,
    monthlyCost: 995,
    startFee: 0,
    totalDealValue: 11940,
    bindingPeriodMonths: 12,
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

/** The logged-in seller, as the route reads it from the session. */
const seller = { optionId: 74, name: "Adam Westin" };

describe("buildLeadPayload", () => {
  it("titles the prospect after the organization, with nothing typed by the seller", async () => {
    const payload = await buildLeadPayload(prospect(), parties, seller);

    expect(payload.title).toBe("Andersson AB Prospekt");
  });

  it("links the lead to the resolved person and organization", async () => {
    const payload = await buildLeadPayload(prospect(), parties, seller);

    expect(payload).toMatchObject({ person_id: 11, organization_id: 7 });
  });

  it("carries the value in Pipedrive's lead shape", async () => {
    const payload = await buildLeadPayload(prospect(), parties, seller);

    expect(payload.value).toEqual({ amount: 12000, currency: "SEK" });
  });

  it("omits a zero value rather than sending an empty amount", async () => {
    const payload = await buildLeadPayload(prospect({ value: 0 }), parties, seller);

    expect(payload.value).toBeUndefined();
  });

  /**
   * The seller is not a Pipedrive user, so the lead can never be owned by
   * them. The owner is the configured back-office inbox, or Pipedrive's
   * default (the token's user) when none is configured.
   */
  it("owns the lead by the configured back-office user", async () => {
    process.env.PIPEDRIVE_LEAD_OWNER_USER_ID = "5";
    resetEnvCache();

    const payload = await buildLeadPayload(prospect(), parties, seller);

    expect(payload.owner_id).toBe(5);
  });

  it("leaves the owner to Pipedrive when none is configured", async () => {
    const payload = await buildLeadPayload(prospect(), parties, seller);

    expect(payload.owner_id).toBeUndefined();
    expect(payload).not.toHaveProperty("user_id");
  });

  it("writes the invoicing fields under the account's keys", async () => {
    const payload = await buildLeadPayload(prospect(), parties, seller);

    expect(payload[KEYS.viktigast]).toBe("Synlighet på Google");
    expect(payload[KEYS.fakturaStart]).toBe("2026-10-01");
    // The option id, not the label: Pipedrive rejects a string here.
    expect(payload[KEYS.fakturagrupp]).toBe(38);
  });

  it("matches the invoice group ignoring case and surrounding space", async () => {
    const payload = await buildLeadPayload(prospect({ fakturagrupp: "  e - ( månadsvis)  " }), parties, seller);

    expect(payload[KEYS.fakturagrupp]).toBe(38);
  });

  /**
   * Inner spacing is *not* normalised, and should not be: "E - (Månadsvis)" and
   * "E - ( Månadsvis)" could be two different options in an account that has
   * both. Refusing is what sends an administrator to look, rather than filing
   * the prospect under a group nobody chose. This is why the field is a
   * dropdown — a seller typing the label by hand would land here.
   */
  it("refuses an invoice group whose inner spacing differs", async () => {
    const error = await buildLeadPayload(prospect({ fakturagrupp: "E - (Månadsvis)" }), parties, seller).catch(
      (caught) => caught
    );

    expect(error).toBeInstanceOf(ConfigurationError);
    expect(error.message).toContain("Fakturagrupp");
  });

  it("names the invoice group an administrator has to add when it is gone", async () => {
    const error = await buildLeadPayload(prospect({ fakturagrupp: "Z - (Avskaffad)" }), parties, seller).catch(
      (caught) => caught
    );

    expect(error).toBeInstanceOf(ConfigurationError);
    expect(error.message).toContain("Fakturagrupp");
    expect(error.message).toContain("Z - (Avskaffad)");
  });

  it("assigns the prospect to the session's seller option", async () => {
    const payload = await buildLeadPayload(prospect(), parties, seller);

    expect(payload[KEYS.seller]).toBe(74);
  });

  it("records the original seller under that field's own option id", async () => {
    const payload = await buildLeadPayload(prospect(), parties, seller);

    // 174, not 74: same name, different field, different id.
    expect(payload[KEYS.original]).toBe(174);
  });

  it("starts a signature sale as 'Digital signering krävs'", async () => {
    const payload = await buildLeadPayload(prospect({ evidenceMethod: "signature" }), parties, seller);

    expect(payload[KEYS.underlag]).toBe(201);
  });

  /**
   * "Ljudfil uppladdad" may only be written once Pipedrive has the file. A
   * prospect created before the upload therefore carries no status at all.
   */
  it("starts an audio sale with no underlag status", async () => {
    const payload = await buildLeadPayload(prospect({ evidenceMethod: "audio" }), parties, seller);

    expect(payload).not.toHaveProperty(KEYS.underlag);
  });

  it("never writes 'Väntar på signering' or 'Avtal signerat'", async () => {
    const payload = await buildLeadPayload(prospect(), parties, seller);

    expect(Object.values(payload)).not.toContain(203);
    expect(Object.values(payload)).not.toContain(204);
  });

  it("names the option an administrator has to add when the account lacks it", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([
      dealFields[0],
      dealFields[1],
      { key: KEYS.underlag, name: "Underlag", options: [{ id: 202, label: "Ljudfil uppladdad" }] },
      dealFields[3]
    ]);
    resetDealFieldsCache();

    const error = await buildLeadPayload(prospect(), parties, seller).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(ConfigurationError);
    expect(error.message).toContain("Digital signering krävs");
  });

  it("refuses to build the payload when a field key is unmapped", async () => {
    delete process.env.PIPEDRIVE_FIELD_UNDERLAG;
    resetEnvCache();

    const error = await buildLeadPayload(prospect(), parties, seller).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(ConfigurationError);
    expect(error.message).toContain("underlag");
  });

  it("reads the field definitions once per payload", async () => {
    await buildLeadPayload(prospect(), parties, seller);

    expect(vi.mocked(pipedriveRequest).mock.calls.filter(([path]) => path === "/dealFields")).toHaveLength(1);
  });
});

describe("setLeadUnderlag", () => {
  it("patches only the underlag field, with the option id for the uploaded audio", async () => {
    await setLeadUnderlag("lead-uuid", "audioUploaded");

    expect(pipedriveRequest).toHaveBeenCalledWith("/leads/lead-uuid", {
      method: "PATCH",
      body: { [KEYS.underlag]: 202 }
    });
  });

  it("fails as a configuration problem when the field is unmapped", async () => {
    delete process.env.PIPEDRIVE_FIELD_UNDERLAG;
    resetEnvCache();

    await expect(setLeadUnderlag("lead-uuid", "audioUploaded")).rejects.toBeInstanceOf(ConfigurationError);
  });
});

describe("readUnderlagStatus", () => {
  it.each([
    [201, "signatureRequired"],
    [202, "audioUploaded"],
    ["203", "awaitingSignature"],
    [204, "signed"]
  ])("maps option %s to %s", async (optionId, status) => {
    await expect(readUnderlagStatus({ [KEYS.underlag]: optionId })).resolves.toBe(status);
  });

  it("is undefined for an unset field or an option this code does not know", async () => {
    await expect(readUnderlagStatus({})).resolves.toBeUndefined();
    await expect(readUnderlagStatus({ [KEYS.underlag]: 999 })).resolves.toBeUndefined();
  });
});

describe("buildProspectNote", () => {
  it("records the seller, the evidence route and the terms that have no field", () => {
    const note = buildProspectNote(prospect(), seller);

    expect(note).toContain("Säljare: Adam Westin");
    expect(note).toContain("Underlag: Digital signering");
    expect(note).toContain("Faktura/avtal start: 2026-10-01");
    expect(note).toContain("Avtalslängd: 12 månader");
    expect(note).toContain("Bindningstid: 12 månader");
    expect(note).toContain("Startavgift: 0 SEK");
    expect(note).toContain("Viktigast för kunden: Synlighet på Google");
    expect(note).toMatch(/Månadskostnad: 995 SEK/);
  });

  it("leaves out terms the seller did not enter", () => {
    const note = buildProspectNote(
      prospect({ contractLengthMonths: undefined, monthlyCost: undefined, totalDealValue: undefined }),
      seller
    );

    expect(note).not.toContain("Avtalslängd");
    expect(note).not.toContain("Månadskostnad");
    expect(note).not.toContain("Totalt affärsvärde");
  });
});
