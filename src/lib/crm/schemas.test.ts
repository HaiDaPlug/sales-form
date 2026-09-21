import { describe, expect, it } from "vitest";
import {
  contractDocumentRequestSchema,
  contractStepSchema,
  mediacleaningStepSchema,
  meetingStepSchema,
  prospectStepSchema
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

function prospect(overrides: Record<string, unknown> = {}) {
  return {
    person: { name: "Anna Andersson", email: "anna@example.se", phone: "0701234567" },
    organization: {
      name: "Andersson AB",
      organizationNumber: "556677-8899",
      website: "https://andersson.se",
      address: "Storgatan 1"
    },
    value: 12000,
    evidenceMethod: "signature",
    viktigastForKunden: "Synlighet på Google",
    fakturaAvtalStart: "2026-09-01",
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
    signerName: "Anna Andersson",
    documentTypes: ["cancellation"],
    suppliers: [supplier()],
    organizationId: 7,
    ...overrides
  };
}

function contract(overrides: Record<string, unknown> = {}) {
  return {
    companyName: "Andersson AB",
    organizationNumber: "556677-8899",
    signerName: "Anna Andersson",
    address: "Storgatan 1",
    price: 1200,
    paymentInterval: "monthly",
    bindingPeriodMonths: 12,
    includedServices: ["Digital Kontakt"],
    organizationId: 7,
    ...overrides
  };
}

/**
 * The organization exactly as the wizard initializes it: present, but entirely
 * blank. Tests that omit the key instead test a shape the UI never produces.
 */
const BLANK_WIZARD_ORGANIZATION = {
  name: "",
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
    ["a personnummer for a private individual", { organizationNumber: "19850101-1234" }]
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
        organization: { name: "Anna Andersson", organizationNumber: "19850101-1234" }
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

/** S05, S11 — prospect validation, including private individuals. */
describe("prospectStepSchema (S05, S11)", () => {
  it("accepts an organisationsnummer", () => {
    const result = prospectStepSchema.safeParse(prospect());

    expect(result.success).toBe(true);
  });

  it("accepts and normalizes a 12-digit personnummer in the same field", () => {
    // No separate mode for private individuals: the one identity field takes
    // both shapes, as the client asked.
    const result = prospectStepSchema.safeParse(
      prospect({
        organization: {
          name: "Anna Andersson",
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
    const result = prospectStepSchema.safeParse(
      prospect({
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
    const result = prospectStepSchema.safeParse(prospect({ person: { name: "Anna Andersson" } }));

    expect(result.success).toBe(false);
  });

  it("requires the seller to choose the evidence for QC", () => {
    const result = prospectStepSchema.safeParse(prospect({ evidenceMethod: undefined }));

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0].message).toContain("underlag");
  });

  it("accepts audio as the evidence", () => {
    expect(prospectStepSchema.safeParse(prospect({ evidenceMethod: "audio" })).success).toBe(true);
  });

  /**
   * The title is derived from the organization name on the server, and the
   * seller is the session. Neither may arrive from the form — if they did they
   * would be silently ignored, which this test pins down.
   */
  it("ignores a title, seller, pipeline or stage sent by a client", () => {
    const result = prospectStepSchema.safeParse(
      prospect({ title: "Egen titel", sellerId: 75, pipelineId: "1", stageId: "2" })
    );

    expect(result.success).toBe(true);
    expect(result.success && result.data).not.toHaveProperty("title");
    expect(result.success && result.data).not.toHaveProperty("sellerId");
    expect(result.success && result.data).not.toHaveProperty("pipelineId");
  });

  it("uses one date for invoicing and the agreement", () => {
    const result = prospectStepSchema.safeParse(prospect({ fakturaAvtalStart: "inte-ett-datum" }));

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0].message).toContain("Faktura/avtal start");
  });

  it("reports every missing required field at once, not just the first", () => {
    const result = prospectStepSchema.safeParse({
      person: { name: "" },
      organization: { name: "", organizationNumber: "" }
    });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues.length).toBeGreaterThan(1);
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

  it("requires a name for every supplier", () => {
    const result = mediacleaningStepSchema.safeParse(
      mediacleaning({ suppliers: [{ name: "", noticeAddress: "Box 1" }] })
    );

    expect(result.success).toBe(false);
  });

  it("requires a notice address for every supplier — that is where the letter goes", () => {
    const result = mediacleaningStepSchema.safeParse(mediacleaning({ suppliers: [{ name: "Eniro" }] }));

    expect(result.success).toBe(false);
  });

  it("accepts a supplier whose identity number the client has not supplied yet", () => {
    const result = mediacleaningStepSchema.safeParse(
      mediacleaning({ suppliers: [supplier({ organizationNumber: "" })] })
    );

    expect(result.success).toBe(true);
  });

  it("keeps the supplier's own identity number for the letter", () => {
    const result = mediacleaningStepSchema.safeParse(
      mediacleaning({ suppliers: [supplier({ organizationNumber: "556059-9282" })] })
    );

    expect(result.success && result.data.suppliers[0].organizationNumber).toBe("556059-9282");
  });

  it("accepts a personnummer for a private individual", () => {
    const result = mediacleaningStepSchema.safeParse(mediacleaning({ organizationNumber: "19850101-1234" }));

    expect(result.success).toBe(true);
    expect(result.success && result.data.organizationNumber).toBe("850101-1234");
  });

  it("requires a firmatecknare, so no cancellation is signed by nobody", () => {
    const result = mediacleaningStepSchema.safeParse(mediacleaning({ signerName: "" }));

    expect(result.success).toBe(false);
  });

  /**
   * The document is filed under the customer's organization in Pipedrive, so
   * one has to exist. A customer with no record yet is registered here; a
   * document with neither has nowhere to go.
   */
  it("requires a customer record, or permission to create one", () => {
    expect(mediacleaningStepSchema.safeParse(mediacleaning({ organizationId: undefined })).success).toBe(false);

    expect(
      mediacleaningStepSchema.safeParse(mediacleaning({ organizationId: undefined, createOrganization: true })).success
    ).toBe(true);
  });

  it("does not require a prospect or a deal", () => {
    // A customer can be cleaned up without a sale in progress.
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

  it("defaults the contract type to the first template, so older requests still print", () => {
    expect(contractStepSchema.parse(contract()).templateId).toBe("template-1");
  });

  it("accepts a known contract type and rejects an unknown one", () => {
    expect(contractStepSchema.safeParse(contract({ templateId: "template-2" })).success).toBe(true);
    expect(contractStepSchema.safeParse(contract({ templateId: "template-9" })).success).toBe(false);
  });

  /**
   * The contract is uploaded to the customer's organization, which is where it
   * is sent for signature from, so a contract with no customer record has
   * nowhere to go.
   */
  it("requires the customer's organization", () => {
    expect(contractStepSchema.safeParse(contract({ organizationId: undefined })).success).toBe(false);
  });

  it("requires a firmatecknare", () => {
    expect(contractStepSchema.safeParse(contract({ signerName: "" })).success).toBe(false);
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
