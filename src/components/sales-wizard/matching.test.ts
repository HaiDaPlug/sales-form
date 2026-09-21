import { describe, expect, it } from "vitest";
import {
  describeOrganizationMatch,
  describePersonMatch,
  searchTerms,
  similarName
} from "@/components/sales-wizard/matching";

describe("searchTerms", () => {
  it("drops blanks and fragments too short to search", () => {
    expect(searchTerms("Anna Andersson", "", "  ", "ab", undefined)).toEqual(["Anna Andersson"]);
  });

  it("returns each distinct value once", () => {
    expect(searchTerms("anna@kebab.se", "anna@kebab.se ")).toEqual(["anna@kebab.se"]);
  });
});

describe("describePersonMatch", () => {
  const hit = { id: 1, name: "Anna Andersson", email: "anna@kebab.se", phone: "+46 70-123 45 67" };

  it("treats a matching email as a strong match, whatever the case", () => {
    expect(describePersonMatch({ name: "", email: "Anna@Kebab.se" }, hit)).toEqual({
      reason: "E-postadressen matchar",
      strong: true
    });
  });

  it("treats the same phone number written differently as a strong match", () => {
    expect(describePersonMatch({ phone: "0701234567" }, hit)?.strong).toBe(true);
  });

  it("treats a similar name as a weak match, to show and never to choose", () => {
    expect(describePersonMatch({ name: "Andersson, Anna", email: "other@example.se" }, hit)).toEqual({
      reason: "Namnet liknar",
      strong: false
    });
  });

  it("leaves out a record that resembles nothing typed", () => {
    expect(describePersonMatch({ name: "Bertil Berg", email: "b@berg.se", phone: "0709999999" }, hit)).toBeUndefined();
  });
});

describe("describeOrganizationMatch", () => {
  const hit = { id: 5, name: "Kebab AB", organizationNumber: "556677-8899" };

  it("matches the identity number in any accepted spelling", () => {
    expect(describeOrganizationMatch({ name: "Annat namn", organizationNumber: "5566778899" }, hit)).toEqual({
      reason: "Organisationsnumret matchar",
      strong: true
    });
  });

  it("does not let 'AB' alone make two companies similar", () => {
    expect(describeOrganizationMatch({ name: "Falafel AB" }, hit)).toBeUndefined();
  });

  it("shows a company whose name contains the typed one", () => {
    expect(describeOrganizationMatch({ name: "kebab" }, hit)?.strong).toBe(false);
  });
});

describe("similarName", () => {
  it("ignores punctuation and case", () => {
    expect(similarName("ANDERSSON, Anna", "Anna Andersson")).toBe(true);
  });

  it("requires a shared word of three letters or more", () => {
    expect(similarName("Bo AB", "Bo & Co AB")).toBe(false);
    expect(similarName("Malmö Kebab AB", "Kebab i Lund HB")).toBe(true);
  });
});
