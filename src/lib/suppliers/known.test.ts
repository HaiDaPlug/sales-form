import { describe, expect, it } from "vitest";
import { isValidIdentityNumber } from "@/lib/crm/identityNumber";
import { KNOWN_SUPPLIERS } from "@/lib/suppliers/known";

/**
 * The list is seeded into the supplier table by name-derived id, and the picker
 * shows one row per entry, so a repeated name would seed one row and hide the
 * other — or produce two identical uppsägningar for the same supplier.
 */
describe("known suppliers", () => {
  it("lists every supplier once", () => {
    const names = KNOWN_SUPPLIERS.map((supplier) => supplier.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every supplier a notice address to post the cancellation to", () => {
    expect(KNOWN_SUPPLIERS.filter((supplier) => !supplier.noticeAddress.trim())).toEqual([]);
  });

  /**
   * Most numbers are still owed by the client. Blank is the honest placeholder:
   * a guessed identity number on a cancellation letter is worse than none, and
   * the renderer omits the line when it is empty.
   */
  it("either knows a supplier's identity number or leaves it blank", () => {
    const malformed = KNOWN_SUPPLIERS.filter(
      (supplier) => supplier.organizationNumber !== "" && !isValidIdentityNumber(supplier.organizationNumber)
    );

    expect(malformed).toEqual([]);
  });

  it("does not repeat an identity number it does know", () => {
    const numbers = KNOWN_SUPPLIERS.map((supplier) => supplier.organizationNumber).filter(Boolean);

    expect(new Set(numbers).size).toBe(numbers.length);
  });
});
