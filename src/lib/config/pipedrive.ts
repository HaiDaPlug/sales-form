import { getEnv } from "@/lib/config/env";

/**
 * Mirrors the custom deal fields that actually exist in the client's Pipedrive,
 * verified against `GET /dealFields` (2026-08-12). The account has five custom
 * deal fields; these three are the ones the wizard writes to.
 *
 * Contract terms (bindningstid, månadskostnad, avtalslängd, startavgift,
 * uppsägningstid, totalt affärsvärde, avtalsstartdatum) were previously mapped
 * here, but no such fields exist in the account — they live in the contract
 * document instead. Mapping them meant deal creation blocked on keys that could
 * never be supplied.
 */
export type PipedriveCustomFieldMappings = {
  fakturaStart?: string;
  fakturagrupp?: string;
  viktigastForKunden?: string;
};

export type PipedriveCustomFieldName = keyof PipedriveCustomFieldMappings;

export type PipedriveRuntimeConfig = {
  apiToken?: string;
  apiBaseUrl: string;
  schedulerUrl?: string;
  defaultPipelineId?: string;
  defaultStageId?: string;
  defaultCurrency: string;
  customFields: PipedriveCustomFieldMappings;
};

/**
 * Custom-field keys are account-specific hashes, readable from `GET /dealFields`.
 * Anything listed here is written to the deal, so a missing key must fail the
 * request rather than be silently dropped from the payload.
 */
export const REQUIRED_CUSTOM_FIELDS: PipedriveCustomFieldName[] = [
  "fakturaStart",
  "fakturagrupp",
  "viktigastForKunden"
];

/** `FOO=` in a .env file means "not configured", not "configured as empty". */
function readKey(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getPipedriveConfig(): PipedriveRuntimeConfig {
  const env = getEnv();

  return {
    apiToken: env.PIPEDRIVE_API_TOKEN,
    apiBaseUrl: env.PIPEDRIVE_API_BASE_URL,
    schedulerUrl: env.PIPEDRIVE_SCHEDULER_URL,
    defaultPipelineId: env.PIPEDRIVE_DEFAULT_PIPELINE_ID,
    defaultStageId: env.PIPEDRIVE_DEFAULT_STAGE_ID,
    defaultCurrency: env.PIPEDRIVE_DEFAULT_CURRENCY,
    customFields: {
      fakturaStart: readKey(process.env.PIPEDRIVE_FIELD_FAKTURA_START),
      fakturagrupp: readKey(process.env.PIPEDRIVE_FIELD_FAKTURAGRUPP),
      viktigastForKunden: readKey(process.env.PIPEDRIVE_FIELD_VIKTIGAST_FOR_KUNDEN)
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
      `Affären skapades inte: custom field-nycklar saknas i serverkonfigurationen (${missing.join(", ")}). ` +
        "Utan dem skulle avtalsvärdena tappas bort. Kontakta administratören."
    );
  }
}
