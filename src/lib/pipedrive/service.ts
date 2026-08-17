import { assertCustomFieldMappings, getPipedriveConfig } from "@/lib/config/pipedrive";
import type { CrmRecordId } from "@/lib/crm/types";
import type { DealStepInput, MeetingStepInput } from "@/lib/crm/schemas";
import { PipedriveApiError, pipedriveRequest } from "@/lib/pipedrive/client";
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

/**
 * Organization search, including the identity number.
 *
 * `custom_fields` is what makes an organisationsnummer or personnummer findable
 * — the identity the acceptance scenarios lean on hardest for deduplication.
 * Searching `name,address` alone returns nothing for an org number, because it
 * is a custom field in this account rather than a native one. Verified against
 * the live account: a known org number returns one hit with `custom_fields`
 * included and zero without it.
 */
export async function searchOrganizations(term: string): Promise<SearchHit[]> {
  const envelope = await pipedriveRequest<PipedriveSearchEnvelope>("/organizations/search", {
    query: { term, fields: "name,address,custom_fields", limit: MAX_SEARCH_RESULTS }
  });

  const { organizationNumber: organizationNumberKey } = getPipedriveConfig().organizationFields;

  return readSearchItems(envelope).map((item) => {
    const address = asString(item.address);
    const organizationNumber = organizationNumberKey ? asString(item[organizationNumberKey]) : undefined;

    return {
      id: asRecordId(item.id),
      name: asString(item.name) ?? "Namnlös organisation",
      // Shown under the name so the seller can tell apart two records with
      // similar names — the identity number is the thing that distinguishes
      // them.
      detail: [organizationNumber, address].filter(Boolean).join(" · ") || undefined,
      address,
      organizationNumber
    };
  });
}

export async function createOrganization(payload: PipedriveOrganizationPayload) {
  return pipedriveRequest<AnyRecord>("/organizations", {
    method: "POST",
    body: payload
  });
}

/** The customer details an organization is created from, in any workflow. */
export type OrganizationDetails = {
  name: string;
  address?: string;
  /** Appended to the address: the account has no editable city field. */
  city?: string;
  website?: string;
  /** Organisationsnummer or personnummer, already normalized by the schema. */
  organizationNumber?: string;
};

/**
 * Builds the organization payload, including the account's custom fields.
 *
 * Every creation path goes through this, so identity cannot reach Pipedrive
 * from one workflow and be dropped by another. Previously each caller passed
 * `{ name, address }` inline and the organisationsnummer — mandatory on the
 * deal form, and the strongest deduplication key the scenarios have — was
 * never stored at all.
 *
 * An unmapped custom field is skipped rather than fatal. These keys are
 * account-specific, and a deployment that has not configured them must still
 * be able to book meetings and create deals.
 */
export function buildOrganizationPayload(details: OrganizationDetails): PipedriveOrganizationPayload {
  const fields = getPipedriveConfig().organizationFields;

  const payload: PipedriveOrganizationPayload = {
    name: details.name,
    // Pipedrive resolves one address string into its own components, so the
    // city is folded in rather than sent separately — `address_locality` is
    // derived and read-only.
    address: joinAddress(details.address, details.city)
  };

  assignOrganizationField(payload, fields.organizationNumber, details.organizationNumber);
  assignOrganizationField(payload, fields.website, details.website);

  return payload;
}

/** Keeps "Storgatan 1" and "Stockholm" from becoming "Storgatan 1, " or ", Stockholm". */
function joinAddress(address?: string, city?: string): string | undefined {
  return [address?.trim(), city?.trim()].filter(Boolean).join(", ") || undefined;
}

function assignOrganizationField(
  payload: PipedriveOrganizationPayload,
  fieldKey: string | undefined,
  value: string | undefined
) {
  if (fieldKey && value !== undefined && value.trim() !== "") {
    payload[fieldKey] = value.trim();
  }
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

/** Reads one deal, used to confirm which organization it belongs to. */
export async function getDeal(dealId: CrmRecordId) {
  return pipedriveRequest<AnyRecord>(`/deals/${dealId}`);
}

/**
 * Confirms a deal belongs to the organization the seller selected.
 *
 * A document attached to the wrong customer's deal is a data-protection
 * problem, not just a mistake, so the pairing is verified server-side before
 * anything is uploaded rather than trusted from the form.
 */
export async function assertDealBelongsToOrganization(dealId: CrmRecordId, organizationId: CrmRecordId) {
  const deal = await getDeal(dealId);
  const dealOrganizationId = readOrganizationId(deal);

  if (dealOrganizationId === undefined) {
    throw new DealOwnershipError("Den valda affären saknar kopplad organisation.");
  }

  if (String(dealOrganizationId) !== String(organizationId)) {
    throw new DealOwnershipError(
      "Den valda affären tillhör en annan organisation. Välj en affär som hör till kunden."
    );
  }
}

/** A deal/organization pairing that does not exist in Pipedrive. */
export class DealOwnershipError extends Error {
  readonly status = 422;

  constructor(message: string) {
    super(message);
    this.name = "DealOwnershipError";
  }
}

/** `org_id` is a bare id on some payloads and a nested object on others. */
function readOrganizationId(deal: AnyRecord | null | undefined): CrmRecordId | undefined {
  const orgId = deal?.org_id;

  if (typeof orgId === "string" || typeof orgId === "number") return orgId;

  return readId(asRecord(orgId));
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
 * Uploads a generated document, attached to a deal or an organization.
 *
 * Called server-side by `attachDocument` rather than through a route: the file
 * is produced in the same request, so it never has to cross an HTTP boundary as
 * JSON — which is what made the former passthrough route impossible (a Blob
 * does not survive JSON.stringify).
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

/**
 * The stage a deal lands in when the seller picked a pipeline but no stage.
 *
 * Resolves the pipeline's own first stage rather than falling back to a global
 * default, which would drop the deal into an unrelated pipeline's stage. Returns
 * `undefined` if the pipeline has no stages, letting Pipedrive apply its own
 * default rather than failing the deal over a cosmetic field.
 */
export async function resolveFirstStageId(pipelineId: CrmRecordId): Promise<CrmRecordId | undefined> {
  const stages = await getStages(pipelineId);

  // `getStages` already orders by `order_nr` within a pipeline.
  return stages.find((stage) => String(stage.pipelineId) === String(pipelineId))?.id ?? stages[0]?.id;
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

export function buildMeetingActivityPayload(
  data: MeetingStepInput,
  parties: ResolvedMeetingParties
): PipedriveActivityPayload {
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
    // Resolved IDs are passed in rather than read from `data`, so the payload
    // cannot be built with the undefined form IDs that previously left every
    // new contact's meeting orphaned.
    person_id: parties.personId,
    org_id: parties.organizationId,
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
  personLinkedToOrganization: boolean;
};

/**
 * A meeting's contact and, when the seller supplied one, its organization.
 *
 * `organizationId` is optional here and required on a deal: a meeting may be
 * booked from contact details alone (S01), while a deal always belongs to a
 * customer record.
 */
export type ResolvedMeetingParties = {
  personId: CrmRecordId;
  organizationId?: CrmRecordId;
  createdPerson: boolean;
  createdOrganization: boolean;
};

/**
 * Guarantees a meeting activity is attached to a real contact.
 *
 * The activity payload previously sent whatever IDs the form happened to hold,
 * so booking a meeting for a new contact produced an activity attached to
 * nobody. The contact is now always resolved — reused when selected, created
 * otherwise.
 *
 * The organization is only created when the seller actually named one. A
 * meeting must remain bookable with no customer record at all, so an absent
 * organization is a valid outcome rather than something to fill in.
 */
export async function resolveMeetingParties(data: MeetingStepInput): Promise<ResolvedMeetingParties> {
  const organizationName = data.organization?.name?.trim();

  // Same protection as the deal path: reassigning an existing contact to a
  // different organization is an edit to a record this app does not own.
  if (
    data.person.id &&
    data.person.organizationId &&
    data.organization?.id &&
    String(data.person.organizationId) !== String(data.organization.id)
  ) {
    throw new ExistingRecordProtectionError(
      "Den befintliga kontakten tillhör en annan organisation i Pipedrive. Välj kontaktens organisation eller skapa en ny kontakt; appen ändrar inte befintliga CRM-poster."
    );
  }

  let organizationId = data.organization?.id;
  let createdOrganization = false;

  if (!organizationId && organizationName) {
    const organization = await createOrganization(
      buildOrganizationPayload({
        name: organizationName,
        address: data.organization?.address,
        city: data.organization?.city,
        website: data.organization?.website,
        organizationNumber: data.organization?.organizationNumber
      })
    );

    organizationId = readId(organization);
    createdOrganization = true;

    if (!organizationId) {
      throw new Error("Pipedrive returnerade inget organisations-ID.");
    }
  }

  let personId = data.person.id;
  let createdPerson = false;

  if (!personId) {
    try {
      // Organization first, so a new contact is created already carrying `org_id`
      // and needs no follow-up link call.
      const person = await createPerson({
        name: data.person.name,
        email: data.person.email ? [{ value: data.person.email, primary: true }] : undefined,
        phone: data.person.phone ? [{ value: data.person.phone, primary: true }] : undefined,
        org_id: organizationId
      });

      personId = readId(person);

      if (!personId) {
        throw new Error("Pipedrive returnerade inget person-ID.");
      }

      createdPerson = true;
    } catch (error) {
      // An organization created moments ago must not be orphaned by this
      // failure — it travels with the error so a retry reuses it.
      throw new PartialResolutionError(error, { organizationId });
    }
  }

  return { personId, organizationId, createdPerson, createdOrganization };
}

/** Existing CRM records are read-only from this application. */
/** Records created before a resolution failed, so a retry can reuse them. */
export type PartialParties = {
  personId?: CrmRecordId;
  organizationId?: CrmRecordId;
};

/**
 * A resolution that failed after it had already created something.
 *
 * Without this the created IDs were lost: the assignment in the caller never
 * happens when the function throws, so an organization created just before a
 * failing person creation became invisible — and the retry created a second
 * one. The partial result travels with the error instead.
 */
export class PartialResolutionError extends Error {
  readonly status: number;
  readonly parties: PartialParties;
  readonly cause: unknown;

  constructor(cause: unknown, parties: PartialParties) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "PartialResolutionError";
    this.parties = parties;
    this.cause = cause;
    this.status = cause instanceof PipedriveApiError ? cause.status : 500;
  }
}

export class ExistingRecordProtectionError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "ExistingRecordProtectionError";
  }
}

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
  // Refuse before creating anything. Reassigning an existing contact would be
  // a broad edit to a CRM record the app does not own.
  if (
    data.person.id &&
    data.person.organizationId &&
    (!data.organization.id || String(data.person.organizationId) !== String(data.organization.id))
  ) {
    throw new ExistingRecordProtectionError(
      "Den befintliga kontakten tillhör en annan organisation i Pipedrive. Välj kontaktens organisation eller skapa en ny kontakt; appen ändrar inte befintliga CRM-poster."
    );
  }

  let organizationId = data.organization.id;
  let createdOrganization = false;

  if (!organizationId) {
    const organization = await createOrganization(
      buildOrganizationPayload({
        name: data.organization.name,
        address: data.organization.address,
        city: data.organization.city,
        website: data.organization.website,
        organizationNumber: data.organization.organizationNumber
      })
    );

    organizationId = readId(organization);
    createdOrganization = true;

    if (!organizationId) {
      throw new Error("Pipedrive returnerade inget organisations-ID.");
    }
  }

  let personId = data.person.id;
  let createdPerson = false;
  let personLinkedToOrganization =
    Boolean(personId && data.person.organizationId) &&
    String(data.person.organizationId) === String(organizationId);

  if (!personId) {
    try {
      const person = await createPerson({
        name: data.person.name,
        email: data.person.email ? [{ value: data.person.email, primary: true }] : undefined,
        phone: data.person.phone ? [{ value: data.person.phone, primary: true }] : undefined,
        org_id: organizationId
      });

      personId = readId(person);

      if (!personId) {
        throw new Error("Pipedrive returnerade inget person-ID.");
      }

      createdPerson = true;
      personLinkedToOrganization = true;
    } catch (error) {
      // The organization exists even though the person failed. Carrying its ID
      // out with the error is what stops a retry creating a second one.
      throw new PartialResolutionError(error, { organizationId });
    }
  }

  return { personId, organizationId, createdPerson, createdOrganization, personLinkedToOrganization };
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
export async function buildDealPayload(
  data: DealStepInput,
  parties: ResolvedDealParties
): Promise<PipedriveDealPayload> {
  const config = getPipedriveConfig();

  // Commercial terms live in custom fields. A missing key would drop them
  // silently, so refuse to build the payload at all.
  assertCustomFieldMappings(config);

  const customFields = config.customFields;
  const pipelineId = data.deal.pipelineId ?? config.defaultPipelineId;

  // With a pipeline chosen but no stage, the deal goes to that pipeline's first
  // stage. A stage from the configured default could belong to another pipeline.
  const stageId = data.deal.stageId ?? (pipelineId ? await resolveFirstStageId(pipelineId) : config.defaultStageId);

  const payload: PipedriveDealPayload = {
    title: data.deal.title,
    person_id: parties.personId,
    org_id: parties.organizationId,
    user_id: data.sellerId,
    value: data.deal.value,
    currency: data.deal.currency ?? config.defaultCurrency,
    pipeline_id: pipelineId,
    stage_id: stageId
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
