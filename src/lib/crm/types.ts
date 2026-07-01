export type Currency = "SEK" | "EUR" | "USD";

export type CrmRecordId = string | number;

export type PersonRef = {
  id?: CrmRecordId;
  name: string;
  phone?: string;
  phoneType?: "work" | "mobile" | "other";
  email?: string;
  emailType?: "work" | "private" | "other";
};

export type OrganizationRef = {
  id?: CrmRecordId;
  name: string;
  website?: string;
  address?: string;
  city?: string;
  organizationNumber?: string;
};

export type UserRef = {
  id: CrmRecordId;
  name: string;
  email?: string;
};

export type DealRef = {
  id?: CrmRecordId;
  title: string;
  value?: number;
  currency?: Currency;
  pipelineId?: CrmRecordId;
  stageId?: CrmRecordId;
};

export type MeetingStepData = {
  person: PersonRef;
  organization?: OrganizationRef;
  meetingType: string;
  agenda: string;
  technicianNotes: string;
  internalComment?: string;
  sellerId?: CrmRecordId;
  technicianId?: CrmRecordId;
  technicianName?: string;
  date: string;
  time: string;
  durationMinutes: number;
  locationOrLink: string;
};

export type DealStepData = {
  person: PersonRef;
  organization: OrganizationRef;
  deal: DealRef;
  sellerId?: CrmRecordId;
  viktigastForKunden?: string;
  fakturaStart?: string;
  fakturagrupp?: string;
  contractLengthMonths?: number;
  contractStartDate?: string;
  monthlyCost?: number;
  startFee?: number;
  totalDealValue?: number;
  bindingPeriodMonths?: number;
  cancellationPeriodMonths?: number;
};

export type SupplierSelection = {
  id?: string;
  name: string;
  customerNumber?: string;
  noticeAddress?: string;
};

export type MediacleaningStepData = {
  companyName: string;
  organizationNumber: string;
  address: string;
  city: string;
  documentTypes: Array<"cancellation" | "agreementSummary">;
  suppliers: SupplierSelection[];
  internalComment?: string;
  organizationId?: CrmRecordId;
  dealId?: CrmRecordId;
};

export type ContractStepData = {
  companyName: string;
  organizationNumber: string;
  signerName: string;
  address: string;
  sellerId?: CrmRecordId;
  sellerName?: string;
  price: number;
  paymentInterval: "monthly" | "quarterly" | "yearly";
  bindingPeriodMonths: number;
  includedServices: string[];
  organizationId?: CrmRecordId;
  dealId?: CrmRecordId;
};

export type WizardData = {
  meeting?: Partial<MeetingStepData>;
  deal?: Partial<DealStepData>;
  mediacleaning?: Partial<MediacleaningStepData>;
  contract?: Partial<ContractStepData>;
};

export type SubmitState = {
  status: "idle" | "loading" | "success" | "error";
  message?: string;
};
