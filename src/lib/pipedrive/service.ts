import { assertCustomFieldMappings, getPipedriveConfig } from "@/lib/config/pipedrive";
import type { CrmRecordId } from "@/lib/crm/types";
import type { DealStepInput, MeetingStepInput } from "@/lib/crm/schemas";
import { pipedriveRequest } from "@/lib/pipedrive/client";
import type {
  PipedriveActivityPayload,
  PipedriveDealPayload,
  PipedriveFilePayload,
  PipedriveNotePayload,
  PipedriveOrganizationPayload,
  PipedrivePersonPayload,
  PipedriveSearchEnvelope,
  ReferenceOption,
  SearchHit
} from "@/lib/pipedrive/types";

type AnyRecord = Record<string, unknown>;

/** Pipedrive rejects shorter terms with a 400. */
export const MIN_SEARCH_TERM_LENGTH = 2;

/**
 * Pipedrive defaults to 100 hits per search. That is far more than a seller can
 * scan, so the list is capped here and the UI tells them to narrow the term
 * rather than silently showing an arbitrary subset.
 */
export const MAX_SEARCH_RESULTS = 10;

export async function searchPersons(term: string): Promise<SearchHit[]> {
  const envelope = await pipedriveRequest<PipedriveSearchEnvelope>("/persons/search", {
    query: { term, fields: "name,email,phone", limit: MAX_SEARCH_RESULTS }
  });

  return readSearchItems(envelope).map((item) => {
    const email = firstString(item.emails) ?? asString(item.primary_email);
    const phone = firstString(item.phones);
    const organization = asRecord(item.organization);

    return {
      id: asRecordId(item.id),
      name: asString(item.name) ?? "Namnlös person",
      detail: [email, phone].filter(Boolean).join(" · ") || undefined,
      email,
      phone,
      organizationId: organization ? asRecordId(organization.id) : undefined,
      organizationName: organization ? asString(organization.name) : undefined
    };
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

export async function searchOrganizations(term: string): Promise<SearchHit[]> {
  const envelope = await pipedriveRequest<PipedriveSearchEnvelope>("/organizations/search", {
    query: { term, fields: "name,address", limit: MAX_SEARCH_RESULTS }
  });

  return readSearchItems(envelope).map((item) => {
    const address = asString(item.address);

    return {
      id: asRecordId(item.id),
      name: asString(item.name) ?? "Namnlös organisation",
      detail: address,
      address
    };
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

export async function searchDeals(
  term: string,
  personId?: CrmRecordId,
  organizationId?: CrmRecordId
): Promise<SearchHit[]> {
  const envelope = await pipedriveRequest<PipedriveSearchEnvelope>("/deals/search", {
    query: {
      term,
      person_id: personId,
      org_id: organizationId,
      limit: MAX_SEARCH_RESULTS
    }
  });

  return readSearchItems(envelope).map((item) => {
    const organization = asRecord(item.organization);
    const person = asRecord(item.person);
    const detail = [organization ? asString(organization.name) : undefined, person ? asString(person.name) : undefined]
      .filter(Boolean)
      .join(" · ");

    return {
      id: asRecordId(item.id),
      name: asString(item.title) ?? "Namnlös affär",
      detail: detail || undefined,
      organizationId: organization ? asRecordId(organization.id) : undefined,
      organizationName: organization ? asString(organization.name) : undefined
    };
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

/**
 * Not currently reachable over HTTP. The former JSON route could never work —
 * a Blob does not survive JSON.stringify — so it was removed. Wiring this up
 * needs a multipart/form-data route, which belongs with the real PDF work.
 */
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

/** Active users only — deactivated colleagues must not be assignable. */
export async function getUsers(): Promise<ReferenceOption[]> {
  const users = await pipedriveRequest<AnyRecord[]>("/users");

  const active = (users ?? []).filter((user) => user.active_flag !== false);

  // Accounts really do contain several users sharing a display name (e.g. two
  // "Digital Kontakt" service accounts). Appending the email makes them
  // distinguishable instead of offering identical-looking options.
  const nameCounts = new Map<string, number>();
  for (const user of active) {
    const name = asString(user.name) ?? "";
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }

  return active
    .map((user) => {
      const name = asString(user.name);
      const email = asString(user.email);
      const ambiguous = name !== undefined && (nameCounts.get(name) ?? 0) > 1;

      return {
        id: asRecordId(user.id),
        name: name ? (ambiguous && email ? `${name} (${email})` : name) : email ?? "Namnlös användare"
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "sv"));
}

export async function getPipelines(): Promise<ReferenceOption[]> {
  const pipelines = await pipedriveRequest<AnyRecord[]>("/pipelines");

  return (pipelines ?? [])
    .filter((pipeline) => pipeline.active !== false)
    .map((pipeline) => ({ id: asRecordId(pipeline.id), name: asString(pipeline.name) ?? "Namnlös pipeline" }));
}

/**
 * Stages keep their `pipelineId` so the UI can filter by the selected pipeline
 * without a second request, and are ordered by Pipedrive's own `order_nr`.
 */
export async function getStages(pipelineId?: CrmRecordId): Promise<ReferenceOption[]> {
  const stages = await pipedriveRequest<AnyRecord[]>("/stages", {
    query: { pipeline_id: pipelineId }
  });

  return (stages ?? [])
    .filter((stage) => stage.active_flag !== false)
    // `order_nr` restarts per pipeline, so group by pipeline before ordering —
    // a flat sort interleaves stages from different pipelines.
    .sort((a, b) => {
      const byPipeline = Number(a.pipeline_id ?? 0) - Number(b.pipeline_id ?? 0);
      return byPipeline !== 0 ? byPipeline : Number(a.order_nr ?? 0) - Number(b.order_nr ?? 0);
    })
    .map((stage) => ({
      id: asRecordId(stage.id),
      name: asString(stage.name) ?? "Namnlöst steg",
      pipelineId: asRecordId(stage.pipeline_id)
    }));
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

export type ResolvedDealParties = {
  personId: CrmRecordId;
  organizationId: CrmRecordId;
  createdPerson: boolean;
  createdOrganization: boolean;
};

/**
 * Guarantees a deal is attached to a real person and organization.
 *
 * Selected records are reused; anything without an ID is created first, then
 * the person is linked to the organization. Without this the deal payload sent
 * `person_id: undefined`, because nothing in the UI ever created a person —
 * every deal was orphaned from its contact and company.
 *
 * Organization first: the person is created already carrying `org_id`, which
 * avoids a follow-up link call in the common "both are new" path.
 */
export async function resolveDealParties(data: DealStepInput): Promise<ResolvedDealParties> {
  let organizationId = data.organization.id;
  let createdOrganization = false;

  if (!organizationId) {
    const organization = await createOrganization({
      name: data.organization.name,
      address: data.organization.address
    });

    organizationId = readId(organization);
    createdOrganization = true;

    if (!organizationId) {
      throw new Error("Pipedrive returnerade inget organisations-ID.");
    }
  }

  let personId = data.person.id;
  let createdPerson = false;

  if (!personId) {
    const person = await createPerson({
      name: data.person.name,
      email: data.person.email ? [{ value: data.person.email, primary: true }] : undefined,
      phone: data.person.phone ? [{ value: data.person.phone, primary: true }] : undefined,
      org_id: organizationId
    });

    personId = readId(person);
    createdPerson = true;

    if (!personId) {
      throw new Error("Pipedrive returnerade inget person-ID.");
    }
  } else if (!data.person.organizationId || data.person.organizationId !== organizationId) {
    // Existing person whose organization differs from the one on this deal.
    await linkPersonToOrganization(personId, organizationId);
  }

  return { personId, organizationId, createdPerson, createdOrganization };
}

function readId(record: AnyRecord | null | undefined): CrmRecordId | undefined {
  const id = record?.id;
  return typeof id === "string" || typeof id === "number" ? id : undefined;
}

/**
 * `parties` carries the IDs guaranteed by `resolveDealParties`. They are passed
 * in rather than read from `data`, so the payload cannot be built with the
 * undefined form IDs that previously orphaned every deal.
 */
export function buildDealPayload(data: DealStepInput, parties: ResolvedDealParties): PipedriveDealPayload {
  const config = getPipedriveConfig();

  // Commercial terms live in custom fields. A missing key would drop them
  // silently, so refuse to build the payload at all.
  assertCustomFieldMappings(config);

  const customFields = config.customFields;
  const payload: PipedriveDealPayload = {
    title: data.deal.title,
    person_id: parties.personId,
    org_id: parties.organizationId,
    user_id: data.sellerId,
    value: data.deal.value,
    currency: data.deal.currency ?? config.defaultCurrency,
    pipeline_id: data.deal.pipelineId ?? config.defaultPipelineId,
    stage_id: data.deal.stageId ?? config.defaultStageId
  };

  // Only the invoicing fields exist as custom fields in the account. The
  // contract terms the wizard also collects (bindningstid, månadskostnad,
  // startavgift, …) have no field to write to and belong to the contract
  // document — they are intentionally not sent here.
  assignCustomField(payload, customFields.viktigastForKunden, data.viktigastForKunden);
  assignCustomField(payload, customFields.fakturaStart, data.fakturaStart);
  assignCustomField(payload, customFields.fakturagrupp, data.fakturagrupp);

  return payload;
}

/* Search envelope parsing. Pipedrive's shapes are loosely typed, so every
   read is defensive — a missing or unexpected field must not throw. */

function readSearchItems(envelope: PipedriveSearchEnvelope | null | undefined): AnyRecord[] {
  if (!envelope?.items) return [];

  return envelope.items.flatMap((entry) => (entry?.item ? [entry.item] : []));
}

/** Trimmed: Pipedrive names arrive with stray whitespace (e.g. "Klar "). */
function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function asRecord(value: unknown): AnyRecord | undefined {
  return typeof value === "object" && value !== null ? (value as AnyRecord) : undefined;
}

function asRecordId(value: unknown): CrmRecordId {
  return typeof value === "string" || typeof value === "number" ? value : "";
}

/** Persons return `emails`/`phones` as plain string arrays. */
function firstString(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;

  for (const entry of value) {
    const found = asString(entry) ?? asString(asRecord(entry)?.value);
    if (found) return found;
  }

  return undefined;
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
