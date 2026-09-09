import { randomUUID } from "node:crypto";
import { getSql, isDatabaseConfigured } from "@/lib/db/client";
import { ensureSchema } from "@/lib/db/schema";
import { KNOWN_SUPPLIERS } from "@/lib/suppliers/known";
import {
  DuplicateSupplierError,
  supplierRecordSchema,
  type NewSupplier,
  type SupplierRecord
} from "@/lib/suppliers/types";

/**
 * The suppliers a cancellation can be addressed to.
 *
 * The standard list ships with the code and is seeded into the database on
 * first use; anything a seller adds afterwards lives only in the database.
 * Without `DATABASE_URL` — local development — the standard list is served
 * read-only, so the form works but "Spara" has nowhere to persist to.
 */
export async function listSuppliers(): Promise<SupplierRecord[]> {
  if (!isDatabaseConfigured()) return seedRecords();

  const sql = getSql();
  await ensureSchema(sql);
  await seedOnce(sql);

  const rows = await sql.query(
    `SELECT id, name, organization_number, address, email, active
       FROM suppliers
      WHERE active
      ORDER BY name`
  );

  return rows.flatMap((row) => {
    const parsed = supplierRecordSchema.safeParse({
      id: row.id,
      name: row.name,
      organizationNumber: row.organization_number ?? "",
      address: row.address,
      email: row.email ?? "",
      active: row.active
    });

    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Adds a supplier a seller could not find, so the next document can pick it
 * from the list. Refuses a company already there under the same identity
 * number, whichever spelling of the name it was entered with.
 */
export async function addSupplier(supplier: NewSupplier, createdBy: string): Promise<SupplierRecord> {
  if (!isDatabaseConfigured()) {
    throw new Error("Leverantörsregistret kräver en databas (DATABASE_URL saknas).");
  }

  const sql = getSql();
  await ensureSchema(sql);
  await seedOnce(sql);

  // A seller always gives the number, so a duplicate can be recognised even
  // though most seeded rows have none yet.
  const existing = await findByOrganizationNumber(sql, supplier.organizationNumber);
  if (existing) throw new DuplicateSupplierError(existing);

  const record: SupplierRecord = {
    id: randomUUID(),
    name: supplier.name,
    organizationNumber: supplier.organizationNumber,
    address: supplier.address,
    email: supplier.email ?? "",
    active: true
  };

  try {
    await sql.query(
      `INSERT INTO suppliers (id, name, organization_number, address, email, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [record.id, record.name, record.organizationNumber, record.address, record.email || null, createdBy]
    );
  } catch (error) {
    // Two sellers can reach the insert at once; the unique index is what
    // actually decides, so a collision here is the same answer as above.
    const duplicate = await findByOrganizationNumber(sql, supplier.organizationNumber);
    if (duplicate) throw new DuplicateSupplierError(duplicate);

    throw error;
  }

  return record;
}

async function findByOrganizationNumber(
  sql: ReturnType<typeof getSql>,
  organizationNumber: string
): Promise<SupplierRecord | undefined> {
  const rows = await sql.query(
    `SELECT id, name, organization_number, address, email, active
       FROM suppliers
      WHERE organization_number = $1
      LIMIT 1`,
    [organizationNumber]
  );

  const row = rows[0];
  if (!row) return undefined;

  const parsed = supplierRecordSchema.safeParse({
    id: row.id,
    name: row.name,
    organizationNumber: row.organization_number,
    address: row.address,
    email: row.email ?? "",
    active: row.active
  });

  return parsed.success ? parsed.data : undefined;
}

/**
 * The shipped list, as records. Ids are derived from the name — the only value
 * every entry has, and one that is unique across the list — so a seeded
 * supplier keeps the same id across deployments.
 */
function seedRecords(): SupplierRecord[] {
  return KNOWN_SUPPLIERS.map((supplier) => ({
    id: `known-${slugify(supplier.name)}`,
    name: supplier.name,
    organizationNumber: supplier.organizationNumber,
    address: supplier.noticeAddress,
    email: "",
    active: true
  }));
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

let seeded: Promise<void> | undefined;

/**
 * Copies the shipped list into the database once per process. `ON CONFLICT DO
 * NOTHING` makes it idempotent, so concurrent cold starts cannot duplicate a
 * supplier or fight over one an administrator has since edited.
 */
function seedOnce(sql: ReturnType<typeof getSql>): Promise<void> {
  seeded ??= (async () => {
    for (const supplier of seedRecords()) {
      // The id conflict is what makes re-seeding a no-op; most seeded rows
      // share the blank identity number, so that cannot be the key here.
      await sql.query(
        `INSERT INTO suppliers (id, name, organization_number, address, email, created_by)
         VALUES ($1, $2, $3, $4, NULL, 'seed')
         ON CONFLICT (id) DO NOTHING`,
        [supplier.id, supplier.name, supplier.organizationNumber || null, supplier.address]
      );
    }
  })().catch((error) => {
    seeded = undefined;
    throw error;
  });

  return seeded;
}

/** Test seam. */
export function resetSupplierSeedCache() {
  seeded = undefined;
}
