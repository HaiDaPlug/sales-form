import type { SearchHit } from "@/lib/pipedrive/types";
import { normalizeIdentityNumber } from "@/lib/crm/identityNumber";

/**
 * Matching typed customer details against Pipedrive records.
 *
 * The rules the earlier plan set for search-before-create hold here: an exact
 * email, phone or identity number is a strong match and is offered first; a
 * similar name is shown but never treated as the same customer. Nothing here
 * links a record — the seller picks, every time.
 */

/** Pipedrive rejects shorter terms, and one or two letters match everything. */
export const MIN_SUGGESTION_TERM_LENGTH = 3;

export type MatchDescription = {
  reason: string;
  /** An identity-level match (email, phone, org number) rather than a resemblance. */
  strong: boolean;
};

/** The distinct values worth searching for, blanks and short fragments dropped. */
export function searchTerms(...values: Array<string | undefined>): string[] {
  const terms = values
    .map((value) => value?.trim() ?? "")
    .filter((value) => value.length >= MIN_SUGGESTION_TERM_LENGTH);

  return [...new Set(terms)];
}

export function describePersonMatch(
  entered: { name?: string; email?: string; phone?: string },
  hit: SearchHit
): MatchDescription | undefined {
  if (entered.email && hit.email && sameEmail(entered.email, hit.email)) {
    return { reason: "E-postadressen matchar", strong: true };
  }

  if (entered.phone && hit.phone && samePhone(entered.phone, hit.phone)) {
    return { reason: "Telefonnumret matchar", strong: true };
  }

  if (entered.name && similarName(entered.name, hit.name)) {
    return { reason: "Namnet liknar", strong: false };
  }

  return undefined;
}

export function describeOrganizationMatch(
  entered: { name?: string; organizationNumber?: string },
  hit: SearchHit
): MatchDescription | undefined {
  if (entered.organizationNumber && hit.organizationNumber) {
    const left = normalizeIdentityNumber(entered.organizationNumber);
    const right = normalizeIdentityNumber(hit.organizationNumber);

    if (left && right && left === right) return { reason: "Organisationsnumret matchar", strong: true };
  }

  if (entered.name && similarName(entered.name, hit.name)) {
    return { reason: "Namnet liknar", strong: false };
  }

  return undefined;
}

function sameEmail(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/** `+46 70-123 45 67`, `070-1234567` and `0701234567` are the same number. */
export function samePhone(left: string, right: string): boolean {
  return normalizePhone(left) === normalizePhone(right);
}

export function normalizePhone(value: string): string {
  const digits = value.replace(/[^\d+]/g, "");
  return digits.replace(/^\+46/, "0").replace(/^0046/, "0");
}

/**
 * Two names resemble each other when one contains the other, or they share a
 * word of three letters or more — "Anna Andersson" and "Andersson, Anna", or
 * "Kebab AB" and "Kebab i Malmö AB". Short words like "AB" carry no identity.
 */
export function similarName(left: string, right: string): boolean {
  const a = normalizeName(left);
  const b = normalizeName(right);

  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;

  const words = new Set(a.split(" ").filter((word) => word.length >= 3));
  return b.split(" ").some((word) => word.length >= 3 && words.has(word));
}

function normalizeName(value: string): string {
  return value
    .toLocaleLowerCase("sv")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
