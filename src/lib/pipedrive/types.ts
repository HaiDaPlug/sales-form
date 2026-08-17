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

/**
 * Pipedrive's `/v1/*\/search` endpoints wrap hits as
 * `{ data: { items: [{ result_score, item }] } }` rather than returning a flat
 * array. Verified against the live API. The raw envelope is normalized
 * server-side so the UI never has to know this shape.
 */
export type PipedriveSearchEnvelope = {
  items?: Array<{ result_score?: number; item?: Record<string, unknown> }>;
};

/**
 * Flat, UI-ready option for the reference dropdowns (users, pipelines, stages).
 * `pipelineId` is set on stages so the UI can filter them without another fetch.
 */
export type ReferenceOption = {
  id: CrmRecordId;
  name: string;
  pipelineId?: CrmRecordId;
};

/** Flat, UI-ready search hit. One shape for all three record types. */
export type SearchHit = {
  id: CrmRecordId;
  name: string;
  /** Supporting detail shown under the name, e.g. email or address. */
  detail?: string;
  email?: string;
  phone?: string;
  address?: string;
  /** Organisationsnummer or personnummer, when the account maps that field. */
  organizationNumber?: string;
  organizationId?: CrmRecordId;
  organizationName?: string;
};
