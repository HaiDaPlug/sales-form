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

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "ENOENT";
}
