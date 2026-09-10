import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The database is a recorder: these tests are about the store's decisions. */
const query = vi.fn();

vi.mock("@/lib/db/client", () => ({
  isDatabaseConfigured: () => configured,
  getSql: () => ({ query })
}));

let configured = true;

const { addSupplier, listSuppliers, resetSupplierSeedCache } = await import("@/lib/suppliers/store");
const { DuplicateSupplierError } = await import("@/lib/suppliers/types");
const { KNOWN_SUPPLIERS } = await import("@/lib/suppliers/known");
const { resetSchemaCache } = await import("@/lib/db/schema");

/** Rows as Postgres returns them: snake_case columns, null for a missing value. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "known-telia-sverige-ab",
    name: "Telia Sverige AB",
    organization_number: null,
    address: "Box 50077, 104 05 Stockholm",
    email: null,
    active: true,
    ...overrides
  };
}

beforeEach(() => {
  configured = true;
  query.mockReset().mockResolvedValue([]);
  resetSchemaCache();
  resetSupplierSeedCache();
});

afterEach(() => {
  resetSchemaCache();
  resetSupplierSeedCache();
});

function statements() {
  return query.mock.calls.map(([text]) => String(text));
}

describe("listSuppliers", () => {
  it("seeds the shipped list once, then reads the table", async () => {
    await listSuppliers();
    await listSuppliers();

    const inserts = statements().filter((text) => text.includes("INSERT INTO suppliers"));
    const selects = statements().filter((text) => text.includes("SELECT"));

    expect(inserts).toHaveLength(KNOWN_SUPPLIERS.length);
    expect(selects).toHaveLength(2);
  });

  /**
   * Most of the shipped list has no identity number yet, so the id — derived
   * from the name — is what makes re-seeding a no-op.
   */
  it("seeds by id, so a second deployment does not duplicate the list", async () => {
    await listSuppliers();

    const insert = statements().find((text) => text.includes("INSERT INTO suppliers"));

    expect(insert).toContain("ON CONFLICT (id) DO NOTHING");
  });

  it("stores a missing identity number as null rather than an empty string", async () => {
    await listSuppliers();

    const seedCall = query.mock.calls.find(([text]) => String(text).includes("INSERT INTO suppliers"));

    expect(seedCall?.[1]?.[2]).toBeNull();
  });

  it("returns the rows as records, with a null number read as blank", async () => {
    query.mockImplementation(async (text: string) => (text.includes("SELECT") ? [row()] : []));

    await expect(listSuppliers()).resolves.toEqual([
      {
        id: "known-telia-sverige-ab",
        name: "Telia Sverige AB",
        organizationNumber: "",
        address: "Box 50077, 104 05 Stockholm",
        email: "",
        active: true
      }
    ]);
  });

  it("serves the shipped list read-only without a database", async () => {
    configured = false;

    const suppliers = await listSuppliers();

    expect(suppliers).toHaveLength(KNOWN_SUPPLIERS.length);
    expect(query).not.toHaveBeenCalled();
  });
});

describe("addSupplier", () => {
  const supplier = {
    name: "Lokaltidningen AB",
    organizationNumber: "556059-9282",
    address: "Box 1, 111 11 Stockholm",
    email: ""
  };

  it("inserts the supplier and returns it for immediate selection", async () => {
    const saved = await addSupplier(supplier, "Filippa");

    expect(saved).toMatchObject({ name: "Lokaltidningen AB", organizationNumber: "556059-9282", active: true });
    expect(statements().some((text) => text.includes("INSERT INTO suppliers (id, name"))).toBe(true);
  });

  it("refuses a company already in the list under the same identity number", async () => {
    query.mockImplementation(async (text: string) =>
      String(text).includes("SELECT") ? [row({ organization_number: "556059-9282", name: "Lokaltidningen AB" })] : []
    );

    const error = await addSupplier(supplier, "Filippa").catch((thrown) => thrown);

    expect(error).toBeInstanceOf(DuplicateSupplierError);
    expect(error.message).toContain("Lokaltidningen AB");
  });

  /**
   * Two sellers can reach the insert at once: both pass the duplicate check,
   * and the unique index is what actually decides. The loser must be told the
   * same thing as if they had been second by a minute.
   */
  it("reports a race lost to a colleague as the same duplicate", async () => {
    // The seed inserts carry ON CONFLICT; only the real insert is bare, which
    // is what distinguishes the colleague's row arriving mid-flight.
    const isRealInsert = (sql: string) =>
      sql.includes("INSERT INTO suppliers (id, name") && !sql.includes("ON CONFLICT");
    let lost = false;

    query.mockImplementation(async (text: string) => {
      const sql = String(text);

      if (isRealInsert(sql)) {
        lost = true;
        throw new Error("duplicate key value violates unique constraint");
      }

      // Empty until the colleague's row lands, so the pre-check passes first.
      if (sql.includes("SELECT") && lost) {
        return [row({ organization_number: "556059-9282", name: "Lokaltidningen AB" })];
      }

      return [];
    });

    await expect(addSupplier(supplier, "Filippa")).rejects.toBeInstanceOf(DuplicateSupplierError);
  });

  it("lets an unrelated database failure surface as itself", async () => {
    query.mockImplementation(async (text: string) => {
      if (String(text).includes("INSERT INTO suppliers (id, name") && !String(text).includes("ON CONFLICT")) {
        throw new Error("connection terminated");
      }

      return [];
    });

    await expect(addSupplier(supplier, "Filippa")).rejects.toThrow("connection terminated");
  });

  it("refuses to pretend it saved anything without a database", async () => {
    configured = false;

    await expect(addSupplier(supplier, "Filippa")).rejects.toThrow(/DATABASE_URL/);
  });
});
