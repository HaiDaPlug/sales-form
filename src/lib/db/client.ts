import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { getEnv } from "@/lib/config/env";

/**
 * Neon Postgres over HTTP.
 *
 * The portal is deployed to Vercel, whose functions have a read-only
 * filesystem, so anything that has to survive a request — run history, the
 * supplier registry — lives here. The HTTP driver needs no connection pool and
 * works in every runtime Next.js offers.
 *
 * `DATABASE_URL` unset means the file-backed stores are used instead. That is a
 * local-development convenience, not a deployment option.
 */
export type SqlClient = NeonQueryFunction<false, false>;

let cached: { url: string; sql: SqlClient } | undefined;

export function isDatabaseConfigured(): boolean {
  return Boolean(getEnv().DATABASE_URL);
}

export function getSql(): SqlClient {
  const url = getEnv().DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL saknas i serverkonfigurationen.");
  }

  // Re-created only if the URL changes, which happens in tests and nowhere else.
  if (!cached || cached.url !== url) {
    cached = { url, sql: neon(url) };
  }

  return cached.sql;
}
