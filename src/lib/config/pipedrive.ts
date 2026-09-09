import { getEnv } from "@/lib/config/env";

/**
 * The custom deal fields the portal writes, mirrored from the client's
 * Pipedrive (`GET /dealFields`). Leads inherit deal custom fields, so the same
 * keys are written on a prospect and follow it into the deal it becomes.
 *
 * Contract terms (bindningstid, månadskostnad, startavgift, …) have no field in
 * the account and live in the contract document instead. Mapping them here
 * would block prospect creation on keys that can never be supplied.
 */
export type PipedriveCustomFieldMappings = {
  fakturaStart?: string;
  fakturagrupp?: string;
  viktigastForKunden?: string;
  /**
   * "Affärens säljare" — an enum of the four sellers, verified against
   * `GET /dealFields` (2026-08-26). The sellers are options on this field, not
   * Pipedrive user accounts, so a record's `owner_id` cannot represent them.
   * This is also the field that assigns a record to a seller for the status
   * page; an administrator changes it in Pipedrive, never the portal.
   */
  affarensSaljare?: string;
  /**
   * "Underlag" — the evidence a prospect carries for quality control: audio
   * uploaded, or where the contract is in signing. Written by the portal only
   * for actions that have completed; "Avtal signerat" is set by a person.
   */
  underlag?: string;
  /**
   * "Ursprunglig säljare" — the seller who created the prospect. Written once
   * and never updated, so reassigning "Affärens säljare" keeps the origin.
   */
  ursprungligSaljare?: string;
};

export type PipedriveCustomFieldName = keyof PipedriveCustomFieldMappings;

/**
 * Custom *organization* fields, verified against `GET /organizationFields`
 * (2026-08-17). The account stores both of these as custom fields rather than
 * Pipedrive's built-ins:
 *
 *  - Org. Nummer holds organisationsnummer or personnummer. There is no native
 *    Pipedrive field for it.
 *  - Webbplats is a custom field even though a native `website` exists. Every
 *    organization in the account uses the custom one and none uses the native
 *    field, so writing to `website` would put the value where nobody looks.
 *
 * Unlike the deal fields these are optional: an unconfigured key skips that
 * field rather than failing the request, so booking a meeting keeps working in
 * an account that has not mapped them.
 */
export type PipedriveOrganizationFieldMappings = {
  organizationNumber?: string;
  website?: string;
};

export type PipedriveRuntimeConfig = {
  apiToken?: string;
  apiBaseUrl: string;
  apiV2BaseUrl: string;
  schedulerUrl?: string;
  defaultPipelineId?: string;
  defaultStageId?: string;
  defaultCurrency: string;
  /** Owner of new prospects. Unset lets Pipedrive default to the token's user. */
  leadOwnerUserId?: number;
  /** The technicians whose calendars define a free slot. Empty means every user. */
  technicianUserIds: number[];
  customFields: PipedriveCustomFieldMappings;
  organizationFields: PipedriveOrganizationFieldMappings;
};

/**
 * Custom-field keys are account-specific hashes, readable from `GET /dealFields`.
 * Anything listed here is written to the prospect, so a missing key must fail
 * the request rather than be silently dropped from the payload.
 */
export const REQUIRED_CUSTOM_FIELDS: PipedriveCustomFieldName[] = [
  "fakturaStart",
  "fakturagrupp",
  "viktigastForKunden",
  "affarensSaljare",
  "underlag",
  "ursprungligSaljare"
];

/** `FOO=` in a .env file means "not configured", not "configured as empty". */
function readKey(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** `12` → 12; anything else → undefined. Ids in `.env` are text. */
function readUserId(value: string | undefined): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const id = Number(trimmed);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

/** `"12, 15"` → [12, 15]. Blank and malformed entries are dropped. */
function readUserIdList(value: string | undefined): number[] {
  return (value ?? "")
    .split(",")
    .map((part) => readUserId(part))
    .filter((id): id is number => id !== undefined);
}

export function getPipedriveConfig(): PipedriveRuntimeConfig {
  const env = getEnv();

  return {
    apiToken: env.PIPEDRIVE_API_TOKEN,
    apiBaseUrl: env.PIPEDRIVE_API_BASE_URL,
    apiV2BaseUrl: env.PIPEDRIVE_API_V2_BASE_URL,
    schedulerUrl: env.PIPEDRIVE_SCHEDULER_URL,
    defaultPipelineId: env.PIPEDRIVE_DEFAULT_PIPELINE_ID,
    defaultStageId: env.PIPEDRIVE_DEFAULT_STAGE_ID,
    defaultCurrency: env.PIPEDRIVE_DEFAULT_CURRENCY,
    leadOwnerUserId: readUserId(env.PIPEDRIVE_LEAD_OWNER_USER_ID),
    technicianUserIds: readUserIdList(env.PIPEDRIVE_TECHNICIAN_USER_IDS),
    customFields: {
      fakturaStart: readKey(process.env.PIPEDRIVE_FIELD_FAKTURA_START),
      fakturagrupp: readKey(process.env.PIPEDRIVE_FIELD_FAKTURAGRUPP),
      viktigastForKunden: readKey(process.env.PIPEDRIVE_FIELD_VIKTIGAST_FOR_KUNDEN),
      affarensSaljare: readKey(process.env.PIPEDRIVE_FIELD_AFFARENS_SALJARE),
      underlag: readKey(process.env.PIPEDRIVE_FIELD_UNDERLAG),
      ursprungligSaljare: readKey(process.env.PIPEDRIVE_FIELD_URSPRUNGLIG_SALJARE)
    },
    organizationFields: {
      organizationNumber: readKey(process.env.PIPEDRIVE_FIELD_ORG_NUMBER),
      website: readKey(process.env.PIPEDRIVE_FIELD_ORG_WEBSITE)
    }
  };
}

/**
 * A deployment problem, not a user mistake. Kept distinct so routes can return
 * an actionable message instead of a generic 500 — these are the errors an
 * operator has to see to fix the setup.
 */
export class ConfigurationError extends Error {
  readonly status = 503;

  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export function assertPipedriveToken(config = getPipedriveConfig()): string {
  if (!config.apiToken) {
    throw new ConfigurationError("Pipedrive-token saknas i serverkonfigurationen (PIPEDRIVE_API_TOKEN).");
  }

  return config.apiToken;
}

/** Returns the names of required custom fields that have no API key configured. */
export function getMissingCustomFields(config = getPipedriveConfig()): PipedriveCustomFieldName[] {
  return REQUIRED_CUSTOM_FIELDS.filter((name) => !config.customFields[name]);
}

export function assertCustomFieldMappings(config = getPipedriveConfig()) {
  const missing = getMissingCustomFields(config);

  if (missing.length > 0) {
    throw new ConfigurationError(
      `Prospektet skapades inte: custom field-nycklar saknas i serverkonfigurationen (${missing.join(", ")}). ` +
        "Utan dem skulle värdena tappas bort. Kontakta administratören."
    );
  }
}
