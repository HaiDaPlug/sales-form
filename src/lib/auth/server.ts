import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken, type SessionPayload } from "@/lib/auth/session";
import type { SellerIdentity } from "@/lib/crm/types";

/**
 * Reads the session inside a route handler or server component.
 *
 * The proxy has already rejected unauthenticated traffic, so a null here means
 * something bypassed it — routes treat that as 401 rather than assuming a user.
 */
export async function getCurrentSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE_NAME)?.value);
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getCurrentSession();

  if (!session) {
    throw new UnauthorizedError("Inloggning krävs.");
  }

  return session;
}

/**
 * The seller a request acts as. Derived from the session and nothing else, so
 * a request body cannot name a colleague.
 */
export function sellerFromSession(session: SessionPayload): SellerIdentity {
  return { optionId: session.sellerOptionId, name: session.subject };
}

export class UnauthorizedError extends Error {
  readonly status = 401;

  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}
