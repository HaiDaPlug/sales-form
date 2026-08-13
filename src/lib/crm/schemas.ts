import { z } from "zod";

const requiredText = (label: string) => z.string().trim().min(1, `${label} krävs`);
const optionalText = z.string().trim().optional();
const recordId = z.union([z.string(), z.number()]);

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
 * Swedish organisation number: NNNNNN-NNNN, optionally with a century prefix.
 * Checksum validation is deliberately omitted — the client has not confirmed
 * whether foreign customers are in scope, so format-only avoids false rejects.
 */
const organizationNumber = z
  .string()
  .trim()
  .regex(/^(\d{2})?\d{6}-?\d{4}$/, "Organisationsnummer måste ha formatet NNNNNN-NNNN");

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

export const organizationSchema = z.object({
  id: recordId.optional(),
  name: requiredText("Organisationsnamn"),
  website: optionalText,
  address: optionalText,
  city: optionalText,
  organizationNumber: optionalText
});

export const meetingStepSchema = z.object({
  person: personSchema,
  organization: organizationSchema.partial().optional(),
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
    email: z.string().trim().email("Ange en giltig e-post")
  }),
  organization: organizationSchema.extend({
    organizationNumber
  }),
  deal: z.object({
    id: recordId.optional(),
    title: requiredText("Affärstitel"),
    value: z.coerce.number().min(0, "Värde måste vara 0 eller mer"),
    currency: z.enum(["SEK", "EUR", "USD"]).default("SEK"),
    pipelineId: recordId.optional(),
    stageId: recordId.optional()
  }),
  sellerId: recordId.optional(),
  viktigastForKunden: optionalText,
  fakturaStart: optionalIsoDate("Faktura start"),
  fakturagrupp: optionalText,
  contractLengthMonths: z.coerce.number().positive().optional(),
  contractStartDate: optionalIsoDate("Avtalsstart"),
  monthlyCost: z.coerce.number().min(0).optional(),
  startFee: z.coerce.number().min(0).optional(),
  totalDealValue: z.coerce.number().min(0).optional(),
  bindingPeriodMonths: z.coerce.number().min(0).optional(),
  cancellationPeriodMonths: z.coerce.number().min(0).optional()
});

export const supplierSchema = z.object({
  id: optionalText,
  name: requiredText("Leverantör"),
  customerNumber: optionalText,
  noticeAddress: optionalText
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
    dealId: recordId.optional()
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
  sellerName: optionalText,
  price: z.coerce.number().positive("Pris krävs"),
  paymentInterval: z.enum(["monthly", "quarterly", "yearly"]),
  bindingPeriodMonths: z.coerce.number().positive("Bindningstid krävs"),
  includedServices: z.array(requiredText("Tjänst")).min(1, "Ange minst en tjänst"),
  organizationId: recordId.optional(),
  dealId: recordId.optional()
});

/* Payloads for the previously unvalidated Pipedrive passthrough routes. */

export const createPersonSchema = z.object({
  name: requiredText("Namn"),
  email: z.array(z.object({ value: z.string().trim().email(), primary: z.boolean().optional(), label: optionalText })).optional(),
  phone: z.array(z.object({ value: requiredText("Telefon"), primary: z.boolean().optional(), label: optionalText })).optional(),
  org_id: recordId.optional()
});

export const updatePersonSchema = z.object({
  id: recordId,
  payload: createPersonSchema.partial()
});

export const createOrganizationSchema = z.object({
  name: requiredText("Organisationsnamn"),
  address: optionalText
});

export const updateOrganizationSchema = z.object({
  id: recordId,
  payload: createOrganizationSchema.partial()
});

export const linkPersonOrganizationSchema = z.object({
  personId: recordId,
  organizationId: recordId
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
