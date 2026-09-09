import type {
  ContractStepData,
  MediacleaningStepData,
  MeetingStepData,
  ProspectStepData
} from "@/lib/crm/types";

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
  bindingPeriodMonths: 12
};

export const initialMediacleaning: MediacleaningStepData = {
  companyName: "",
  organizationNumber: "",
  address: "",
  city: "",
  documentTypes: [],
  suppliers: [],
  internalComment: "",
  organizationId: "",
  dealId: "",
  createOrganization: false
};

export const initialContract: ContractStepData = {
  companyName: "",
  organizationNumber: "",
  signerName: "",
  address: "",
  price: 0,
  paymentInterval: "monthly",
  bindingPeriodMonths: 12,
  includedServices: ["Digital Kontakt"],
  includeMediacleaningDocuments: false,
  organizationId: "",
  dealId: ""
};
