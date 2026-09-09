import { describe, expect, it } from "vitest";
import {
  contractDocumentRequestSchema,
  contractStepSchema,
  dealStepSchema,
  mediacleaningStepSchema,
  meetingStepSchema
} from "@/lib/crm/schemas";

/** A meeting that passes validation; individual tests override one field. */
function meeting(overrides: Record<string, unknown> = {}) {
  return {
    person: { name: "Anna Andersson", email: "anna@example.se", phone: "0701234567" },
    meetingType: "IT-genomgång",
    agenda: "Genomgång av digital närvaro",
    technicianNotes: "Ta med demokonto",
    date: "2026-09-01",
    time: "13:30",
    durationMinutes: 60,
    locationOrLink: "Teams",
    ...overrides
  };
}

function deal(overrides: Record<string, unknown> = {}) {
  return {
    person: { name: "Anna Andersson", email: "anna@example.se", phone: "0701234567" },
    organization: {
      name: "Andersson AB",
      organizationNumber: "556677-8899",
      website: "https://andersson.se",
      address: "Storgatan 1"
    },
    deal: { title: "Andersson AB - Digital Kontakt", value: 12000, pipelineId: "1" },
    sellerId: "7",
    viktigastForKunden: "Synlighet på Google",
    fakturaStart: "2026-09-01",
    fakturagrupp: "Standard",
    ...overrides
  };
}

/** Every supplier needs a notice address — that is where the letter is sent. */
function supplier(overrides: Record<string, unknown> = {}) {
  return { name: "Eniro", noticeAddress: "Box 100, 111 11 Stockholm", ...overrides };
}

function mediacleaning(overrides: Record<string, unknown> = {}) {
  return {
    companyName: "Andersson AB",
    organizationNumber: "556677-8899",
    address: "Storgatan 1",
    city: "Stockholm",
    documentTypes: ["cancellation"],
    suppliers: [supplier()],
    ...overrides
  };
}

function contract(overrides: Record<string, unknown> = {}) {
  return {
    companyName: "Andersson AB",
    organizationNumber: "556677-8899",
    signerName: "Anna Andersson",
    address: "Storgatan 1",
    sellerName: "Roble",
    price: 1200,
    paymentInterval: "monthly",
    bindingPeriodMonths: 12,
    includedServices: ["Digital Kontakt"],
    ...overrides
  };
}

/**
 * The organization exactly as the wizard initializes it: present, but entirely
 * blank. Tests that omit the key instead test a shape the UI never produces.
 */
const BLANK_WIZARD_ORGANIZATION = {
  name: "",
  customerType: "company",
  website: "",
  address: "",
  city: "",
  organizationNumber: ""
};

/** S01 — a meeting can be booked with contact details only. */
describe("meetingStepSchema (S01, S04)", () => {
  it("accepts a meeting with no organization at all", () => {
    const result = meetingStepSchema.safeParse(meeting());

    expect(result.success).toBe(true);
  });

  it.each([
    ["blank, as the wizard sends them", { agenda: "", technicianNotes: "", locationOrLink: "" }],
    ["omitted entirely", { agenda: undefined, technicianNotes: undefined, locationOrLink: undefined }]
  ])("books a meeting with agenda, technician notes and location %s", (_label, fields) => {
    // None of the three reach anything that needs them: the first two are only
    // folded into the activity note, the third into an optional activity field.
    const result = meetingStepSchema.safeParse(meeting(fields));

    expect(result.success).toBe(true);
  });

  it("books a meeting with no meeting type", () => {
    // It only names the activity, and the payload falls back to a plain "Möte".
    const result = meetingStepSchema.safeParse(meeting({ meetingType: "" }));

    expect(result.success).toBe(true);
  });

  it("accepts the blank organization the wizard always sends (S01)", () => {
    const result = meetingStepSchema.safeParse(meeting({ organization: BLANK_WIZARD_ORGANIZATION }));

    expect(result.success).toBe(true);
  });

  it("drops a blank organization rather than passing empty strings on (S01)", () => {
    const result = meetingStepSchema.safeParse(meeting({ organization: BLANK_WIZARD_ORGANIZATION }));

    // The service layer treats a blank name as "no organization"; the parsed
    // value must say the same thing instead of relying on that second check.
    expect(result.success && result.data.organization).toBeUndefined();
  });

  it("still validates an organization the seller partly filled in", () => {
    // A typo'd entry must not be silently discarded as "blank" — only a wholly
    // empty object counts as no organization.
    const result = meetingStepSchema.safeParse(
      meeting({ organization: { ...BLANK_WIZARD_ORGANIZATION, organizationNumber: "inte-ett-nummer" } })
    );

    expect(result.success).toBe(false);
  });

  /**
   * Organization details entered without a name would otherwise validate and
   * then be dropped: `resolveMeetingParties` only creates an organization for a
   * non-blank name, so the seller's input would vanish silently.
   */
  it.each([
    ["an address", { address: "Storgatan 1" }],
    ["an organisationsnummer", { organizationNumber: "556677-8899" }],
    ["a website", { website: "https://andersson.se" }],
    ["a personnummer for a private individual", { customerType: "individual", organizationNumber: "19850101-1234" }]
  ])("rejects %s entered without an organization name", (_label, fields) => {
    const result = meetingStepSchema.safeParse(
      meeting({ organization: { ...BLANK_WIZARD_ORGANIZATION, ...fields } })
    );

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues.map((issue) => issue.path.join("."))).toContain(
      "organization.name"
    );
  });

  it("accepts organization details once a name is given", () => {
    const result = meetingStepSchema.safeParse(
      meeting({
        organization: { ...BLANK_WIZARD_ORGANIZATION, name: "Andersson AB", organizationNumber: "556677-8899" }
      })
    );

    expect(result.success).toBe(true);
    expect(result.success && result.data.organization?.organizationNumber).toBe("556677-8899");
  });

  it("accepts a selected organization without requiring the form to carry its name", () => {
    // An organization picked from lookup already exists in Pipedrive with a
    // name, so the form does not have to repeat it.
    const result = meetingStepSchema.safeParse(
      meeting({ organization: { ...BLANK_WIZARD_ORGANIZATION, id: 7 } })
    );

    expect(result.success).toBe(true);
    expect(result.success && result.data.organization?.id).toBe(7);

    // The one case whose output may lack a name. It must be absent rather than
    // blank, so the meeting route's `organization?.name ?? person.name` falls
    // back to the contact instead of logging an empty customer name.
    expect(result.success && result.data.organization?.name).toBeUndefined();
    expect(result.success && (result.data.organization?.name ?? result.data.person.name)).toBe("Anna Andersson");
  });

  it("accepts a personnummer in the organization identity field", () => {
    const result = meetingStepSchema.safeParse(
      meeting({
        organization: { name: "Anna Andersson", customerType: "individual", organizationNumber: "19850101-1234" }
      })
    );

    expect(result.success).toBe(true);
    expect(result.success && result.data.organization?.organizationNumber).toBe("850101-1234");
  });

  it("rejects a meeting date that is not a real date", () => {
    const result = meetingStepSchema.safeParse(meeting({ date: "banana" }));

    expect(result.success).toBe(false);
  });
});

/** S05, S11 — deal validation, including private individuals. */
describe("dealStepSchema (S05, S11)", () => {
  it("accepts an organisationsnummer", () => {
    const result = dealStepSchema.safeParse(deal());

    expect(result.success).toBe(true);
  });

  it("accepts and normalizes a 12-digit personnummer", () => {
    const result = dealStepSchema.safeParse(
      deal({
        organization: {
          name: "Anna Andersson",
          customerType: "individual",
          organizationNumber: "19850101-1234",
          website: "https://example.se",
          address: "Storgatan 1"
        }
      })
    );

    expect(result.success).toBe(true);
    expect(result.success && result.data.organization.organizationNumber).toBe("850101-1234");
  });

  it("requires an identity number", () => {
    const result = dealStepSchema.safeParse(
      deal({
        organization: {
          name: "Andersson AB",
          organizationNumber: "",
          website: "https://andersson.se",
          address: "Storgatan 1"
        }
      })
    );

    // Fails specifically on the identity field, not on some other missing one.
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues.map((issue) => issue.path.join("."))).toContain(
      "organization.organizationNumber"
    );
  });

  it("requires a contact email", () => {
    const result = dealStepSchema.safeParse(deal({ person: { name: "Anna Andersson" } }));

    expect(result.success).toBe(false);
  });

  it("reports every missing required field at once, not just the first", () => {
    const result = dealStepSchema.safeParse({
      person: { name: "" },
      organization: { name: "", organizationNumber: "" },
      deal: { title: "", value: 0 }
    });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues.length).toBeGreaterThan(1);
  });

  it("leaves stage optional so the pipeline's first stage can be used (S12)", () => {
    const result = dealStepSchema.safeParse(deal({ deal: { title: "T", value: 1, pipelineId: "1" } }));

    expect(result.success).toBe(true);
    expect(result.success && result.data.deal.stageId).toBeUndefined();
  });
});

/** S20, S19 — mediacleaning cannot be completed with incomplete information. */
describe("mediacleaningStepSchema (S19, S20)", () => {
  it("accepts a complete mediacleaning", () => {
    expect(mediacleaningStepSchema.safeParse(mediacleaning()).success).toBe(true);
  });

  it("rejects a cancellation with no supplier", () => {
    const result = mediacleaningStepSchema.safeParse(mediacleaning({ suppliers: [] }));

    expect(result.success).toBe(false);
  });

  it("rejects generation with no document type selected", () => {
    const result = mediacleaningStepSchema.safeParse(mediacleaning({ documentTypes: [] }));

    expect(result.success).toBe(false);
  });

  it.each([["companyName"], ["address"], ["city"]])("rejects a missing %s", (field) => {
    const result = mediacleaningStepSchema.safeParse(mediacleaning({ [field]: "" }));

    expect(result.success).toBe(false);
  });

  it("requires an address for a manually entered supplier", () => {
    const result = mediacleaningStepSchema.safeParse(
      mediacleaning({ suppliers: [{ name: "Lokaltidningen", isOther: true }] })
    );

    expect(result.success).toBe(false);
  });

  it("requires a name for a manually entered supplier", () => {
    const result = mediacleaningStepSchema.safeParse(
      mediacleaning({ suppliers: [{ name: "", isOther: true, noticeAddress: "Box 1" }] })
    );

    expect(result.success).toBe(false);
  });

  it("accepts a manually entered supplier with name and address", () => {
    const result = mediacleaningStepSchema.safeParse(
      mediacleaning({
        suppliers: [supplier({ name: "Lokaltidningen", isOther: true, noticeAddress: "Box 1, 111 11 Stockholm" })]
      })
    );

    expect(result.success).toBe(true);
  });

  it("does not require an email for a manually entered supplier", () => {
    const result = mediacleaningStepSchema.safeParse(
      mediacleaning({
        suppliers: [supplier({ name: "Lokaltidningen", isOther: true, email: "" })]
      })
    );

    expect(result.success).toBe(true);
  });

  it("requires a notice address for every supplier, not only manual ones", () => {
    const result = mediacleaningStepSchema.safeParse(
      mediacleaning({ suppliers: [{ name: "Eniro" }] })
    );

    expect(result.success).toBe(false);
  });

  it("accepts a personnummer for a private individual", () => {
    const result = mediacleaningStepSchema.safeParse(mediacleaning({ organizationNumber: "19850101-1234" }));

    expect(result.success).toBe(true);
    expect(result.success && result.data.organizationNumber).toBe("850101-1234");
  });

  it("does not require any deal or organization link", () => {
    // S16/S17: mediacleaning must work without a deal.
    expect(mediacleaningStepSchema.safeParse(mediacleaning()).success).toBe(true);
  });
});

/** S25 — contract fields are validated before a document is produced. */
describe("contractStepSchema (S25)", () => {
  it("accepts a complete contract", () => {
    expect(contractStepSchema.safeParse(contract()).success).toBe(true);
  });

  it.each([["price"], ["bindingPeriodMonths"]])("rejects a missing %s", (field) => {
    const result = contractStepSchema.safeParse(contract({ [field]: 0 }));

    expect(result.success).toBe(false);
  });

  it("rejects an unknown payment interval", () => {
    const result = contractStepSchema.safeParse(contract({ paymentInterval: "weekly" }));

    expect(result.success).toBe(false);
  });

  it("requires at least one included service", () => {
    const result = contractStepSchema.safeParse(contract({ includedServices: [] }));

    expect(result.success).toBe(false);
  });

  it("defaults the optional Mediacleaning combination to off", () => {
    const result = contractStepSchema.parse(contract());

    expect(result.includeMediacleaningDocuments).toBe(false);
  });
});

describe("contractDocumentRequestSchema (5.4)", () => {
  it("allows a standalone contract", () => {
    expect(
      contractDocumentRequestSchema.safeParse({ contract: contract() }).success
    ).toBe(true);
  });

  it("requires valid Mediacleaning data after explicit selection", () => {
    const result = contractDocumentRequestSchema.safeParse({
      contract: contract({ includeMediacleaningDocuments: true })
    });

    expect(result.success).toBe(false);
  });

  it("accepts an explicitly combined package", () => {
    const result = contractDocumentRequestSchema.safeParse({
      contract: contract({ includeMediacleaningDocuments: true }),
      mediacleaning: mediacleaning()
    });

    expect(result.success).toBe(true);
  });

  it("rejects combining documents for different customers", () => {
    const result = contractDocumentRequestSchema.safeParse({
      contract: contract({ includeMediacleaningDocuments: true }),
      mediacleaning: mediacleaning({ organizationNumber: "559999-0000" })
    });

    expect(result.success).toBe(false);
  });
});
