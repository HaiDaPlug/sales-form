import type { CrmRecordId } from "@/lib/crm/types";

export type PipedriveResponse<T> = {
  success: boolean;
  data: T;
  error?: string;
};

export type PipedrivePersonPayload = {
  name: string;
  email?: Array<{ value: string; primary?: boolean; label?: string }>;
  phone?: Array<{ value: string; primary?: boolean; label?: string }>;
  org_id?: CrmRecordId;
};

export type PipedriveOrganizationPayload = {
  name: string;
  address?: string;
  [customFieldKey: string]: unknown;
};

export type PipedriveDealPayload = {
  title: string;
  person_id?: CrmRecordId;
  org_id?: CrmRecordId;
  user_id?: CrmRecordId;
  value?: number;
  currency?: string;
  pipeline_id?: CrmRecordId;
  stage_id?: CrmRecordId;
  [customFieldKey: string]: unknown;
};

export type PipedriveActivityPayload = {
  subject: string;
  type?: string;
  due_date: string;
  due_time?: string;
  duration?: string;
  person_id?: CrmRecordId;
  org_id?: CrmRecordId;
  note?: string;
  location?: string;
  user_id?: CrmRecordId;
};

export type PipedriveNotePayload = {
  content: string;
  deal_id?: CrmRecordId;
  person_id?: CrmRecordId;
  org_id?: CrmRecordId;
};

export type PipedriveFilePayload = {
  file: Blob;
  fileName: string;
  dealId?: CrmRecordId;
  personId?: CrmRecordId;
  organizationId?: CrmRecordId;
  activityId?: CrmRecordId;
};
