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

/**
 * `POST /v1/leads`. A lead needs a title and at least one of person or
 * organization; custom fields use the deal field keys, which leads inherit.
 */
export type PipedriveLeadPayload = {
  title: string;
  owner_id?: number;
  person_id?: CrmRecordId;
  organization_id?: CrmRecordId;
  value?: { amount: number; currency: string };
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
  lead_id?: string;
  note?: string;
  location?: string;
  user_id?: CrmRecordId;
};

export type PipedriveNotePayload = {
  content: string;
  /** Lead ids are UUIDs, unlike every other Pipedrive id. */
  lead_id?: string;
  deal_id?: CrmRecordId;
  person_id?: CrmRecordId;
  org_id?: CrmRecordId;
};

export type PipedriveFilePayload = {
  file: Blob;
  fileName: string;
  leadId?: string;
  dealId?: CrmRecordId;
  personId?: CrmRecordId;
  organizationId?: CrmRecordId;
  activityId?: CrmRecordId;
};

/**
 * Pipedrive's `/search` endpoints wrap hits as
 * `{ data: { items: [{ result_score, item }] } }` rather than returning a flat
 * array. Verified against the live API. The raw envelope is normalized
 * server-side so the UI never has to know this shape.
 */
export type PipedriveSearchEnvelope = {
  items?: Array<{ result_score?: number; item?: Record<string, unknown> }>;
};

/**
 * Flat, UI-ready option for a reference list (users, sellers).
 */
export type ReferenceOption = {
  id: CrmRecordId;
  name: string;
};

/**
 * An existing activity whose time span overlaps a booking being made.
 *
 * Times are the Swedish wall-clock values the seller recognizes, converted back
 * from the UTC that Pipedrive stores — showing the raw stored time would report
 * a clash an hour or two away from where the seller sees it in the calendar.
 */
export type MeetingOverlap = {
  id: CrmRecordId;
  subject: string;
  /** `YYYY-MM-DD`, Swedish local date. */
  date: string;
  /** `HH:MM`, Swedish local start time. */
  time: string;
  /** `HH:MM`, Swedish local end time. */
  endTime: string;
  personName?: string;
  organizationName?: string;
  /** Set when the clash involves the same contact or organization as the booking. */
  sameContact?: boolean;
};

/** Flat, UI-ready search hit. One shape for every record type. */
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
