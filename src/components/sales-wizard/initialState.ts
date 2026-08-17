import type {
  ContractStepData,
  DealStepData,
  MediacleaningStepData,
  MeetingStepData
} from "@/lib/crm/types";

/**
 * The state each wizard step starts from.
 *
 * Kept out of `SalesWizard.tsx` so tests can assert against the values the UI
 * actually submits. A copied fixture is what hid the S01 bug: the schema test
 * omitted `organization` entirely, a shape the wizard never produces, so a
 * blank-but-present organization went unvalidated until it failed in the form.
 */

export const initialMeeting: MeetingStepData = {
  person: { name: "", phone: "", phoneType: "mobile", email: "", emailType: "work" },
  organization: { name: "", customerType: "company", website: "", address: "", city: "", organizationNumber: "" },
  meetingType: "IT-genomgång",
  agenda: "",
  technicianNotes: "",
  internalComment: "",
  sellerId: "",
  technicianId: "",
  technicianName: "",
  date: "",
  time: "",
  durationMinutes: 60,
  locationOrLink: ""
};

export const initialDeal: DealStepData = {
  person: { name: "", phone: "", phoneType: "mobile", email: "", emailType: "work" },
  organization: { name: "", customerType: "company", website: "", address: "", city: "", organizationNumber: "" },
  deal: { title: "", value: 0, currency: "SEK", pipelineId: "", stageId: "" },
  sellerId: "",
  viktigastForKunden: "",
  fakturaStart: "",
  fakturagrupp: "",
  contractLengthMonths: 12,
  contractStartDate: "",
  monthlyCost: 0,
  startFee: 0,
  totalDealValue: 0,
  bindingPeriodMonths: 12,
  cancellationPeriodMonths: 3
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
  sellerId: "",
  sellerName: "",
  price: 0,
  paymentInterval: "monthly",
  bindingPeriodMonths: 12,
  includedServices: ["Digital Kontakt"],
  includeMediacleaningDocuments: false,
  organizationId: "",
  dealId: ""
};
