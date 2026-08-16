/**
 * Organisationsnummer / personnummer.
 *
 * One field carries both, because private individuals and sole traders
 * (enskilda firmor) are registered as organizations in Pipedrive with their
 * personnummer in place of an organisationsnummer. Every search, validation and
 * document path therefore has to accept both shapes.
 *
 * Storage format is the 10-digit form `NNNNNN-NNNN`. A 12-digit personnummer
 * (`YYYYMMDD-NNNN`) is accepted on input and normalized down to `YYMMDD-NNNN`
 * so the same customer cannot be stored under two different spellings — which
 * would defeat the duplicate check that the whole flow depends on.
 */

/** Accepted input: 10 or 12 digits, with or without the separating hyphen. */
const IDENTITY_NUMBER_PATTERN = /^(?:\d{6}|\d{8})-?\d{4}$/;

export const IDENTITY_NUMBER_MESSAGE =
  "Ange organisationsnummer eller personnummer (NNNNNN-NNNN eller ÅÅÅÅMMDD-NNNN)";

/**
 * Reduces an identity number to its canonical stored form, `NNNNNN-NNNN`.
 *
 * A 12-digit value loses its century prefix: `19850101-1234` → `850101-1234`.
 * Returns `undefined` for anything that is not a recognisable identity number,
 * so callers can treat parse failure and validation failure as one case.
 */
export function normalizeIdentityNumber(value: string): string | undefined {
  const trimmed = value.trim().replace(/\s/g, "");

  // Checked before the hyphen is stripped: `1234567-89012` is twelve digits but
  // splits in the wrong place, and must not pass as a personnummer.
  if (!IDENTITY_NUMBER_PATTERN.test(trimmed)) {
    return undefined;
  }

  const compact = trimmed.replace(/-/g, "");

  // Drop the century digits from a 12-digit personnummer.
  const tenDigits = compact.length === 12 ? compact.slice(2) : compact;

  return `${tenDigits.slice(0, 6)}-${tenDigits.slice(6)}`;
}

export function isValidIdentityNumber(value: string): boolean {
  return IDENTITY_NUMBER_PATTERN.test(value.trim().replace(/\s/g, ""));
}
