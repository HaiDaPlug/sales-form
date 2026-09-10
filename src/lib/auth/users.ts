import { z } from "zod";
import { getEnv } from "@/lib/config/env";

/**
 * The seller accounts.
 *
 * Sellers are not Pipedrive users: the four names the business uses are options
 * on the custom deal field "Affärens säljare", and that option id is what every
 * prospect, deal and status query is scoped by. An account therefore binds a
 * login to one option id, and the session carries that id so no request body
 * ever has to name the seller.
 *
 * Held in `APP_USERS` as JSON rather than in a table: there are four sellers,
 * an administrator edits them by redeploying, and there is no account
 * management UI to keep consistent with a database.
 *
 *     [{"username":"filippa","name":"Filippa","sellerOptionId":72,"passwordHash":"scrypt$…"}]
 */
const portalUserSchema = z.object({
  username: z.string().trim().min(1),
  /** Display name, printed on contracts and in the history. */
  name: z.string().trim().min(1),
  /** The option id on "Affärens säljare", as Pipedrive stores it. */
  sellerOptionId: z.union([z.number().int(), z.string().trim().min(1)]),
  passwordHash: z.string().trim().min(1)
});

export type PortalUser = z.infer<typeof portalUserSchema>;

const portalUsersSchema = z.array(portalUserSchema);

let cached: { raw: string; users: PortalUser[] } | undefined;

/** Throws when `APP_USERS` is set but unreadable: that is a deployment fault, not "no users". */
export function getPortalUsers(): PortalUser[] {
  const raw = getEnv().APP_USERS;
  if (!raw) return [];

  if (cached?.raw === raw) return cached.users;

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("APP_USERS är inte giltig JSON.");
  }

  const result = portalUsersSchema.safeParse(parsed);

  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`APP_USERS har fel form: ${details}`);
  }

  const usernames = result.data.map((user) => normalizeUsername(user.username));

  if (new Set(usernames).size !== usernames.length) {
    throw new Error("APP_USERS innehåller samma användarnamn mer än en gång.");
  }

  cached = { raw, users: result.data };
  return result.data;
}

export function findPortalUser(username: string): PortalUser | undefined {
  const wanted = normalizeUsername(username);

  return getPortalUsers().find((user) => normalizeUsername(user.username) === wanted);
}

/** Case and surrounding whitespace never make two logins different people. */
function normalizeUsername(username: string): string {
  return username.trim().toLocaleLowerCase("sv");
}

/** Test seam. */
export function resetPortalUsersCache() {
  cached = undefined;
}
