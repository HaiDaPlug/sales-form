import { z } from "zod";
import { IDENTITY_NUMBER_MESSAGE, normalizeIdentityNumber } from "@/lib/crm/identityNumber";

const requiredText = (label: string) => z.string().trim().min(1, `${label} krävs`);
const optionalText = z.string().trim().optional();
const recordId = z.union([z.string(), z.number()]);
const requiredRecordId = (label: string) =>
  z.union([z.string().trim().min(1, `${label} krävs`), z.number()]);

/**
 * ISO calendar date, e.g. 2026-08-03. Guards against free text reaching
 * Pipedrive. `superRefine` rather than chained checks, so a bad value reports
 * one message instead of one per rule.
 */
const isoDate = (label: string) =>
  z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      const wellFormed = /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

      if (!wellFormed) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} måste vara ett giltigt datum` });
      }
    });

const optionalIsoDate = (label: string) => isoDate(label).optional().or(z.literal(""));

/** 24-hour clock time, e.g. 13:30. */
const isoTime = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label} måste vara ett giltigt klockslag`);

/**
 * Organisationsnummer or personnummer, in one field.
 *
 * Private individuals and sole traders are registered as organizations with
 * their personnummer here, so both shapes must pass. The value is normalized to
 * the stored 10-digit form (`NNNNNN-NNNN`) at parse time — a 12-digit
 * personnummer would otherwise be stored as a second spelling of a customer who
 * already exists, defeating the duplicate check.
 *
 * Checksum validation is deliberately omitted — the client has not confirmed
 * whether foreign customers are in scope, so format-only avoids false rejects.
 */
const organizationNumber = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalized = normalizeIdentityNumber(value);

    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: IDENTITY_NUMBER_MESSAGE });
      return z.NEVER;
    }

    return normalized;
  });

/** Same rules, but blank is allowed — used where the identity is not yet known. */
const optionalIdentityNumber = z
  .union([organizationNumber, z.literal("")])
  .optional();

export const personSchema = z.object({
  id: recordId.optional(),
  name: requiredText("Namn"),
  phone: optionalText,
  phoneType: z.enum(["work", "mobile", "other"]).optional(),
  emailType: z.enum(["work", "private", "other"]).optional(),
  email: z.string().trim().email("Ange en giltig e-post").optional().or(z.literal("")),
  /** Set when a person is picked from lookup; decides whether a re-link is needed. */
  organizationId: recordId.optional()
});

/**
 * Whether the customer is a company or a private individual / sole trader.
 * Both are stored as Pipedrive organizations; the distinction drives UI copy
 * and tells the seller that a personnummer belongs in the identity field.
 */
export const customerTypeSchema = z.enum(["company", "individual"]);

export const organizationSchema = z.object({
  id: recordId.optional(),
  name: requiredText("Organisationsnamn"),
  customerType: customerTypeSchema.optional(),
  website: optionalText,
  address: optionalText,
  city: optionalText,
  // Optional here: the meeting step must work with no organization data at all.
  // Normalized when present so it matches the stored form used by the deal and
  // document steps.
  organizationNumber: optionalIdentityNumber
});

/**
 * `name` may be blank here, unlike on a deal. The wizard always sends an
 * organization object with every field initialized to `""`, so `.partial()`
 * alone is not enough — it makes the key optional but still runs
 * `requiredText` on a name that is present and blank, failing a meeting booked
 * from contact details alone (S01).
 */
const meetingOrganizationSchema = organizationSchema.partial().extend({
  name: optionalText
});

/**
 * Drops an organization the seller never filled in.
 *
 * Applied after parsing rather than through `z.preprocess`, which widens its
 * input to `unknown` and would erase the shape the wizard's organization fields
 * are edited through (`z.input<typeof meetingStepSchema>` feeds
 * `MeetingStepData`).
 *
 * Returning `undefined` — rather than an object of empty strings — is what
 * keeps `parsed.organization?.name ?? parsed.person.name` in the meeting route
 * from logging a blank customer name, and mirrors `resolveMeetingParties`,
 * which already treats a blank name as "no organization".
 */
const optionalOrganization = meetingOrganizationSchema.optional().transform((organization) => {
  if (!organization) return undefined;

  // `customerType` is excluded deliberately: it is a UI mode with a default
  // ("company"), not something the seller entered, so it must not by itself
  // make an otherwise empty organization look filled in.
  const hasContent = Object.entries(organization).some(
    ([key, field]) => key !== "customerType" && field !== undefined && String(field).trim() !== ""
  );

  return hasContent ? organization : undefined;
});

export const meetingStepSchema = z.object({
  person: personSchema,
  organization: optionalOrganization,
  meetingType: requiredText("Mötestyp"),
  agenda: requiredText("Agenda"),
  technicianNotes: requiredText("Anteckningar till IT-tekniker"),
  internalComment: optionalText,
  sellerId: recordId.optional(),
  technicianId: recordId.optional(),
  technicianName: optionalText,
  date: isoDate("Datum"),
  time: isoTime("Tid"),
  durationMinutes: z.coerce.number().min(15, "Minst 15 minuter"),
  locationOrLink: requiredText("Plats eller möteslänk")
});

export const dealStepSchema = z.object({
  person: personSchema.extend({
    phone: requiredText("Telefon"),
    email: z.string().trim().email("Ange en giltig e-post")
  }),
  organization: organizationSchema.extend({
    website: requiredText("Webbplats"),
    address: requiredText("Adress"),
    organizationNumber
  }),
  deal: z.object({
    id: recordId.optional(),
    title: requiredText("Affärstitel"),
    value: z.coerce.number().min(0, "Värde måste vara 0 eller mer"),
    currency: z.enum(["SEK", "EUR", "USD"]).default("SEK"),
    pipelineId: requiredRecordId("Pipeline"),
    stageId: recordId.optional()
  }),
  sellerId: requiredRecordId("Affärens säljare"),
  viktigastForKunden: requiredText("Viktigast för kunden"),
  fakturaStart: isoDate("Faktura start"),
  fakturagrupp: requiredText("Fakturagrupp"),
  contractLengthMonths: z.coerce.number().positive().optional(),
  contractStartDate: optionalIsoDate("Avtalsstart"),
  monthlyCost: z.coerce.number().min(0).optional(),
  startFee: z.coerce.number().min(0).optional(),
  totalDealValue: z.coerce.number().min(0).optional(),
  bindingPeriodMonths: z.coerce.number().min(0).optional(),
  cancellationPeriodMonths: z.coerce.number().min(0).optional()
});

/**
 * A supplier to send a cancellation to.
 *
 * `isOther` marks a supplier typed in by hand because it is not in the standard
 * list. Those carry no known notice address, so name and address both become
 * required — a cancellation letter with no recipient address cannot be sent.
 * Email stays optional: the document is a PDF, and the address is what it is
 * posted to.
 */
export const supplierSchema = z.object({
  id: optionalText,
  name: requiredText("Leverantör"),
  customerNumber: optionalText,
  noticeAddress: requiredText("Uppsägningsadress"),
  email: z.string().trim().email("Ange en giltig e-post").optional().or(z.literal("")),
  comment: optionalText,
  isOther: z.boolean().optional()
});

export const mediacleaningStepSchema = z
  .object({
    companyName: requiredText("Företagsnamn"),
    organizationNumber,
    address: requiredText("Adress"),
    city: requiredText("Ort"),
    documentTypes: z.array(z.enum(["cancellation", "agreementSummary"])).min(1, "Välj minst ett dokument"),
    suppliers: z.array(supplierSchema).default([]),
    internalComment: optionalText,
    organizationId: recordId.optional(),
    dealId: recordId.optional(),
    /**
     * Seller asked to register this customer as a new organization because no
     * matching record was found (S17). Ignored when an organization is already
     * selected, so it cannot create a duplicate of the linked record.
     */
    createOrganization: z.boolean().optional()
  })
  .superRefine((value, ctx) => {
    if (value.documentTypes.includes("cancellation") && value.suppliers.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["suppliers"],
        message: "Välj minst en leverantör när uppsägningsdokument ska skapas"
      });
    }
  });

export const contractStepSchema = z.object({
  companyName: requiredText("Företagsnamn"),
  organizationNumber,
  signerName: requiredText("Firmatecknare/kontaktperson"),
  address: requiredText("Adress"),
  sellerId: recordId.optional(),
  sellerName: requiredText("Ansvarig säljare"),
  price: z.coerce.number().positive("Pris krävs"),
  paymentInterval: z.enum(["monthly", "quarterly", "semiannual"]),
  bindingPeriodMonths: z.coerce.number().positive("Bindningstid krävs"),
  includedServices: z.array(requiredText("Tjänst")).min(1, "Ange minst en tjänst"),
  /** Only combines documents when the seller explicitly asks for it (5.4). */
  includeMediacleaningDocuments: z.boolean().default(false),
  organizationId: recordId.optional(),
  dealId: recordId.optional()
});

/**
 * The contract form stays independent, while the document request may carry a
 * completed Mediacleaning step for an explicitly selected combined PDF.
 */
export const contractDocumentRequestSchema = z
  .object({
    contract: contractStepSchema,
    mediacleaning: mediacleaningStepSchema.optional()
  })
  .superRefine((value, ctx) => {
    if (value.contract.includeMediacleaningDocuments && !value.mediacleaning) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediacleaning"],
        message: "Fyll i och validera Mediacleaning-steget innan dokumenten kombineras"
      });
    }

    if (
      value.contract.includeMediacleaningDocuments &&
      value.mediacleaning &&
      value.contract.organizationNumber !== value.mediacleaning.organizationNumber
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediacleaning", "organizationNumber"],
        message: "Avtal och Mediacleaning måste avse samma kund"
      });
    }

    if (
      value.contract.includeMediacleaningDocuments &&
      value.mediacleaning?.organizationId &&
      value.contract.organizationId &&
      String(value.mediacleaning.organizationId) !== String(value.contract.organizationId)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediacleaning", "organizationId"],
        message: "Avtal och Mediacleaning är kopplade till olika organisationer"
      });
    }

    if (
      value.contract.includeMediacleaningDocuments &&
      value.mediacleaning?.dealId &&
      value.contract.dealId &&
      String(value.mediacleaning.dealId) !== String(value.contract.dealId)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediacleaning", "dealId"],
        message: "Avtal och Mediacleaning är kopplade till olika affärer"
      });
    }
  });

/* Payloads for the previously unvalidated Pipedrive passthrough routes. */

export const createPersonSchema = z.object({
  name: requiredText("Namn"),
  email: z.array(z.object({ value: z.string().trim().email(), primary: z.boolean().optional(), label: optionalText })).optional(),
  phone: z.array(z.object({ value: requiredText("Telefon"), primary: z.boolean().optional(), label: optionalText })).optional(),
  org_id: recordId.optional()
});

export const createOrganizationSchema = z.object({
  name: requiredText("Organisationsnamn"),
  address: optionalText
});

export const createActivitySchema = z.object({
  subject: requiredText("Ämne"),
  type: optionalText,
  due_date: isoDate("Datum"),
  due_time: isoTime("Tid").optional(),
  duration: optionalText,
  person_id: recordId.optional(),
  org_id: recordId.optional(),
  note: optionalText,
  location: optionalText,
  user_id: recordId.optional()
});

export const createNoteSchema = z
  .object({
    content: requiredText("Innehåll"),
    deal_id: recordId.optional(),
    person_id: recordId.optional(),
    org_id: recordId.optional()
  })
  .refine(
    (value) => Boolean(value.deal_id ?? value.person_id ?? value.org_id),
    "En anteckning måste kopplas till en affär, person eller organisation"
  );

export type MeetingStepInput = z.infer<typeof meetingStepSchema>;
export type DealStepInput = z.infer<typeof dealStepSchema>;
export type MediacleaningStepInput = z.infer<typeof mediacleaningStepSchema>;
export type ContractStepInput = z.infer<typeof contractStepSchema>;
