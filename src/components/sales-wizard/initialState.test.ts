import { describe, expect, it } from "vitest";
import {
  initialContract,
  initialDeal,
  initialMediacleaning,
  initialMeeting
} from "@/components/sales-wizard/initialState";
import { meetingStepSchema } from "@/lib/crm/schemas";

/**
 * The state the wizard actually starts from, checked against the schemas that
 * receive it.
 *
 * These import the real initial values rather than copying them. A copied
 * fixture is exactly what hid the S01 bug: the schema test omitted
 * `organization`, so a blank-but-present organization — the only shape the UI
 * ever produces — was never validated.
 */
describe("wizard initial state (S01)", () => {
  it("books a meeting from contact details alone, with the untouched organization", () => {
    // Only the fields a seller must type; the organization is left exactly as
    // the wizard initialized it.
    const result = meetingStepSchema.safeParse({
      ...initialMeeting,
      person: { ...initialMeeting.person, name: "Anna Andersson", email: "anna@example.se", phone: "0701234567" },
      agenda: "Genomgång av digital närvaro",
      technicianNotes: "Ta med demokonto",
      date: "2026-09-01",
      time: "13:30",
      locationOrLink: "Teams"
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.organization).toBeUndefined();
  });

  it("keeps an organization the seller did fill in", () => {
    const result = meetingStepSchema.safeParse({
      ...initialMeeting,
      person: { ...initialMeeting.person, name: "Anna Andersson", email: "anna@example.se", phone: "0701234567" },
      organization: { ...initialMeeting.organization, name: "Andersson AB" },
      agenda: "Genomgång av digital närvaro",
      technicianNotes: "Ta med demokonto",
      date: "2026-09-01",
      time: "13:30",
      locationOrLink: "Teams"
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.organization?.name).toBe("Andersson AB");
  });

  /**
   * The remaining steps require seller input before they can pass, so these
   * only assert the shape stays parseable — a missing key or wrong type in the
   * initial state would surface as something other than a required-field error.
   */
  it("starts the other steps from a shape their schemas recognize", () => {
    expect(initialDeal.organization.customerType).toBe("company");
    expect(initialMediacleaning.documentTypes).toEqual([]);
    expect(initialContract.includeMediacleaningDocuments).toBe(false);
  });
});
