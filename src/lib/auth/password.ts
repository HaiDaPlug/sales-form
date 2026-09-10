import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing for the seller accounts.
 *
 * scrypt from node:crypto — no extra dependency, and the login route runs on
 * the Node runtime where it is available. Stored form:
 *
 *     scrypt.<salt hex>.<hash hex>
 *
 * The separator is a dot, not the conventional `$`, and that is load-bearing:
 * these hashes live inside `APP_USERS` in the environment, and env loaders
 * (Next.js's included) expand `$name` as a variable reference. A `$`-separated
 * hash silently arrived as the bare string "scrypt" with the salt and digest
 * expanded away, so every login failed with a correct password. A dot has no
 * meaning to any loader.
 *
 * The salt and cost are fixed here; a future change to either means a new
 * prefix, so old hashes stay verifiable. `scripts/hash-password.mjs` produces
 * hashes for `APP_USERS` and must implement exactly this format — the test in
 * `password.test.ts` holds the two together.
 */
const PREFIX = "scrypt";
const SEPARATOR = ".";
const SALT_BYTES = 16;
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(password, salt, KEY_LENGTH);

  return [PREFIX, salt.toString("hex"), hash.toString("hex")].join(SEPARATOR);
}

/** False for a malformed stored value as well as for a wrong password. */
export function verifyPassword(password: string, stored: string): boolean {
  const [prefix, saltHex, hashHex] = stored.split(SEPARATOR);

  if (prefix !== PREFIX || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== KEY_LENGTH) return false;

  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), KEY_LENGTH);

  return timingSafeEqual(actual, expected);
}
