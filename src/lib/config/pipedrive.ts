export type PipedriveCustomFieldMappings = {
  fakturaStart?: string;
  fakturagrupp?: string;
  viktigastForKunden?: string;
  avtalslangd?: string;
  avtalsStartdatum?: string;
  manadskostnad?: string;
  startavgift?: string;
  bindningstid?: string;
  uppsagningstid?: string;
  betalningsintervall?: string;
};

export type PipedriveRuntimeConfig = {
  apiToken?: string;
  apiBaseUrl: string;
  defaultPipelineId?: string;
  defaultStageId?: string;
  defaultCurrency: string;
  customFields: PipedriveCustomFieldMappings;
};

export function getPipedriveConfig(): PipedriveRuntimeConfig {
  return {
    apiToken: process.env.PIPEDRIVE_API_TOKEN,
    apiBaseUrl: process.env.PIPEDRIVE_API_BASE_URL ?? "https://api.pipedrive.com/v1",
    defaultPipelineId: process.env.PIPEDRIVE_DEFAULT_PIPELINE_ID,
    defaultStageId: process.env.PIPEDRIVE_DEFAULT_STAGE_ID,
    defaultCurrency: process.env.PIPEDRIVE_DEFAULT_CURRENCY ?? "SEK",
    customFields: {
      fakturaStart: process.env.PIPEDRIVE_FIELD_FAKTURA_START,
      fakturagrupp: process.env.PIPEDRIVE_FIELD_FAKTURAGRUPP,
      viktigastForKunden: process.env.PIPEDRIVE_FIELD_VIKTIGAST_FOR_KUNDEN,
      avtalslangd: process.env.PIPEDRIVE_FIELD_AVTALSLANGD,
      avtalsStartdatum: process.env.PIPEDRIVE_FIELD_AVTALS_STARTDATUM,
      manadskostnad: process.env.PIPEDRIVE_FIELD_MANADSKOSTNAD,
      startavgift: process.env.PIPEDRIVE_FIELD_STARTAVGIFT,
      bindningstid: process.env.PIPEDRIVE_FIELD_BINDNINGSTID,
      uppsagningstid: process.env.PIPEDRIVE_FIELD_UPPSAGNINGSTID,
      betalningsintervall: process.env.PIPEDRIVE_FIELD_BETALNINGSINTERVALL
    }
  };
}

export function assertPipedriveToken(config = getPipedriveConfig()): string {
  if (!config.apiToken) {
    throw new Error("Missing PIPEDRIVE_API_TOKEN. Add it to .env.local.");
  }

  return config.apiToken;
}
