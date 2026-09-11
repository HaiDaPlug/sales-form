import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureSchema, resetSchemaCache } from "@/lib/db/schema";

const query = vi.fn();
const sql = { query } as unknown as Parameters<typeof ensureSchema>[0];

beforeEach(() => {
  query.mockReset().mockResolvedValue([]);
  resetSchemaCache();
});

function statements() {
  return query.mock.calls.map(([text]) => String(text).replace(/\s+/g, " ").trim());
}

describe("ensureSchema", () => {
  it("creates both tables the portal owns", async () => {
    await ensureSchema(sql);

    const created = statements().filter((text) => text.startsWith("CREATE TABLE"));

    expect(created).toHaveLength(2);
    expect(created.join(" ")).toContain("history");
    expect(created.join(" ")).toContain("suppliers");
  });

  it("runs once per client, so a warm function does not repeat it", async () => {
    await ensureSchema(sql);
    await ensureSchema(sql);

    expect(statements().filter((text) => text.startsWith("CREATE TABLE"))).toHaveLength(2);
  });

  it("does not cache a failed attempt as success", async () => {
    query.mockRejectedValueOnce(new Error("connection lost"));

    await expect(ensureSchema(sql)).rejects.toThrow("connection lost");

    query.mockResolvedValue([]);
    await expect(ensureSchema(sql)).resolves.toBeUndefined();
  });

  /**
   * `CREATE TABLE IF NOT EXISTS` leaves an existing table untouched, so a
   * column whose definition changes after the first deploy never reaches a
   * database that already has the table. `organization_number` began NOT NULL
   * and became nullable; the deployed database kept the old constraint and
   * rejected every supplier without a number — including its own seed rows.
   */
  it("reconciles a column whose definition changed after the first deploy", async () => {
    await ensureSchema(sql);

    expect(statements()).toContain(
      "ALTER TABLE suppliers ALTER COLUMN organization_number DROP NOT NULL"
    );
  });

  it("puts every reconciliation after the table that owns it", async () => {
    await ensureSchema(sql);

    const all = statements();
    const createsSuppliers = all.findIndex((text) => text.startsWith("CREATE TABLE") && text.includes("suppliers"));
    const altersSuppliers = all.findIndex((text) => text.startsWith("ALTER TABLE suppliers"));

    expect(createsSuppliers).toBeGreaterThanOrEqual(0);
    expect(altersSuppliers).toBeGreaterThan(createsSuppliers);
  });

  /**
   * Every statement runs on every cold start, so one that is not idempotent
   * would fail the second deployment rather than the first.
   */
  it("uses only statements that are safe to run again", async () => {
    await ensureSchema(sql);

    for (const text of statements()) {
      const idempotent =
        text.includes("IF NOT EXISTS") || /^ALTER TABLE .* DROP NOT NULL$/.test(text);

      expect(idempotent, `not safe to repeat: ${text}`).toBe(true);
    }
  });
});
