import type { CrmRecordId } from "@/lib/crm/types";
import { PipedriveApiError } from "@/lib/pipedrive/client";
import {
  assertDealBelongsToOrganization,
  buildOrganizationPayload,
  createNote,
  createOrganization,
  uploadFile,
  type OrganizationDetails
} from "@/lib/pipedrive/service";
import type { GeneratedDocument } from "@/lib/pdf/service";

/**
 * Where a generated document and its note belong in Pipedrive.
 *
 * The file always goes to the **organization**: the client sends contracts and
 * cancellations as Smart Docs from the customer's own page, so that is where
 * the document has to be findable. The note goes to the record the work belongs
 * to — the prospect, an existing deal, or failing both the organization — so
 * the internal comment sits with the sale rather than the company.
 */
export type NoteTarget =
  | { kind: "lead"; leadId: string }
  | { kind: "deal"; dealId: CrmRecordId }
  | { kind: "organization"; organizationId: CrmRecordId };

export type AttachmentInput = {
  leadId?: string;
  dealId?: CrmRecordId;
  organizationId?: CrmRecordId;
  /**
   * Customer details used when an organization has to be created first (S17).
   * Carries the identity number and city so a customer registered from
   * Mediacleaning is stored as completely as one created from the prospect step.
   */
  createOrganizationFrom?: OrganizationDetails;
};

export type AttachmentResult = {
  /** The organization the file was uploaded to, once one is known. */
  organizationId?: CrmRecordId;
  noteTarget?: NoteTarget;
  /** Set when this call created the organization rather than reusing one. */
  createdOrganizationId?: CrmRecordId;
  fileId?: CrmRecordId;
  noteId?: CrmRecordId;
  /** Populated when the document was made but could not be attached. */
  warning?: string;
};

/**
 * Resolves the organization the document is filed under, creating it when the
 * seller asked for one and none exists yet.
 *
 * A deal given alongside it is verified to belong to that organization before
 * anything is written, so a note cannot land on another customer's sale.
 */
export async function resolveAttachmentTarget(input: AttachmentInput): Promise<{
  organizationId?: CrmRecordId;
  noteTarget?: NoteTarget;
  createdOrganizationId?: CrmRecordId;
}> {
  let organizationId = blankToUndefined(input.organizationId);
  const dealId = blankToUndefined(input.dealId);
  const leadId = typeof input.leadId === "string" && input.leadId.trim() !== "" ? input.leadId : undefined;

  if (dealId && organizationId) {
    await assertDealBelongsToOrganization(dealId, organizationId);
  }

  let createdOrganizationId: CrmRecordId | undefined;

  // No organization yet, but the seller asked to create one (S17).
  if (!organizationId && input.createOrganizationFrom?.name) {
    const created = await createOrganization(buildOrganizationPayload(input.createOrganizationFrom));

    const id = readId(created);

    if (!id) {
      throw new PipedriveApiError("Pipedrive returnerade inget organisations-ID.", 502);
    }

    organizationId = id;
    createdOrganizationId = id;
  }

  // The prospect first: a new sale's internal comment belongs with the sale.
  const noteTarget: NoteTarget | undefined = leadId
    ? { kind: "lead", leadId }
    : dealId
      ? { kind: "deal", dealId }
      : organizationId
        ? { kind: "organization", organizationId }
        : undefined;

  return { organizationId, noteTarget, createdOrganizationId };
}

/**
 * Uploads the document to the organization and writes its note.
 *
 * Attachment failures are returned as a `warning` rather than thrown: the
 * document has already been generated at this point, and the seller must still
 * receive it. The caller streams the file back regardless.
 */
export async function attachDocument(
  input: AttachmentInput & { document: GeneratedDocument; noteContent: string }
): Promise<AttachmentResult> {
  let organizationId: CrmRecordId | undefined;
  let noteTarget: NoteTarget | undefined;
  let createdOrganizationId: CrmRecordId | undefined;

  try {
    const resolved = await resolveAttachmentTarget(input);
    organizationId = resolved.organizationId;
    noteTarget = resolved.noteTarget;
    createdOrganizationId = resolved.createdOrganizationId;
  } catch (error) {
    return { warning: describeFailure(error) };
  }

  if (!organizationId) {
    return {
      noteTarget,
      createdOrganizationId,
      warning: "Dokumentet kopplades inte i Pipedrive — ingen organisation var vald."
    };
  }

  // Upload and note are two calls and cannot be made atomic. They are reported
  // separately so the outcome is diagnosable — "file uploaded, note failed" is
  // a different problem from "nothing was attached".
  //
  // This does NOT make a retry safe: nothing consumes `fileId` to resume, so
  // re-running the step uploads a second copy. Closing that needs real
  // idempotency, which is deliberately not built here.
  let fileId: CrmRecordId | undefined;

  try {
    fileId = readId(
      await uploadFile({
        file: input.document.blob,
        fileName: input.document.fileName,
        organizationId
      })
    );
  } catch (error) {
    return { organizationId, noteTarget, createdOrganizationId, warning: describeFailure(error) };
  }

  if (!noteTarget) {
    return { organizationId, createdOrganizationId, fileId };
  }

  try {
    const note = await createNote({
      content: input.noteContent,
      ...noteLink(noteTarget)
    });

    return { organizationId, noteTarget, createdOrganizationId, fileId, noteId: readId(note) };
  } catch (error) {
    return {
      organizationId,
      noteTarget,
      createdOrganizationId,
      fileId,
      warning: `Dokumentet laddades upp i Pipedrive men anteckningen kunde inte skapas: ${
        error instanceof Error ? error.message : String(error)
      }`
    };
  }
}

function noteLink(target: NoteTarget) {
  if (target.kind === "lead") return { lead_id: target.leadId };
  if (target.kind === "deal") return { deal_id: target.dealId };

  return { org_id: target.organizationId };
}

/**
 * Reports the attachment outcome alongside the streamed file.
 *
 * The body is the document, so the result has to travel in headers. Values are
 * ASCII-safe: header values cannot carry the Swedish characters a warning
 * message may contain.
 */
export function attachmentHeaders(result: AttachmentResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Attachment-Target": result.organizationId !== undefined ? "organization" : "none"
  };

  if (result.organizationId !== undefined) {
    headers["X-Attachment-Organization-Id"] = String(result.organizationId);
  }

  if (result.noteTarget) {
    headers["X-Attachment-Note-Target"] = result.noteTarget.kind;
  }

  if (result.createdOrganizationId !== undefined) {
    headers["X-Attachment-Created-Organization-Id"] = String(result.createdOrganizationId);
  }

  if (result.warning) {
    headers["X-Attachment-Warning"] = encodeURIComponent(result.warning);
  }

  return headers;
}

/** Empty strings arrive from untouched form fields; they are not IDs. */
function blankToUndefined(value: CrmRecordId | undefined): CrmRecordId | undefined {
  if (value === undefined) return undefined;

  const text = String(value).trim();
  return text === "" ? undefined : value;
}

function readId(record: unknown): CrmRecordId | undefined {
  if (typeof record !== "object" || record === null) return undefined;

  const id = (record as { id?: unknown }).id;
  return typeof id === "string" || typeof id === "number" ? id : undefined;
}

function describeFailure(error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return `Dokumentet skapades men kunde inte kopplas i Pipedrive: ${reason}`;
}
