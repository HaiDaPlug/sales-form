import { getSql } from "@/lib/db/client";
import { ensureSchema } from "@/lib/db/schema";
import { historyEntrySchema, type HistoryEntry, type HistoryQuery } from "@/lib/history/types";

/** Reads are bounded so a busy account cannot make the history page unbounded. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 2000;

export async function listEntries(options: HistoryQuery): Promise<HistoryEntry[]> {
  const sql = getSql();
  await ensureSchema(sql);

  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  // `IS NULL` guards make each filter optional without building SQL by hand.
  const rows = await sql.query(
    `SELECT entry FROM history
      WHERE ($1::text IS NULL OR seller_option_id = $1)
        AND ($2::text IS NULL OR kind = $2)
      ORDER BY created_at DESC
      LIMIT $3`,
    [
      options.sellerOptionId === undefined ? null : String(options.sellerOptionId),
      options.kind ?? null,
      limit
    ]
  );

  // A row that no longer matches the schema is skipped rather than breaking the
  // page — the same tolerance the file store has for a torn line.
  return rows.flatMap((row) => {
    const parsed = historyEntrySchema.safeParse(row.entry);
    return parsed.success ? [parsed.data] : [];
  });
}

export async function appendEntry(entry: HistoryEntry): Promise<void> {
  const sql = getSql();
  await ensureSchema(sql);

  await sql.query(
    `INSERT INTO history (id, kind, status, created_by, seller_option_id, created_at, entry)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      entry.id,
      entry.kind,
      entry.status,
      entry.createdBy,
      entry.sellerOptionId === undefined ? null : String(entry.sellerOptionId),
      entry.createdAt,
      JSON.stringify(entry)
    ]
  );
}
