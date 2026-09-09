import { randomBytes, scryptSync } from "node:crypto";

/**
 * Mirror of `src/lib/auth/password.ts`, for the CLI. Plain JavaScript because
 * the script runs outside the Next.js build; `password.test.ts` verifies a
 * hash from here with the TypeScript implementation so the two cannot drift.
 */
export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);

  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}
