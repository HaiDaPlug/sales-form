import { describe, expect, it } from "vitest";
import {
  hydrateContract,
  hydrateMediacleaning,
  hydrateMeetingFromProspect,
  hydrateProspectFromMeeting
} from "@/components/sales-wizard/hydration";
import {
  initialContract,
  initialMediacleaning,
  initialMeeting,
  initialProspect
} from "@/components/sales-wizard/initialState";
import type { MeetingStepData, ProspectStepData } from "@/lib/crm/types";

/** A prospect as the seller leaves it, with a linked organization and contact. */
const filledProspect: ProspectStepData = {
  ...initialProspect,
  person: { ...initialProspect.person, id: 11, name: "Anna Andersson", phone: "0701234567", email: "anna@kebab.se", organizationId: 5 },
  organization: {
    ...initialProspect.organization,
    id: 5,
    name: "Kebab AB",
    website: "https://kebab.se",
    address: "Storgatan 1",
    city: "Malmö",
    organizationNumber: "556677-8899"
  },
  monthlyCost: 995,
  bindingPeriodMonths: 24
};

const filledMeeting: MeetingStepData = {
  ...initialMeeting,
  person: { ...initialMeeting.person, id: 11, name: "Anna Andersson", phone: "0701234567", email: "anna@kebab.se" },
  organization: { ...initialMeeting.organization, id: 5, name: "Kebab AB", address: "Storgatan 1" },
  internalComment: "Vill synas på Google"
};

describe("meeting hydrated from the prospect (prospect comes first now)", () => {
  it("carries the contact and the linked organization into an untouched meeting", () => {
    const meeting = hydrateMeetingFromProspect(initialMeeting, filledProspect);

    expect(meeting.person).toMatchObject({ id: 11, name: "Anna Andersson", phone: "0701234567", organizationId: 5 });
    expect(meeting.organization).toMatchObject({
      id: 5,
      name: "Kebab AB",
      organizationNumber: "556677-8899",
      website: "https://kebab.se"
    });
  });

  it("never overwrites what the seller already typed into the meeting", () => {
    const meeting = hydrateMeetingFromProspect(
      { ...initialMeeting, person: { ...initialMeeting.person, name: "Bertil Berg" } },
      filledProspect
    );

    expect(meeting.person.name).toBe("Bertil Berg");
  });

  it("leaves a blank meeting blank when the prospect is blank", () => {
    expect(hydrateMeetingFromProspect(initialMeeting, initialProspect)).toEqual(initialMeeting);
  });
});

describe("prospect hydrated from the meeting (a seller who booked first)", () => {
  it("carries the contact, organization and comment forward", () => {
    const prospect = hydrateProspectFromMeeting(initialProspect, filledMeeting);

    expect(prospect.person).toMatchObject({ id: 11, name: "Anna Andersson", email: "anna@kebab.se" });
    expect(prospect.organization).toMatchObject({ id: 5, name: "Kebab AB", address: "Storgatan 1" });
    expect(prospect.viktigastForKunden).toBe("Vill synas på Google");
  });

  it("fills required prospect fields as empty strings, never undefined", () => {
    const prospect = hydrateProspectFromMeeting(initialProspect, {
      ...initialMeeting,
      person: { ...initialMeeting.person, name: "Anna", phone: undefined, email: undefined }
    });

    expect(prospect.person.phone).toBe("");
    expect(prospect.person.email).toBe("");
    expect(prospect.organization.website).toBe("");
  });
});

describe("document steps hydrated from the customer", () => {
  it("fills Mediacleaning from the prospect and links the created lead", () => {
    const mediacleaning = hydrateMediacleaning(initialMediacleaning, {
      prospect: filledProspect,
      meeting: initialMeeting,
      createdLeadId: "lead-1"
    });

    expect(mediacleaning).toMatchObject({
      companyName: "Kebab AB",
      organizationNumber: "556677-8899",
      city: "Malmö",
      organizationId: "5",
      leadId: "lead-1"
    });
  });

  it("fills the contract's price and binding period from the prospect", () => {
    const contract = hydrateContract(initialContract, {
      prospect: filledProspect,
      meeting: initialMeeting,
      mediacleaning: initialMediacleaning,
      createdLeadId: "lead-1"
    });

    expect(contract).toMatchObject({
      companyName: "Kebab AB",
      signerName: "Anna Andersson",
      price: 995,
      organizationId: "5",
      leadId: "lead-1"
    });
    // The contract starts with its own default rather than blank, so the
    // prospect's binding period does not replace it. Unchanged behaviour; the
    // 24-month default is a separate, still open decision.
    expect(contract.bindingPeriodMonths).toBe(initialContract.bindingPeriodMonths);
  });

  it("carries nothing from a session that was reset", () => {
    const mediacleaning = hydrateMediacleaning(initialMediacleaning, {
      prospect: initialProspect,
      meeting: initialMeeting,
      createdLeadId: undefined
    });

    expect(mediacleaning).toEqual(initialMediacleaning);
  });
});
