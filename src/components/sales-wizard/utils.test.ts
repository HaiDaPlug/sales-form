import { describe, expect, it } from "vitest";
import { findPersonConflicts } from "@/components/sales-wizard/utils";
import type { SearchHit } from "@/lib/pipedrive/types";

function hit(overrides: Partial<SearchHit> = {}): SearchHit {
  return { id: 1, name: "Anna Andersson", ...overrides };
}

/**
 * S06 — a contact found by email whose phone number differs must be flagged,
 * not silently overwritten in either direction.
 */
describe("findPersonConflicts (S06)", () => {
  it("reports a differing phone number", () => {
    const conflicts = findPersonConflicts(
      { name: "Anna", phone: "0709999999" },
      hit({ phone: "0701234567" })
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      field: "phone",
      enteredValue: "0709999999",
      existingValue: "0701234567"
    });
  });

  it("reports no conflict when the phone numbers match", () => {
    expect(findPersonConflicts({ name: "Anna", phone: "0701234567" }, hit({ phone: "0701234567" }))).toEqual([]);
  });

  it.each([
    ["+46701234567", "0701234567"],
    ["070-123 45 67", "0701234567"],
    ["0046701234567", "070 123 45 67"]
  ])("treats %j and %j as the same number", (entered, existing) => {
    expect(findPersonConflicts({ name: "Anna", phone: entered }, hit({ phone: existing }))).toEqual([]);
  });

  it("reports no conflict when the seller entered no phone", () => {
    // A blank field is unknown, not a disagreement.
    expect(findPersonConflicts({ name: "Anna" }, hit({ phone: "0701234567" }))).toEqual([]);
  });

  it("reports no conflict when the Pipedrive record has no phone", () => {
    expect(findPersonConflicts({ name: "Anna", phone: "0701234567" }, hit())).toEqual([]);
  });

  it("reports a differing email", () => {
    const conflicts = findPersonConflicts(
      { name: "Anna", email: "ny@example.se" },
      hit({ email: "gammal@example.se" })
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].field).toBe("email");
  });

  it("ignores email casing differences", () => {
    expect(
      findPersonConflicts({ name: "Anna", email: "Anna@Example.se" }, hit({ email: "anna@example.se" }))
    ).toEqual([]);
  });

  it("reports both fields when both differ", () => {
    const conflicts = findPersonConflicts(
      { name: "Anna", phone: "0709999999", email: "ny@example.se" },
      hit({ phone: "0701234567", email: "gammal@example.se" })
    );

    expect(conflicts.map((conflict) => conflict.field)).toEqual(["phone", "email"]);
  });
});
