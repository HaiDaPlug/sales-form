import { getPortalUsers } from "@/lib/auth/users";
import { getEnv } from "@/lib/config/env";

/**
 * Why a login is being refused, without revealing anything secret.
 *
 * Configuration reaches a deployment through an environment the code cannot
 * see from here, and a value that arrives subtly altered — expanded, quoted,
 * truncated — fails in a way that looks identical to a wrong password. This
 * reports the *shape* of what the server actually received: lengths, counts,
 * and whether the pieces look well formed. Never a hash, a salt or a password.
 *
 * Public on purpose: it is the one page that has to work when logging in does
 * not. It is safe to leave in place, but there is no reason to keep it once a
 * deployment is known good — delete the route.
 */
export async function GET() {
  const raw = process.env.APP_USERS;

  const report: Record<string, unknown> = {
    APP_USERS: {
      present: Boolean(raw),
      length: raw?.length ?? 0,
      startsWith: raw?.slice(0, 2) ?? null,
      endsWith: raw?.slice(-2) ?? null,
      // A leading quote or a stray key prefix is the usual paste mistake.
      looksQuoted: raw ? /^["']/.test(raw) : false,
      hasKeyPrefix: raw ? raw.startsWith("APP_USERS=") : false,
      // Each `$` an env loader expands leaves a hole where a hash used to be.
      dollarSigns: (raw?.match(/\$/g) ?? []).length
    }
  };

  try {
    const users = getPortalUsers();

    report.accounts = users.map((user) => ({
      username: user.username,
      sellerOptionId: user.sellerOptionId,
      // A correct hash is "scrypt", a 32-char salt and a 128-char digest.
      hashLength: user.passwordHash.length,
      hashParts: user.passwordHash.split(".").length,
      hashPrefix: user.passwordHash.split(".")[0],
      hashLooksComplete: /^scrypt\.[0-9a-f]{32}\.[0-9a-f]{128}$/.test(user.passwordHash)
    }));
  } catch (error) {
    report.accounts = `FAILED TO READ: ${error instanceof Error ? error.message : String(error)}`;
  }

  let sessionSecretLength = 0;
  try {
    sessionSecretLength = getEnv().APP_SESSION_SECRET?.length ?? 0;
  } catch {
    sessionSecretLength = -1;
  }

  report.APP_SESSION_SECRET = { length: sessionSecretLength, longEnough: sessionSecretLength >= 16 };
  report.runtime = { node: process.version, vercel: Boolean(process.env.VERCEL) };

  return Response.json(report, { headers: { "cache-control": "no-store" } });
}
