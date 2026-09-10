import { ConfigurationError, getPipedriveConfig } from "@/lib/config/pipedrive";
import type { CrmRecordId, SellerIdentity } from "@/lib/crm/types";
import { createNote, getLead, setLeadUnderlag, uploadFile } from "@/lib/pipedrive/service";

type AnyRecord = Record<string, unknown>;

export type AudioAttachmentInput = {
  leadId: string;
  file: Blob;
  fileName: string;
  seller: SellerIdentity;
};

export type AudioAttachmentResult = {
  fileId?: CrmRecordId;
  organizationId?: CrmRecordId;
  leadTitle?: string;
  /** Set when the file and status are in place but the note could not be written. */
  warning?: string;
};

/** The prospect is assigned to another seller, or to nobody the session can act for. */
export class ProspectAccessError extends Error {
  readonly status = 403;

  constructor(message: string) {
    super(message);
    this.name = "ProspectAccessError";
  }
}

/**
 * The file reached Pipedrive but the status could not follow. Reported as its
 * own failure because the remedy differs: uploading again would attach a
 * second copy, so the seller must not retry blindly.
 */
export class AudioStatusError extends Error {
  readonly status = 502;
  readonly fileId?: CrmRecordId;

  constructor(cause: unknown, fileId?: CrmRecordId) {
    super(
      `Ljudfilen är uppladdad till prospektet, men statusen "Ljudfil uppladdad" kunde inte sättas: ${describe(cause)}. ` +
        "Ladda inte upp filen igen — be administratören sätta statusen i Pipedrive."
    );
    this.name = "AudioStatusError";
    this.fileId = fileId;
  }
}

/**
 * Confirms the prospect is assigned to the logged-in seller before anything is
 * attached to it. The check reads the *current* "Affärens säljare" value, so a
 * prospect an administrator has moved to a colleague is out of reach even for
 * the seller who created it.
 */
export async function assertProspectBelongsToSeller(leadId: string, seller: SellerIdentity): Promise<AnyRecord> {
  const sellerKey = getPipedriveConfig().customFields.affarensSaljare;

  if (!sellerKey) {
    throw new ConfigurationError("Fältet Affärens säljare är inte mappat (PIPEDRIVE_FIELD_AFFARENS_SALJARE).");
  }

  const lead = await getLead(leadId);
  const assigned = lead?.[sellerKey];

  if (assigned === undefined || assigned === null || String(assigned) !== String(seller.optionId)) {
    throw new ProspectAccessError("Prospektet är inte tilldelat dig i Pipedrive, så du kan inte lägga till underlag på det.");
  }

  return lead;
}

/**
 * Attaches a recording to a prospect and, only once Pipedrive has confirmed
 * the file, marks the prospect "Ljudfil uppladdad".
 *
 * Order is the point: the status is the portal's claim that evidence exists,
 * so it is written after the upload and never before. The note that follows is
 * a convenience for QC and its failure is a warning, not a reason to undo the
 * upload — which could not be undone anyway.
 */
export async function attachAudioToProspect(input: AudioAttachmentInput): Promise<AudioAttachmentResult> {
  const lead = await assertProspectBelongsToSeller(input.leadId, input.seller);
  const organizationId = readId(lead.organization_id);
  const leadTitle = typeof lead.title === "string" ? lead.title : undefined;

  const uploaded = await uploadFile({
    file: input.file,
    fileName: input.fileName,
    leadId: input.leadId,
    // The customer record too, so the recording is findable from the
    // organization after the lead has been converted or archived.
    organizationId
  });
  const fileId = readId(uploaded);

  try {
    await setLeadUnderlag(input.leadId, "audioUploaded");
  } catch (error) {
    throw new AudioStatusError(error, fileId);
  }

  let warning: string | undefined;

  try {
    await createNote({
      content: [
        "Ljudfil uppladdad som underlag för kvalitetskontroll",
        `Fil: ${input.fileName} (${formatFileSize(input.file.size)})`,
        `Uppladdad av: ${input.seller.name}`
      ].join("\n"),
      lead_id: input.leadId
    });
  } catch (error) {
    warning = `Ljudfilen är uppladdad och statusen satt, men anteckningen kunde inte skapas: ${describe(error)}`;
  }

  return { fileId, organizationId, leadTitle, warning };
}

function readId(value: unknown): CrmRecordId | undefined {
  if (typeof value === "string" || typeof value === "number") return value;

  const nested = typeof value === "object" && value !== null ? (value as AnyRecord).id : undefined;
  return typeof nested === "string" || typeof nested === "number" ? nested : undefined;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
