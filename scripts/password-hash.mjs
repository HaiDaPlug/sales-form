import { randomBytes, scryptSync } from "node:crypto";

/**
 * Mirror of `src/lib/auth/password.ts`, for the CLI. Plain JavaScript because
 * the script runs outside the Next.js build; `password.test.ts` verifies a
 * hash from here with the TypeScript implementation so the two cannot drift.
 *
 * The dot separator matters: these hashes are pasted into `APP_USERS` in an
 * env file, and `$` there is read as a variable reference and expanded away.
 */
export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);

  return ["scrypt", salt.toString("hex"), hash.toString("hex")].join(".");
}
