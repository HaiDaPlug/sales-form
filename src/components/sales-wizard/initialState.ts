import type {
  ContractStepData,
  MediacleaningStepData,
  MeetingStepData,
  ProspectStepData
} from "@/lib/crm/types";
import { DEFAULT_CONTRACT_TEMPLATE_ID } from "@/lib/pdf/templates/contract";

/**
 * The state each wizard step starts from.
 *
 * Kept out of `SalesWizard.tsx` so tests can assert against the values the UI
 * actually submits. A copied fixture is what hid the S01 bug: the schema test
 * omitted `organization` entirely, a shape the wizard never produces, so a
 * blank-but-present organization went unvalidated until it failed in the form.
 *
 * No seller anywhere: the seller is the session, attached by the server.
 */

export const initialMeeting: MeetingStepData = {
  person: { name: "", phone: "", phoneType: "mobile", email: "", emailType: "work" },
  organization: { name: "", website: "", address: "", city: "", organizationNumber: "" },
  meetingType: "IT-genomgång",
  agenda: "",
  technicianNotes: "",
  internalComment: "",
  technicianId: "",
  technicianName: "",
  date: "",
  time: "",
  durationMinutes: 60,
  locationOrLink: ""
};

export const initialProspect: ProspectStepData = {
  person: { name: "", phone: "", phoneType: "mobile", email: "", emailType: "work" },
  organization: { name: "", website: "", address: "", city: "", organizationNumber: "" },
  value: 0,
  currency: "SEK",
  // Blank on purpose: the seller has to say which evidence the sale rests on.
  evidenceMethod: undefined as unknown as ProspectStepData["evidenceMethod"],
  viktigastForKunden: "",
  fakturaAvtalStart: "",
  fakturagrupp: "",
  contractLengthMonths: 12,
  monthlyCost: 0,
  startFee: 0,
  totalDealValue: 0,
  // The client's standard term. The seller can type another.
  bindingPeriodMonths: 24
};

export const initialMediacleaning: MediacleaningStepData = {
  companyName: "",
  organizationNumber: "",
  address: "",
  city: "",
  // Always a cancellation run: the summary page is part of every delivery and
  // no longer something the seller chooses.
  documentTypes: ["cancellation"],
  suppliers: [],
  internalComment: "",
  signerName: "",
  organizationId: "",
  leadId: "",
  dealId: "",
  createOrganization: false
};

export const initialContract: ContractStepData = {
  templateId: DEFAULT_CONTRACT_TEMPLATE_ID,
  companyName: "",
  organizationNumber: "",
  signerName: "",
  address: "",
  price: 0,
  paymentInterval: "monthly",
  bindingPeriodMonths: 24,
  includedServices: ["Digital Kontakt"],
  includeMediacleaningDocuments: false,
  organizationId: "",
  dealId: ""
};
