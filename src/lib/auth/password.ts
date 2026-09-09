import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing for the seller accounts.
 *
 * scrypt from node:crypto — no extra dependency, and the login route runs on
 * the Node runtime where it is available. Stored form:
 *
 *     scrypt$<salt hex>$<hash hex>
 *
 * The salt and cost are fixed here; a future change to either means a new
 * prefix, so old hashes stay verifiable. `scripts/hash-password.mjs` produces
 * hashes for `APP_USERS` and must implement exactly this format — the test in
 * `password.test.ts` holds the two together.
 */
const PREFIX = "scrypt";
const SALT_BYTES = 16;
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(password, salt, KEY_LENGTH);

  return `${PREFIX}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** False for a malformed stored value as well as for a wrong password. */
export function verifyPassword(password: string, stored: string): boolean {
  const [prefix, saltHex, hashHex] = stored.split("$");

  if (prefix !== PREFIX || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== KEY_LENGTH) return false;

  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), KEY_LENGTH);

  return timingSafeEqual(actual, expected);
}
