import type { z } from "zod";
import type {
  contractStepSchema,
  dealStepSchema,
  mediacleaningStepSchema,
  meetingStepSchema,
  organizationSchema,
  personSchema,
  supplierSchema
} from "@/lib/crm/schemas";

export type Currency = "SEK" | "EUR" | "USD";

export type CrmRecordId = string | number;

/**
 * Step shapes are derived from the zod schemas so validation and types cannot
 * drift apart. `z.input` (not `z.infer`) is used for the form state, because
 * the UI holds pre-coercion values — number inputs surface strings before
 * `z.coerce` runs at submit time.
 */
export type PersonRef = z.input<typeof personSchema>;
export type OrganizationRef = z.input<typeof organizationSchema>;
export type SupplierSelection = z.input<typeof supplierSchema>;

export type MeetingStepData = z.input<typeof meetingStepSchema>;
export type DealStepData = z.input<typeof dealStepSchema>;
export type MediacleaningStepData = z.input<typeof mediacleaningStepSchema>;
export type ContractStepData = z.input<typeof contractStepSchema>;

export type DealRef = DealStepData["deal"];

export type UserRef = {
  id: CrmRecordId;
  name: string;
  email?: string;
};

export type WizardData = {
  meeting?: z.output<typeof meetingStepSchema>;
  deal?: z.output<typeof dealStepSchema>;
  mediacleaning?: z.output<typeof mediacleaningStepSchema>;
  contract?: z.output<typeof contractStepSchema>;
};

export type SubmitState = {
  status: "idle" | "loading" | "success" | "error";
  message?: string;
};
