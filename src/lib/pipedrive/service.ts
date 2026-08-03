import { getPipedriveConfig } from "@/lib/config/pipedrive";
import type { CrmRecordId } from "@/lib/crm/types";
import type { DealStepInput, MeetingStepInput } from "@/lib/crm/schemas";
import { pipedriveRequest } from "@/lib/pipedrive/client";
import type {
  PipedriveActivityPayload,
  PipedriveDealPayload,
  PipedriveFilePayload,
  PipedriveNotePayload,
  PipedriveOrganizationPayload,
  PipedrivePersonPayload
} from "@/lib/pipedrive/types";

type AnyRecord = Record<string, unknown>;

export async function searchPersons(term: string) {
  return pipedriveRequest<AnyRecord[]>("/persons/search", {
    query: { term, fields: "name,email,phone" }
  });
}

export async function createPerson(payload: PipedrivePersonPayload) {
  return pipedriveRequest<AnyRecord>("/persons", {
    method: "POST",
    body: payload
  });
}

export async function updatePerson(id: CrmRecordId, payload: Partial<PipedrivePersonPayload>) {
  return pipedriveRequest<AnyRecord>(`/persons/${id}`, {
    method: "PUT",
    body: payload
  });
}

export async function searchOrganizations(term: string) {
  return pipedriveRequest<AnyRecord[]>("/organizations/search", {
    query: { term, fields: "name,address" }
  });
}

export async function createOrganization(payload: PipedriveOrganizationPayload) {
  return pipedriveRequest<AnyRecord>("/organizations", {
    method: "POST",
    body: payload
  });
}

export async function updateOrganization(id: CrmRecordId, payload: Partial<PipedriveOrganizationPayload>) {
  return pipedriveRequest<AnyRecord>(`/organizations/${id}`, {
    method: "PUT",
    body: payload
  });
}

export async function linkPersonToOrganization(personId: CrmRecordId, organizationId: CrmRecordId) {
  return updatePerson(personId, { org_id: organizationId } as Partial<PipedrivePersonPayload>);
}

export async function searchDeals(term: string, personId?: CrmRecordId, organizationId?: CrmRecordId) {
  return pipedriveRequest<AnyRecord[]>("/deals/search", {
    query: {
      term,
      person_id: personId,
      org_id: organizationId
    }
  });
}

export async function createDeal(payload: PipedriveDealPayload) {
  return pipedriveRequest<AnyRecord>("/deals", {
    method: "POST",
    body: payload
  });
}

export async function createActivity(payload: PipedriveActivityPayload) {
  return pipedriveRequest<AnyRecord>("/activities", {
    method: "POST",
    body: payload
  });
}

export async function createNote(payload: PipedriveNotePayload) {
  return pipedriveRequest<AnyRecord>("/notes", {
    method: "POST",
    body: payload
  });
}

export async function uploadFile(payload: PipedriveFilePayload) {
  const formData = new FormData();
  formData.set("file", payload.file, payload.fileName);

  if (payload.dealId) formData.set("deal_id", String(payload.dealId));
  if (payload.personId) formData.set("person_id", String(payload.personId));
  if (payload.organizationId) formData.set("org_id", String(payload.organizationId));
  if (payload.activityId) formData.set("activity_id", String(payload.activityId));

  return pipedriveRequest<AnyRecord>("/files", {
    method: "POST",
    formData
  });
}

export async function getUsers() {
  return pipedriveRequest<AnyRecord[]>("/users");
}

export async function getPipelines() {
  return pipedriveRequest<AnyRecord[]>("/pipelines");
}

export async function getStages(pipelineId?: CrmRecordId) {
  return pipedriveRequest<AnyRecord[]>("/stages", {
    query: { pipeline_id: pipelineId }
  });
}

export function getCustomFieldMappings() {
  return getPipedriveConfig().customFields;
}

export async function getDealFields() {
  return pipedriveRequest<AnyRecord[]>("/dealFields");
}

export async function getPersonFields() {
  return pipedriveRequest<AnyRecord[]>("/personFields");
}

export async function getOrganizationFields() {
  return pipedriveRequest<AnyRecord[]>("/organizationFields");
}

export function buildMeetingActivityPayload(data: MeetingStepInput): PipedriveActivityPayload {
  const note = [
    data.agenda,
    data.technicianNotes ? `IT-tekniker: ${data.technicianNotes}` : "",
    data.internalComment ? `Internt: ${data.internalComment}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    subject: `Möte: ${data.meetingType}`,
    type: "meeting",
    due_date: data.date,
    due_time: data.time,
    duration: minutesToPipedriveDuration(data.durationMinutes),
    person_id: data.person.id,
    org_id: data.organization?.id,
    user_id: data.sellerId,
    location: data.locationOrLink,
    note
  };
}

export function buildDealPayload(data: DealStepInput): PipedriveDealPayload {
  const config = getPipedriveConfig();
  const customFields = config.customFields;
  const payload: PipedriveDealPayload = {
    title: data.deal.title,
    person_id: data.person.id,
    org_id: data.organization.id,
    user_id: data.sellerId,
    value: data.deal.value,
    currency: data.deal.currency ?? config.defaultCurrency,
    pipeline_id: data.deal.pipelineId ?? config.defaultPipelineId,
    stage_id: data.deal.stageId ?? config.defaultStageId
  };

  assignCustomField(payload, customFields.viktigastForKunden, data.viktigastForKunden);
  assignCustomField(payload, customFields.fakturaStart, data.fakturaStart);
  assignCustomField(payload, customFields.fakturagrupp, data.fakturagrupp);
  assignCustomField(payload, customFields.avtalslangd, data.contractLengthMonths);
  assignCustomField(payload, customFields.avtalsStartdatum, data.contractStartDate);
  assignCustomField(payload, customFields.manadskostnad, data.monthlyCost);
  assignCustomField(payload, customFields.startavgift, data.startFee);
  assignCustomField(payload, customFields.bindningstid, data.bindingPeriodMonths);
  assignCustomField(payload, customFields.uppsagningstid, data.cancellationPeriodMonths);

  return payload;
}

function assignCustomField(payload: PipedriveDealPayload, fieldKey: string | undefined, value: unknown) {
  if (fieldKey && value !== undefined && value !== "") {
    payload[fieldKey] = value;
  }
}

function minutesToPipedriveDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
