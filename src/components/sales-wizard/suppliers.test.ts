import { describe, expect, it } from "vitest";
import { KNOWN_SUPPLIERS } from "@/components/sales-wizard/suppliers";

/**
 * The list is keyed by name in both the search results and the dropdown, so a
 * repeated name would render twice and produce two identical uppsägningar for
 * the same supplier.
 */
describe("known suppliers", () => {
  it("lists every supplier once", () => {
    const names = KNOWN_SUPPLIERS.map((supplier) => supplier.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every supplier a notice address to prefill", () => {
    expect(KNOWN_SUPPLIERS.filter((supplier) => !supplier.noticeAddress.trim())).toEqual([]);
  });
});
