import { randomUUID } from "node:crypto";
import { isDatabaseConfigured } from "@/lib/db/client";
import * as fileStore from "@/lib/history/fileStore";
import * as postgresStore from "@/lib/history/postgresStore";
import type { HistoryEntry, HistoryQuery, NewHistoryEntry } from "@/lib/history/types";

/**
 * Run history.
 *
 * The exported surface is deliberately narrow (`listHistory` / `recordHistory`)
 * so the backing store can change without touching a route. Postgres when
 * `DATABASE_URL` is set — the only option on Vercel — and a local JSON Lines
 * file otherwise.
 */
function backend() {
  return isDatabaseConfigured() ? postgresStore : fileStore;
}

export async function listHistory(options: HistoryQuery = {}): Promise<HistoryEntry[]> {
  return backend().listEntries(options);
}

export async function recordHistory(entry: NewHistoryEntry): Promise<HistoryEntry> {
  const created: HistoryEntry = {
    ...entry,
    // Redaction happens here rather than at each call site, so no future caller
    // can write an identity number into the log by forgetting to strip it.
    payload: redactSensitive(entry.payload),
    id: randomUUID(),
    createdAt: new Date().toISOString()
  };

  await backend().appendEntry(created);

  return created;
}

/**
 * Identity-number fields, dropped entirely before a run is logged.
 *
 * An organisationsnummer field may hold a personnummer — private individuals
 * and sole traders are stored that way — so the field is treated as personal
 * data regardless of which one it holds. Nothing in the history reads it: runs
 * are identified by customer name and Pipedrive record IDs. Keeping even a
 * partial value would be retention without a purpose, so it is removed rather
 * than masked.
 *
 * Matching is by name and includes likely aliases. A field named something
 * unanticipated would still slip through, so this is a safety net for the
 * shapes we have, not a guarantee about future ones.
 */
const SENSITIVE_KEY_PATTERN = /organizationnumber|organisationsnummer|personnummer|identitynumber|personalnumber/i;

/** Deep copy with identity numbers removed. Arrays and nesting are preserved. */
function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);

  if (typeof value !== "object" || value === null) return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_KEY_PATTERN.test(key))
      .map(([key, entry]) => [key, redactSensitive(entry)])
  );
}

/**
 * Records a run without ever failing the request.
 *
 * History is a local convenience; the CRM write and the generated document are
 * the real work. Once either has happened, a failed log write must not surface
 * as an error the seller would retry — that retry is what creates duplicate
 * prospects, activities and uploads. Use this after any point of no return.
 */
export async function recordHistorySafely(entry: NewHistoryEntry): Promise<void> {
  try {
    await recordHistory(entry);
  } catch (error) {
    console.error("History write failed after work had already completed:", error);
  }
}
