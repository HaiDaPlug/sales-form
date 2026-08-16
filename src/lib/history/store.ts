import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "@/lib/config/env";
import { historyEntrySchema, type HistoryEntry, type NewHistoryEntry, type WorkflowKind } from "@/lib/history/types";

/**
 * File-backed history store, written as JSON Lines (one entry per line).
 *
 * This project has no database, and adding one is out of scope for the four
 * workflows. The exported surface is deliberately narrow (`listHistory` /
 * `recordHistory`), so swapping in a real database later means rewriting this
 * file alone.
 *
 * Append-only is load-bearing, not a style choice. A read-modify-write of a
 * single JSON array loses entries under concurrency: Next.js serves route
 * handlers from separate module instances, so an in-process write queue cannot
 * serialize them, and two requests each write back their own stale snapshot.
 * A single `appendFile` with O_APPEND is serialized by the OS, so concurrent
 * writers cannot clobber one another.
 */

const MAX_ENTRIES_READ = 2000;

function getHistoryFilePath(): string {
  const configured = getEnv().HISTORY_FILE_PATH;
  return configured ? path.resolve(configured) : path.join(process.cwd(), ".data", "history.jsonl");
}

async function readAll(): Promise<HistoryEntry[]> {
  let raw: string;

  try {
    raw = await readFile(getHistoryFilePath(), "utf8");
  } catch (error) {
    if (isMissingFile(error)) return [];
    throw error;
  }

  const lines = raw.split("\n").filter((line) => line.trim().length > 0);

  // Drop unreadable rows rather than failing the whole request — one bad line
  // (e.g. a torn write) should not make the history page unusable.
  return lines.slice(-MAX_ENTRIES_READ).flatMap((line) => {
    try {
      const entry = historyEntrySchema.safeParse(JSON.parse(line));
      return entry.success ? [entry.data] : [];
    } catch {
      return [];
    }
  });
}

export async function listHistory(options: { kind?: WorkflowKind; limit?: number } = {}): Promise<HistoryEntry[]> {
  const entries = await readAll();
  const filtered = options.kind ? entries.filter((entry) => entry.kind === options.kind) : entries;

  // Newest first — the file is append-ordered.
  const ordered = [...filtered].reverse();

  return options.limit ? ordered.slice(0, options.limit) : ordered;
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

  const filePath = getHistoryFilePath();
  await mkdir(path.dirname(filePath), { recursive: true });

  // Single append of one line; newline first is avoided so the file never
  // starts with a blank line. JSON.stringify cannot emit a raw newline, so one
  // entry always occupies exactly one line.
  await appendFile(filePath, `${JSON.stringify(created)}\n`, "utf8");

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
 * deals, activities and uploads. Use this after any point of no return.
 */
export async function recordHistorySafely(entry: NewHistoryEntry): Promise<void> {
  try {
    await recordHistory(entry);
  } catch (error) {
    console.error("History write failed after work had already completed:", error);
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "ENOENT";
}
