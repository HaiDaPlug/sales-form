import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Neon client is replaced by a recorder: these tests are about which SQL
 * the store issues and how it maps rows, not about Postgres.
 */
const query = vi.fn();

vi.mock("@/lib/db/client", () => ({
  isDatabaseConfigured: () => true,
  getSql: () => ({ query })
}));

const { listHistory, recordHistory } = await import("@/lib/history/store");
const { resetSchemaCache } = await import("@/lib/db/schema");

beforeEach(() => {
  query.mockReset().mockResolvedValue([]);
  resetSchemaCache();
});

afterEach(() => {
  resetSchemaCache();
});

const entry = {
  id: "abc",
  kind: "prospect",
  status: "success",
  createdBy: "Filippa",
  sellerOptionId: 72,
  createdAt: "2026-09-09T08:00:00.000Z",
  summary: "Andersson AB Prospekt",
  pipedriveLeadId: "lead-uuid"
};

/** Everything the store issues itself, with the schema setup filtered out. */
function dataQueries() {
  return query.mock.calls.filter(([text]) => !/^\s*(CREATE|ALTER)\s/i.test(String(text)));
}

describe("Postgres history store", () => {
  it("creates the tables before the first query, once", async () => {
    await listHistory({ sellerOptionId: 72 });
    await listHistory({ sellerOptionId: 72 });

    const ddl = query.mock.calls.filter(([text]) => /^\s*(CREATE|ALTER)\s/i.test(String(text)));

    expect(ddl.length).toBeGreaterThan(0);
    expect(dataQueries()).toHaveLength(2);
  });

  it("filters by seller and kind, newest first, with a bounded limit", async () => {
    await listHistory({ sellerOptionId: 72, kind: "prospect", limit: 10 });

    const [text, params] = dataQueries()[0];

    expect(String(text)).toMatch(/ORDER BY created_at DESC/);
    expect(params).toEqual(["72", "prospect", 10]);
  });

  it("passes null for filters that were not given", async () => {
    await listHistory({});

    expect(dataQueries()[0][1]).toEqual([null, null, 50]);
  });

  it("caps the limit", async () => {
    await listHistory({ limit: 1_000_000 });

    expect(dataQueries()[0][1][2]).toBe(2000);
  });

  it("returns the stored entries and skips rows that no longer parse", async () => {
    query.mockImplementation(async (text: string) =>
      /SELECT/.test(text) ? [{ entry }, { entry: { id: "broken" } }] : []
    );

    const entries = await listHistory({ sellerOptionId: 72 });

    expect(entries).toEqual([entry]);
  });

  it("inserts the entry with its seller and the redacted payload as JSON", async () => {
    const created = await recordHistory({
      kind: "prospect",
      status: "success",
      createdBy: "Filippa",
      sellerOptionId: 72,
      summary: "Andersson AB Prospekt",
      payload: { organization: { name: "Andersson AB", organizationNumber: "556677-8899" } }
    });

    const [text, params] = dataQueries()[0];

    expect(String(text)).toMatch(/INSERT INTO history/);
    expect(params.slice(0, 5)).toEqual([created.id, "prospect", "success", "Filippa", "72"]);
    expect(params[5]).toBe(created.createdAt);

    const stored = JSON.parse(params[6] as string);
    expect(stored.payload.organization).toEqual({ name: "Andersson AB" });
    expect(params[6]).not.toContain("556677-8899");
  });

  it("stores a missing seller as null rather than the string 'undefined'", async () => {
    await recordHistory({ kind: "meeting", status: "success", createdBy: "Roble", summary: "Möte" });

    expect(dataQueries()[0][1][4]).toBeNull();
  });
});
