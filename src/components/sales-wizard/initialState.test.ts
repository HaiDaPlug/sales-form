import { describe, expect, it } from "vitest";
import {
  initialContract,
  initialDeal,
  initialMediacleaning,
  initialMeeting
} from "@/components/sales-wizard/initialState";
import {
  contractStepSchema,
  dealStepSchema,
  mediacleaningStepSchema,
  meetingStepSchema
} from "@/lib/crm/schemas";

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
   * The other steps all require seller input, so an untouched form is expected
   * to fail. What matters is that it fails on *missing values* — every reported
   * issue names a field. A wrong type or unknown key in the initial state would
   * surface here as an issue with an empty path or a type error instead.
   */
  it.each([
    ["deal", dealStepSchema, initialDeal],
    ["mediacleaning", mediacleaningStepSchema, initialMediacleaning],
    ["contract", contractStepSchema, initialContract]
  ])("starts %s from a shape its schema recognizes", (_label, schema, initial) => {
    const result = schema.safeParse(initial);

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues.every((issue) => issue.path.length > 0)).toBe(true);
  });
});
