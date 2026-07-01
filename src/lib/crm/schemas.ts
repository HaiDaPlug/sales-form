import { z } from "zod";

const requiredText = (label: string) => z.string().trim().min(1, `${label} krävs`);
const optionalText = z.string().trim().optional();

export const personSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  name: requiredText("Namn"),
  phone: optionalText,
  phoneType: z.enum(["work", "mobile", "other"]).optional(),
  email: z.string().trim().email("Ange en giltig e-post").optional().or(z.literal(""))
});

export const organizationSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
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
  sellerId: z.union([z.string(), z.number()]).optional(),
  technicianId: z.union([z.string(), z.number()]).optional(),
  technicianName: optionalText,
  date: requiredText("Datum"),
  time: requiredText("Tid"),
  durationMinutes: z.coerce.number().min(15, "Minst 15 minuter"),
  locationOrLink: requiredText("Plats eller möteslänk")
});

export const dealStepSchema = z.object({
  person: personSchema,
  organization: organizationSchema.extend({
    organizationNumber: requiredText("Organisationsnummer")
  }),
  deal: z.object({
    id: z.union([z.string(), z.number()]).optional(),
    title: requiredText("Affärstitel"),
    value: z.coerce.number().min(0, "Värde måste vara 0 eller mer"),
    currency: z.enum(["SEK", "EUR", "USD"]).default("SEK"),
    pipelineId: z.union([z.string(), z.number()]).optional(),
    stageId: z.union([z.string(), z.number()]).optional()
  }),
  sellerId: z.union([z.string(), z.number()]).optional(),
  viktigastForKunden: optionalText,
  fakturaStart: optionalText,
  fakturagrupp: optionalText,
  contractLengthMonths: z.coerce.number().positive().optional(),
  contractStartDate: optionalText,
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
    organizationNumber: requiredText("Organisationsnummer"),
    address: requiredText("Adress"),
    city: requiredText("Ort"),
    documentTypes: z.array(z.enum(["cancellation", "agreementSummary"])).min(1, "Välj minst ett dokument"),
    suppliers: z.array(supplierSchema).default([]),
    internalComment: optionalText,
    organizationId: z.union([z.string(), z.number()]).optional(),
    dealId: z.union([z.string(), z.number()]).optional()
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
  organizationNumber: requiredText("Organisationsnummer"),
  signerName: requiredText("Firmatecknare/kontaktperson"),
  address: requiredText("Adress"),
  sellerId: z.union([z.string(), z.number()]).optional(),
  sellerName: optionalText,
  price: z.coerce.number().positive("Pris krävs"),
  paymentInterval: z.enum(["monthly", "quarterly", "yearly"]),
  bindingPeriodMonths: z.coerce.number().positive("Bindningstid krävs"),
  includedServices: z.array(requiredText("Tjänst")).min(1, "Ange minst en tjänst"),
  organizationId: z.union([z.string(), z.number()]).optional(),
  dealId: z.union([z.string(), z.number()]).optional()
});

export type MeetingStepInput = z.infer<typeof meetingStepSchema>;
export type DealStepInput = z.infer<typeof dealStepSchema>;
export type MediacleaningStepInput = z.infer<typeof mediacleaningStepSchema>;
export type ContractStepInput = z.infer<typeof contractStepSchema>;
