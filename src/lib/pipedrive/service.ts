import { assertCustomFieldMappings, ConfigurationError, getPipedriveConfig } from "@/lib/config/pipedrive";
import type { CrmRecordId, SellerIdentity } from "@/lib/crm/types";
import type { MeetingStepInput, ProspectStepInput } from "@/lib/crm/schemas";
import { prospectTitle, UNDERLAG_LABELS, type PortalUpdatableUnderlag, type UnderlagStatus } from "@/lib/crm/prospect";
import {
  clockToMinutes,
  computeAvailableSlots,
  freeTechniciansAt,
  getSlotWindow,
  isWeekend,
  type AvailableSlot,
  type BusySpan
} from "@/lib/meetings/slots";
import { PipedriveApiError, pipedriveRequest } from "@/lib/pipedrive/client";
import type {
  MeetingOverlap,
  PipedriveActivityPayload,
  PipedriveFilePayload,
  PipedriveLeadPayload,
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

/** The customer details a document is filled in from, read back from Pipedrive. */
export type OrganizationProfile = {
  id: CrmRecordId;
  name: string;
  organizationNumber?: string;
  website?: string;
  address?: string;
  city?: string;
};

/**
 * One organization, in the shape the document steps fill their fields from.
 *
 * `address_locality` is Pipedrive's own parse of the address string and is
 * where the city ends up, since the account has no separate city field: the
 * portal writes "Storgatan 1, Stockholm" and reads the two back apart.
 */
export async function getOrganizationProfile(organizationId: CrmRecordId): Promise<OrganizationProfile> {
  const organization = await pipedriveRequest<AnyRecord>(`/organizations/${organizationId}`);
  const fields = getPipedriveConfig().organizationFields;
  const city = asString(organization?.address_locality);
  const fullAddress = asString(organization?.address);

  return {
    id: asRecordId(organization?.id) || organizationId,
    name: asString(organization?.name) ?? "Namnlös organisation",
    organizationNumber: fields.organizationNumber ? asString(organization?.[fields.organizationNumber]) : undefined,
    website: fields.website ? asString(organization?.[fields.website]) : undefined,
    // The city is dropped from the street address it was folded into, so the
    // two fields do not both show it.
    address: stripTrailingCity(fullAddress, city),
    city
  };
}

function stripTrailingCity(address: string | undefined, city: string | undefined): string | undefined {
  if (!address || !city) return address;

  const withoutCity = address.replace(new RegExp(`,?\\s*${escapeRegExp(city)}\\s*$`, "i"), "").trim();

  return withoutCity || address;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The people attached to an organization, to choose a signatory from. */
export async function getOrganizationPersons(organizationId: CrmRecordId): Promise<SearchHit[]> {
  const persons = await pipedriveRequest<AnyRecord[]>(`/organizations/${organizationId}/persons`);

  return (persons ?? []).map((person) => {
    const email = firstString(person.email);
    const phone = firstString(person.phone);

    return {
      id: asRecordId(person.id),
      name: asString(person.name) ?? "Namnlös person",
      detail: [email, phone].filter(Boolean).join(" · ") || undefined,
      email,
      phone,
      organizationId
    };
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
 * prospect form, and the strongest deduplication key the scenarios have — was
 * never stored at all.
 *
 * An unmapped custom field is skipped rather than fatal. These keys are
 * account-specific, and a deployment that has not configured them must still
 * be able to book meetings.
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

/* -----------------------------------------------------------------------------
   Deals — read-only. Mediacleaning may attach to an existing deal; nothing here
   creates one, and nothing ever will: that is the back-office's act in Pipedrive.
   -------------------------------------------------------------------------- */

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

/* -----------------------------------------------------------------------------
   Leads — the portal's prospects.
   -------------------------------------------------------------------------- */

export async function createLead(payload: PipedriveLeadPayload) {
  return pipedriveRequest<AnyRecord>("/leads", {
    method: "POST",
    body: payload
  });
}

/** One lead, with the custom fields the account has set on it. */
export async function getLead(leadId: string) {
  return pipedriveRequest<AnyRecord>(`/leads/${encodeURIComponent(leadId)}`);
}

/** Pipedrive pages at 500; a seller's own book is far smaller than that. */
const LIST_PAGE_SIZE = 500;
const MAX_PAGES = 10;

/**
 * The account's leads, in one listing.
 *
 * `archived_status` does nothing here. Verified against the account: every
 * value — "archived", "not_archived", "all", omitted — returns exactly the
 * same rows, and an archived lead is in none of them. So the endpoint returns
 * the active leads and nothing else, whatever it is asked for.
 *
 * Two consequences, both deliberate. Asking twice and concatenating (once for
 * each state) listed every prospect twice, which is why this takes no argument
 * now. And an archived lead cannot be listed at all: a prospect that has been
 * converted or shelved drops off the seller's status page instead of showing
 * its outcome. Reading each lead by id would find it — the record is intact
 * and still carries `is_archived` — but there is no listing to enumerate them
 * from, so that needs a different source, not a different query.
 */
export async function listLeads(): Promise<AnyRecord[]> {
  const collected: AnyRecord[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await pipedriveRequest<AnyRecord[]>("/leads", {
      query: {
        limit: LIST_PAGE_SIZE,
        start: page * LIST_PAGE_SIZE
      }
    });

    if (!batch || batch.length === 0) break;

    collected.push(...batch);

    if (batch.length < LIST_PAGE_SIZE) break;
  }

  return collected;
}

/**
 * Every deal, with `source_lead_id` so a converted prospect can be matched to
 * the deal it became. That field only exists on the v2 API and only when it is
 * asked for by name.
 */
export async function listDealsWithSourceLead(): Promise<AnyRecord[]> {
  const deals = await pipedriveRequest<AnyRecord[]>("/deals", {
    version: "v2",
    query: { include_fields: "source_lead_id", limit: LIST_PAGE_SIZE }
  });

  // One page. v2 pages by an opaque cursor that this client's response
  // unwrapping discards, and 500 deals is well past what one seller's status
  // page shows; a larger account needs the cursor plumbed through first.
  return deals ?? [];
}

/**
 * Prospect search, for linking documents to an existing prospect. Only the v2
 * API searches leads, hence the version switch.
 */
export async function searchLeads(term: string, organizationId?: CrmRecordId): Promise<SearchHit[]> {
  const envelope = await pipedriveRequest<PipedriveSearchEnvelope>("/leads/search", {
    version: "v2",
    query: { term, organization_id: organizationId, limit: MAX_SEARCH_RESULTS }
  });

  return readSearchItems(envelope).map((item) => {
    const organization = asRecord(item.organization);
    const person = asRecord(item.person);
    const detail = [organization ? asString(organization.name) : undefined, person ? asString(person.name) : undefined]
      .filter(Boolean)
      .join(" · ");

    return {
      id: asRecordId(item.id),
      name: asString(item.title) ?? "Namnlöst prospekt",
      detail: detail || undefined,
      organizationId: organization ? asRecordId(organization.id) : undefined,
      organizationName: organization ? asString(organization.name) : undefined
    };
  });
}

/**
 * Advances a prospect's "Underlag" after a portal action has completed.
 *
 * The only update the portal ever makes to an existing record, and the type
 * of `status` is what limits it: "Ljudfil uppladdad" is the one value that
 * follows from something the portal itself did. "Väntar på signering" and
 * "Avtal signerat" describe things that happen in Pipedrive, so a person
 * records them there.
 */
export async function setLeadUnderlag(leadId: string, status: PortalUpdatableUnderlag) {
  const config = getPipedriveConfig();
  const fieldKey = config.customFields.underlag;

  if (!fieldKey) {
    throw new ConfigurationError("Fältet Underlag är inte mappat (PIPEDRIVE_FIELD_UNDERLAG).");
  }

  const optionId = await resolveEnumOptionId(fieldKey, "Underlag", UNDERLAG_LABELS[status]);

  return pipedriveRequest<AnyRecord>(`/leads/${encodeURIComponent(leadId)}`, {
    method: "PATCH",
    body: { [fieldKey]: optionId }
  });
}

/**
 * Reads the "Underlag" value off a lead or deal record and names it. Returns
 * undefined when the field is unmapped, unset, or holds an option this code
 * does not know — the status page shows "okänt" rather than guessing.
 */
export async function readUnderlagStatus(record: AnyRecord): Promise<UnderlagStatus | undefined> {
  const fieldKey = getPipedriveConfig().customFields.underlag;
  if (!fieldKey) return undefined;

  const raw = record[fieldKey];
  if (raw === undefined || raw === null || raw === "") return undefined;

  const label = await resolveEnumOptionLabel(fieldKey, asRecordId(raw));
  if (!label) return undefined;

  return (Object.keys(UNDERLAG_LABELS) as UnderlagStatus[]).find((status) =>
    sameLabel(UNDERLAG_LABELS[status], label)
  );
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
 * Uploads a document or recording, attached to the records given.
 *
 * Called server-side rather than through a route: the file is produced or
 * fetched in the same request, so it never has to cross an HTTP boundary as
 * JSON — which is what made the former passthrough route impossible (a Blob
 * does not survive JSON.stringify).
 */
export async function uploadFile(payload: PipedriveFilePayload) {
  const formData = new FormData();
  formData.set("file", payload.file, payload.fileName);

  if (payload.leadId) formData.set("lead_id", payload.leadId);
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

/* -----------------------------------------------------------------------------
   Enum custom fields.

   Pipedrive stores an enum value as the numeric option id, never the label, and
   each field has its own option ids — "Ursprunglig säljare" and "Affärens
   säljare" list the same four names under different ids. Everything that writes
   or reads one of these fields goes through the label so the account, not the
   code, is the source of truth for the ids.
   -------------------------------------------------------------------------- */

export type EnumOption = { id: CrmRecordId; label: string };

/**
 * `/dealFields` describes every field and is fetched for each label lookup a
 * prospect needs. Caching it briefly keeps one prospect at one request; the
 * short life means an option renamed in Pipedrive shows up without a redeploy.
 */
const DEAL_FIELDS_TTL_MS = 5 * 60 * 1000;

let dealFieldsCache: { fetchedAt: number; fields: AnyRecord[] } | undefined;

async function readDealFields(): Promise<AnyRecord[]> {
  if (dealFieldsCache && Date.now() - dealFieldsCache.fetchedAt < DEAL_FIELDS_TTL_MS) {
    return dealFieldsCache.fields;
  }

  const fields = (await pipedriveRequest<AnyRecord[]>("/dealFields")) ?? [];
  dealFieldsCache = { fetchedAt: Date.now(), fields };

  return fields;
}

/** Test seam, and the way a changed field is picked up before the TTL ends. */
export function resetDealFieldsCache() {
  dealFieldsCache = undefined;
}

export async function getEnumOptions(fieldKey: string): Promise<EnumOption[]> {
  const fields = await readDealFields();
  const field = fields.find((candidate) => candidate.key === fieldKey);
  const options = Array.isArray(field?.options) ? field.options : [];

  return options.flatMap((option) => {
    const record = asRecord(option);
    const label = asString(record?.label);
    const id = record?.id;

    return label && (typeof id === "number" || typeof id === "string") ? [{ id, label }] : [];
  });
}

/** Throws a configuration error naming the option an administrator has to add. */
export async function resolveEnumOptionId(fieldKey: string, fieldName: string, label: string): Promise<CrmRecordId> {
  const match = (await getEnumOptions(fieldKey)).find((option) => sameLabel(option.label, label));

  if (!match) {
    throw new ConfigurationError(
      `Fältet "${fieldName}" i Pipedrive saknar alternativet "${label}". Lägg till det i Pipedrive och försök igen.`
    );
  }

  return match.id;
}

export async function resolveEnumOptionLabel(fieldKey: string, optionId: CrmRecordId): Promise<string | undefined> {
  return (await getEnumOptions(fieldKey)).find((option) => String(option.id) === String(optionId))?.label;
}

function sameLabel(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase("sv") === right.trim().toLocaleLowerCase("sv");
}

/**
 * The sellers a prospect can be assigned to.
 *
 * These are the options of the "Affärens säljare" custom deal field, not
 * Pipedrive user accounts — the four sellers have no login of their own, so
 * `/users` does not and will never list them. Reading the options live means
 * editing them in Pipedrive updates the portal without a redeploy.
 *
 * Returns an empty list when the field key is unconfigured or the field has
 * since been deleted.
 */
export async function getSellers(): Promise<ReferenceOption[]> {
  const fieldKey = getPipedriveConfig().customFields.affarensSaljare;
  if (!fieldKey) return [];

  return (await getEnumOptions(fieldKey)).map((option) => ({ id: option.id, name: option.label }));
}

/**
 * The invoicing groups a prospect can be placed in.
 *
 * The options of the "Fakturagrupp" custom deal field, read live for the same
 * reason as the sellers: the labels carry the account's own wording, and an
 * administrator adding a group must reach the form without a redeploy. The
 * seller picks a label; `buildLeadPayload` turns it back into the option id
 * Pipedrive requires.
 *
 * Returns an empty list when the field key is unconfigured or the field has
 * since been deleted, which makes the form fall back to free text.
 */
export async function getInvoiceGroups(): Promise<ReferenceOption[]> {
  const fieldKey = getPipedriveConfig().customFields.fakturagrupp;
  if (!fieldKey) return [];

  return (await getEnumOptions(fieldKey)).map((option) => ({ id: option.id, name: option.label }));
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

/* -----------------------------------------------------------------------------
   Meeting times.
   -------------------------------------------------------------------------- */

const STOCKHOLM_TIME_ZONE = "Europe/Stockholm";

const stockholmDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: STOCKHOLM_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit"
});

/**
 * Pipedrive stores an activity's bare `due_date`/`due_time` as UTC and its
 * calendar localizes them for the viewer. The wizard captures Swedish wall
 * time, so convert it at this boundary; a fixed offset would be wrong across
 * daylight-saving changes and around midnight.
 */
function stockholmMeetingTimeAsUtc(date: string, time: string): { date: string; time: string } {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const requestedWallTime = Date.UTC(year, month - 1, day, hour, minute);
  let instant = requestedWallTime;

  // Reconcile the candidate instant with how Stockholm renders it. A second
  // pass handles the offset change on DST transition dates without hardcoding
  // either CET or CEST.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = stockholmDateTimeParts(instant);
    const renderedWallTime = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    const adjustment = requestedWallTime - renderedWallTime;

    if (adjustment === 0) return utcDateTimeParts(instant);
    instant += adjustment;
  }

  // This can only occur for a local clock time skipped by the spring DST jump.
  throw new Error(`Klockslaget ${date} ${time} finns inte i tidszonen ${STOCKHOLM_TIME_ZONE}.`);
}

function stockholmDateTimeParts(instant: number) {
  const parts = Object.fromEntries(
    stockholmDateTimeFormatter
      .formatToParts(new Date(instant))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute
  };
}

function utcDateTimeParts(instant: number): { date: string; time: string } {
  const value = new Date(instant);
  const year = String(value.getUTCFullYear()).padStart(4, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  const hour = String(value.getUTCHours()).padStart(2, "0");
  const minute = String(value.getUTCMinutes()).padStart(2, "0");

  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
}

/** `01:30` → 90. Pipedrive returns an activity's duration as `HH:MM`. */
function durationToMinutes(value: unknown): number {
  const text = asString(value);
  if (!text) return 0;

  const [hours, minutes] = text.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;

  return hours * 60 + minutes;
}

/**
 * Minutes from the epoch for a stored `due_date`/`due_time` pair.
 *
 * Activities are stored in UTC — the same convention
 * `buildMeetingActivityPayload` writes them in — so stored times are already on
 * a common timeline and are compared directly.
 */
function storedTimeMinutes(date: string, time: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  return Date.UTC(year, month - 1, day, hour, minute) / 60000;
}

/** A stored UTC `due_date`/`due_time` back to the Swedish wall time sellers read. */
function storedTimeAsStockholm(date: string, time: string): { date: string; time: string } {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const parts = stockholmDateTimeParts(Date.UTC(year, month - 1, day, hour, minute));
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");

  return {
    date: `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`,
    time: `${pad(parts.hour)}:${pad(parts.minute)}`
  };
}

/**
 * Existing activities whose time overlaps the proposed booking.
 *
 * The booking is converted to UTC first, exactly as
 * `buildMeetingActivityPayload` does before creating an activity, so both sides
 * of the comparison are in the form Pipedrive stores. Comparing the seller's
 * raw wall-clock time against stored times would be wrong by the Stockholm
 * offset and would miss every real clash.
 *
 * Two constraints of the activities endpoint are load-bearing here:
 *  - `end_date` is exclusive, so a same-day range returns nothing. The query
 *    spans the day after the meeting.
 *  - It defaults to the token user's own activities, so `user_id=0` is required
 *    to see bookings made by colleagues — the duplicates worth catching.
 *
 * Undated to-dos (no `due_time`) have no span and are skipped; treating them as
 * midnight would warn on every booking that shares their date.
 */
export async function findMeetingOverlaps(data: {
  date: string;
  time: string;
  durationMinutes: number;
  personId?: CrmRecordId;
  organizationId?: CrmRecordId;
}): Promise<MeetingOverlap[]> {
  const start = stockholmMeetingTimeAsUtc(data.date, data.time);
  const startsAt = storedTimeMinutes(start.date, start.time);
  const endsAt = startsAt + data.durationMinutes;

  // A day either side covers a booking whose UTC date differs from its Swedish
  // one and absorbs the exclusive `end_date`; the filter below does the real work.
  const activities = await pipedriveRequest<AnyRecord[]>("/activities", {
    query: {
      user_id: 0,
      start_date: shiftDate(start.date, -1),
      end_date: shiftDate(start.date, 2),
      limit: 100
    }
  });

  return (activities ?? [])
    .flatMap((activity) => {
      const dueDate = asString(activity.due_date);
      const dueTime = asString(activity.due_time);

      // Undated to-dos and cancelled activities cannot clash with anything.
      if (!dueDate || !dueTime || activity.active_flag === false) return [];

      const otherStart = storedTimeMinutes(dueDate, dueTime);
      // A zero-length activity still occupies its start minute, so treat it as
      // one minute rather than letting it silently never overlap.
      const otherEnd = otherStart + (durationToMinutes(activity.duration) || 1);

      // Touching edges are not a clash: a meeting ending at 10:00 and the next
      // starting at 10:00 is a back-to-back booking, which sellers do on purpose.
      if (otherStart >= endsAt || otherEnd <= startsAt) return [];

      // Reported in Swedish time so the warning matches the seller's calendar.
      const localStart = storedTimeAsStockholm(dueDate, dueTime);
      const storedEnd = utcDateTimeParts(otherEnd * 60000);
      const localEnd = storedTimeAsStockholm(storedEnd.date, storedEnd.time);
      const person = asRecord(activity.person_id);
      const organization = asRecord(activity.org_id);
      const personId = person ? asRecordId(person.id) : asRecordId(activity.person_id);
      const organizationId = organization ? asRecordId(organization.id) : asRecordId(activity.org_id);

      return [
        {
          id: asRecordId(activity.id),
          subject: asString(activity.subject) ?? "Namnlös aktivitet",
          date: localStart.date,
          time: localStart.time,
          endTime: localEnd.time,
          personName: person ? asString(person.name) : undefined,
          organizationName: organization ? asString(organization.name) : undefined,
          sameContact:
            (data.personId !== undefined && String(personId) === String(data.personId)) ||
            (data.organizationId !== undefined && String(organizationId) === String(data.organizationId))
        }
      ];
    })
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
}

/** `YYYY-MM-DD` shifted by whole days, for building the query window. */
function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));

  return utcDateTimeParts(shifted.getTime()).date;
}

/**
 * The technicians' bookings on a date, as minute spans in Swedish local time.
 *
 * Activities are stored in UTC, so a Swedish day spills into two UTC dates; the
 * query spans a day either side and each activity is converted back before it
 * is measured. Undated to-dos have no span and cannot block a slot.
 *
 * `user_id=0` asks for every user's activities. Without a configured technician
 * pool that is exactly right — any booking blocks the slot — and with one, the
 * spans are filtered down to those technicians.
 */
export async function findBusySpans(date: string, technicianIds: number[]): Promise<BusySpan[]> {
  const activities = await pipedriveRequest<AnyRecord[]>("/activities", {
    query: {
      user_id: 0,
      start_date: shiftDate(date, -1),
      end_date: shiftDate(date, 2),
      limit: 200
    }
  });

  const pool = technicianIds.length > 0 ? technicianIds : [0];

  return (activities ?? []).flatMap((activity) => {
    const dueDate = asString(activity.due_date);
    const dueTime = asString(activity.due_time);

    if (!dueDate || !dueTime || activity.active_flag === false) return [];

    const local = storedTimeAsStockholm(dueDate, dueTime);
    if (local.date !== date) return [];

    // With no pool configured every booking blocks the single anonymous
    // resource; with one, an activity owned by somebody else is irrelevant.
    const ownerId = Number(activity.user_id ?? activity.owner_id);
    const userId = technicianIds.length === 0 ? 0 : ownerId;

    if (!pool.includes(userId)) return [];

    const startMinutes = clockToMinutes(local.time);
    // A zero-length activity still occupies its start minute.
    const duration = durationToMinutes(activity.duration) || 1;

    return [{ userId, startMinutes, endMinutes: startMinutes + duration }];
  });
}

/** The bookable times on a date, and who could take each one. */
export async function findAvailableSlots(date: string, now = new Date()): Promise<AvailableSlot[]> {
  if (isWeekend(date)) return [];

  const window = getSlotWindow();
  const technicianIds = getPipedriveConfig().technicianUserIds;
  const busy = await findBusySpans(date, technicianIds);

  return computeAvailableSlots({
    window,
    technicianIds,
    busy,
    nowMinutes: isToday(date, now) ? stockholmMinutesOfDay(now) : undefined
  });
}

/** True when `date` is the current Swedish calendar date. */
function isToday(date: string, now: Date): boolean {
  const parts = stockholmDateTimeParts(now.getTime());
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");

  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}` === date;
}

function stockholmMinutesOfDay(now: Date): number {
  const parts = stockholmDateTimeParts(now.getTime());
  return parts.hour * 60 + parts.minute;
}

/**
 * The technician who will own a booking, re-checked at submit time.
 *
 * Returns undefined when the slot has been taken since the seller chose it —
 * the booking is then refused rather than double-booked. With no configured
 * pool the anonymous resource resolves to no owner, and the activity stays with
 * the API token's user as before.
 */
export async function resolveSlotTechnician(
  date: string,
  time: string,
  durationMinutes: number,
  now = new Date()
): Promise<{ available: boolean; technicianId?: number }> {
  if (isWeekend(date)) return { available: false };

  const window = getSlotWindow();
  const technicianIds = getPipedriveConfig().technicianUserIds;
  const startMinutes = clockToMinutes(time);

  if (isToday(date, now) && startMinutes < stockholmMinutesOfDay(now) + window.minLeadMinutes) {
    return { available: false };
  }

  const busy = await findBusySpans(date, technicianIds);
  const pool = technicianIds.length > 0 ? technicianIds : [0];
  const free = freeTechniciansAt(startMinutes, durationMinutes, pool, busy);

  if (free.length === 0) return { available: false };

  return { available: true, technicianId: technicianIds.length > 0 ? free[0] : undefined };
}

/** The slot a seller chose was taken before they submitted. */
export class SlotUnavailableError extends Error {
  readonly status = 409;

  constructor() {
    super("Tiden är inte längre ledig. Välj en annan tid.");
    this.name = "SlotUnavailableError";
  }
}

export function buildMeetingActivityPayload(
  data: MeetingStepInput,
  parties: ResolvedMeetingParties,
  seller: SellerIdentity,
  technicianId?: number
): PipedriveActivityPayload {
  const pipedriveTime = stockholmMeetingTimeAsUtc(data.date, data.time);
  const note = [
    // The seller leads the note because it is the only place an activity can
    // show them: they are options on a custom deal field rather than Pipedrive
    // users, so `user_id` cannot name them and no custom activity field exists.
    `Säljare: ${seller.name}`,
    data.agenda,
    data.technicianNotes ? `IT-tekniker: ${data.technicianNotes}` : "",
    data.internalComment ? `Internt: ${data.internalComment}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    // A blank meeting type would read "Möte: " on the activity.
    subject: data.meetingType ? `Möte: ${data.meetingType}` : "Möte",
    type: "meeting",
    due_date: pipedriveTime.date,
    due_time: pipedriveTime.time,
    duration: minutesToPipedriveDuration(data.durationMinutes),
    // Resolved IDs are passed in rather than read from `data`, so the payload
    // cannot be built with the undefined form IDs that previously left every
    // new contact's meeting orphaned.
    person_id: parties.personId,
    org_id: parties.organizationId,
    // The technician who has the slot free owns the meeting, so it lands in
    // their calendar. Never the seller: they are a custom-field option, not a
    // user account, and sending an option id here was rejected as an unknown
    // user — which is why the seller is named in the note instead. With no
    // technician pool configured the activity stays with the token's user.
    user_id: technicianId,
    // Blank rather than absent would write an empty note and location onto the
    // activity; location is optional.
    location: data.locationOrLink || undefined,
    note: note || undefined
  };
}

/* -----------------------------------------------------------------------------
   Parties — the person and organization a record is attached to.
   -------------------------------------------------------------------------- */

export type ResolvedProspectParties = {
  personId: CrmRecordId;
  organizationId: CrmRecordId;
  createdPerson: boolean;
  createdOrganization: boolean;
  personLinkedToOrganization: boolean;
};

/**
 * A meeting's contact and, when the seller supplied one, its organization.
 *
 * `organizationId` is optional here and required on a prospect: a meeting may
 * be booked from contact details alone (S01), while a prospect always belongs
 * to a customer record.
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

  // Same protection as the prospect path: reassigning an existing contact to a
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

/** Existing CRM records are read-only from this application. */
export class ExistingRecordProtectionError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "ExistingRecordProtectionError";
  }
}

/**
 * Guarantees a prospect is attached to a real person and organization.
 *
 * Selected records are reused; anything without an ID is created first, then
 * the person is linked to the organization. Without this the lead payload
 * would send `person_id: undefined` for a new contact and the prospect would
 * be orphaned from its customer.
 *
 * Organization first: the person is created already carrying `org_id`, which
 * avoids a follow-up link call in the common "both are new" path.
 */
export async function resolveProspectParties(data: ProspectStepInput): Promise<ResolvedProspectParties> {
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
 * The lead a prospect becomes.
 *
 * `parties` carries the IDs guaranteed by `resolveProspectParties`; they are
 * passed in rather than read from `data` so the payload cannot be built with
 * undefined form IDs. `seller` comes from the session: it is written to
 * "Affärens säljare" (the assignment an administrator may later change) and
 * to "Ursprunglig säljare" (which nobody changes).
 */
export async function buildLeadPayload(
  data: ProspectStepInput,
  parties: ResolvedProspectParties,
  seller: SellerIdentity
): Promise<PipedriveLeadPayload> {
  const config = getPipedriveConfig();

  // Every custom field below is load-bearing for QC or assignment. A missing
  // key would drop the value silently, so refuse to build the payload at all.
  assertCustomFieldMappings(config);

  const fields = config.customFields as Required<typeof config.customFields>;

  const payload: PipedriveLeadPayload = {
    title: prospectTitle(data.organization.name),
    person_id: parties.personId,
    organization_id: parties.organizationId
  };

  // The owner is a Pipedrive user — the back-office inbox — never the seller,
  // who has no user account. Left out, Pipedrive assigns the token's user.
  if (config.leadOwnerUserId !== undefined) payload.owner_id = config.leadOwnerUserId;

  if (data.value > 0) {
    payload.value = { amount: data.value, currency: data.currency ?? config.defaultCurrency };
  }

  payload[fields.viktigastForKunden] = data.viktigastForKunden;
  payload[fields.fakturaStart] = data.fakturaAvtalStart;
  payload[fields.affarensSaljare] = seller.optionId;

  // "Fakturagrupp" is a single-option field: Pipedrive rejects the label and
  // wants the option id. The form sends what the seller saw, so the label is
  // resolved here rather than stored, which keeps the account's own wording
  // (and its irregular spacing) authoritative.
  payload[fields.fakturagrupp] = await resolveEnumOptionId(
    fields.fakturagrupp,
    "Fakturagrupp",
    data.fakturagrupp
  );

  // "Ursprunglig säljare" has its own option ids for the same four names, so
  // the session's option is mapped through its label rather than copied.
  const sellerLabel = (await resolveEnumOptionLabel(fields.affarensSaljare, seller.optionId)) ?? seller.name;
  payload[fields.ursprungligSaljare] = await resolveEnumOptionId(
    fields.ursprungligSaljare,
    "Ursprunglig säljare",
    sellerLabel
  );

  // Audio starts with no status at all: "Ljudfil uppladdad" is written only
  // once Pipedrive has the file. A signature sale is a known state from the
  // moment it exists.
  if (data.evidenceMethod === "signature") {
    payload[fields.underlag] = await resolveEnumOptionId(
      fields.underlag,
      "Underlag",
      UNDERLAG_LABELS.signatureRequired
    );
  }

  return payload;
}

/**
 * Asks the back-office to send a generated contract for signature.
 *
 * The sellers have no Pipedrive login and Smart Docs has no public API, so the
 * portal cannot send the document itself. It uploads the PDF to the customer's
 * organization and leaves this task for the person who can: they send it, then
 * set the prospect's status. The portal never writes "Väntar på signering" —
 * claiming a document had been sent when nobody had sent it would be worse
 * than leaving the status behind.
 */
export async function requestSignatureTask(input: {
  organizationId: CrmRecordId;
  leadId?: string;
  companyName: string;
  fileName: string;
  seller: SellerIdentity;
}) {
  const config = getPipedriveConfig();
  const today = new Date().toISOString().slice(0, 10);

  return createActivity({
    subject: `Skicka avtal för signering: ${input.companyName}`,
    type: "task",
    due_date: today,
    org_id: input.organizationId,
    lead_id: input.leadId,
    user_id: config.leadOwnerUserId,
    note: [
      `Avtalet ${input.fileName} är uppladdat på organisationen och ska skickas för signering med smart doc.`,
      `Säljare: ${input.seller.name}`,
      "När avtalet är skickat: sätt Underlag till \"Väntar på signering\" på prospektet.",
      "När kunden har signerat: sätt Underlag till \"Avtal signerat\" och kvalitetskontrollera försäljningen."
    ].join("\n")
  });
}

/**
 * The commercial terms that have no Pipedrive field, written as a note on the
 * prospect so the person doing quality control sees them next to the evidence.
 */
export function buildProspectNote(data: ProspectStepInput, seller: SellerIdentity): string {
  const currency = data.currency ?? "SEK";
  const money = (amount: number | undefined) =>
    amount === undefined ? undefined : `${new Intl.NumberFormat("sv-SE").format(amount)} ${currency}`;
  const months = (count: number | undefined) => (count === undefined ? undefined : `${count} månader`);

  const lines: Array<[string, string | undefined]> = [
    ["Säljare", seller.name],
    ["Underlag", data.evidenceMethod === "audio" ? "Ljudfil (kvalitetskontroll)" : "Digital signering"],
    ["Faktura/avtal start", data.fakturaAvtalStart],
    ["Fakturagrupp", data.fakturagrupp],
    ["Avtalslängd", months(data.contractLengthMonths)],
    ["Bindningstid", months(data.bindingPeriodMonths)],
    ["Månadskostnad", money(data.monthlyCost)],
    ["Startavgift", money(data.startFee)],
    ["Totalt affärsvärde", money(data.totalDealValue)],
    ["Viktigast för kunden", data.viktigastForKunden]
  ];

  return [
    "Prospekt skapat via säljportalen",
    ...lines.filter(([, value]) => value !== undefined && value !== "").map(([label, value]) => `${label}: ${value}`)
  ].join("\n");
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

function minutesToPipedriveDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
