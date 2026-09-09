import { z } from "zod";
import { IDENTITY_NUMBER_MESSAGE, normalizeIdentityNumber } from "@/lib/crm/identityNumber";

/**
 * A supplier a customer's agreements can be cancelled with.
 *
 * The cancellation letter needs the recipient's own company details, so every
 * supplier carries its organisationsnummer and notice address — the seller no
 * longer looks them up per document.
 */
export const supplierRecordSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1, "Företagsnamn krävs"),
  /**
   * Normalized, so the same supplier cannot be added under two spellings.
   * Blank on most of the shipped list: the client still owes those numbers,
   * and a guessed one on a cancellation letter is worse than none.
   */
  organizationNumber: z.string().trim().default(""),
  address: z.string().trim().min(1, "Adress krävs"),
  email: z.string().trim().email("Ange en giltig e-post").optional().or(z.literal("")),
  /**
   * False hides a supplier from the picker without removing it from documents
   * already generated. Nothing sets it yet; the column exists so retiring a
   * supplier later does not need a migration.
   */
  active: z.boolean().default(true)
});

export type SupplierRecord = z.infer<typeof supplierRecordSchema>;

/** What a seller fills in when adding a supplier the list does not have. */
export const newSupplierSchema = z.object({
  name: z.string().trim().min(1, "Företagsnamn krävs"),
  organizationNumber: z
    .string()
    .trim()
    .transform((value, ctx) => {
      const normalized = normalizeIdentityNumber(value);

      if (!normalized) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: IDENTITY_NUMBER_MESSAGE });
        return z.NEVER;
      }

      return normalized;
    }),
  address: z.string().trim().min(1, "Adress krävs"),
  email: z.string().trim().email("Ange en giltig e-post").optional().or(z.literal(""))
});

export type NewSupplier = z.infer<typeof newSupplierSchema>;

/** Two sellers adding the same company must not create two entries for it. */
export class DuplicateSupplierError extends Error {
  readonly status = 409;
  readonly existing: SupplierRecord;

  constructor(existing: SupplierRecord) {
    super(`${existing.name} finns redan i leverantörslistan med organisationsnummer ${existing.organizationNumber}.`);
    this.name = "DuplicateSupplierError";
    this.existing = existing;
  }
}
