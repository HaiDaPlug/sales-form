import type { SqlClient } from "@/lib/db/client";

/**
 * The two tables the portal owns. Everything customer-related is in Pipedrive;
 * this holds only what Pipedrive has no place for.
 *
 * `history.entry` carries the whole log entry as JSON, validated by
 * `historyEntrySchema` on the way out. The indexed columns beside it exist for
 * the two queries the app makes — a seller's recent runs, optionally by kind —
 * and nothing else, so a new field on the entry needs no migration.
 */
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS history (
     id TEXT PRIMARY KEY,
     kind TEXT NOT NULL,
     status TEXT NOT NULL,
     created_by TEXT NOT NULL,
     seller_option_id TEXT,
     created_at TIMESTAMPTZ NOT NULL,
     entry JSONB NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS history_seller_created_idx
     ON history (seller_option_id, created_at DESC)`,
  /**
   * `organization_number` is nullable and unique only among the rows that have
   * one: most of the shipped list is still waiting on numbers from the client,
   * and Postgres treats NULLs as distinct, so those rows coexist while any
   * supplier a seller adds is deduplicated by identity.
   */
  `CREATE TABLE IF NOT EXISTS suppliers (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     organization_number TEXT UNIQUE,
     address TEXT NOT NULL,
     email TEXT,
     active BOOLEAN NOT NULL DEFAULT TRUE,
     created_by TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`
];

let ensured: { sql: SqlClient; done: Promise<void> } | undefined;

/**
 * Creates the tables on first use. Idempotent, and memoized per process so a
 * warm function runs it once; a cold start pays for three `IF NOT EXISTS`
 * statements, which is cheaper than a migration step nobody would remember.
 */
export function ensureSchema(sql: SqlClient): Promise<void> {
  if (ensured?.sql === sql) return ensured.done;

  const done = (async () => {
    for (const statement of STATEMENTS) {
      await sql.query(statement);
    }
  })().catch((error) => {
    // A failed attempt must not be cached as success.
    ensured = undefined;
    throw error;
  });

  ensured = { sql, done };
  return done;
}

/** Test seam. */
export function resetSchemaCache() {
  ensured = undefined;
}
