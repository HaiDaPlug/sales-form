import { describe, expect, it } from "vitest";
import { isValidIdentityNumber, normalizeIdentityNumber } from "@/lib/crm/identityNumber";

/**
 * Scenarios S04, S05, S16, S17 — one field carries both an organisationsnummer
 * and a personnummer, and the stored form is always 10 digits.
 */
describe("normalizeIdentityNumber", () => {
  it("keeps a 10-digit organisationsnummer in canonical form", () => {
    expect(normalizeIdentityNumber("556677-8899")).toBe("556677-8899");
  });

  it("adds the hyphen when it is missing", () => {
    expect(normalizeIdentityNumber("5566778899")).toBe("556677-8899");
  });

  it("normalizes a 12-digit personnummer down to YYMMDD-NNNN", () => {
    expect(normalizeIdentityNumber("19850101-1234")).toBe("850101-1234");
  });

  it("normalizes a 12-digit personnummer written without a hyphen", () => {
    expect(normalizeIdentityNumber("198501011234")).toBe("850101-1234");
  });

  it("normalizes a 2000s personnummer", () => {
    expect(normalizeIdentityNumber("20050612-4455")).toBe("050612-4455");
  });

  it("accepts a 10-digit personnummer unchanged", () => {
    expect(normalizeIdentityNumber("850101-1234")).toBe("850101-1234");
  });

  it("tolerates surrounding whitespace and inner spaces", () => {
    expect(normalizeIdentityNumber("  19850101 1234 ")).toBe("850101-1234");
  });

  it("maps the same person written both ways to one stored value", () => {
    // The duplicate check depends on this: two spellings must not become two
    // customers.
    expect(normalizeIdentityNumber("19850101-1234")).toBe(normalizeIdentityNumber("850101-1234"));
  });

  it.each(["", "banana", "12345", "123456-789", "1234567-89012", "85O1O1-1234"])(
    "rejects %j",
    (value) => {
      expect(normalizeIdentityNumber(value)).toBeUndefined();
    }
  );
});

describe("isValidIdentityNumber", () => {
  it.each(["556677-8899", "5566778899", "19850101-1234", "198501011234"])("accepts %j", (value) => {
    expect(isValidIdentityNumber(value)).toBe(true);
  });

  it.each(["", "banana", "12345", "1234567-8901"])("rejects %j", (value) => {
    expect(isValidIdentityNumber(value)).toBe(false);
  });
});
