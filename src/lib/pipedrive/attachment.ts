import type { CrmRecordId } from "@/lib/crm/types";
import { PipedriveApiError } from "@/lib/pipedrive/client";
import {
  assertDealBelongsToOrganization,
  createNote,
  createOrganization,
  uploadFile
} from "@/lib/pipedrive/service";
import type { GeneratedDocument } from "@/lib/pdf/service";

/**
 * Where a generated document and its note belong in Pipedrive.
 *
 * The rule across every document scenario: attach to the deal when there is
 * one, otherwise to the organization. A document that reaches neither is still
 * delivered to the seller as a download — losing the file because the CRM was
 * unreachable would be worse than losing the CRM link.
 */
export type AttachmentTarget =
  | { kind: "deal"; dealId: CrmRecordId; organizationId?: CrmRecordId }
  | { kind: "organization"; organizationId: CrmRecordId }
  | { kind: "none" };

export type AttachmentInput = {
  dealId?: CrmRecordId;
  organizationId?: CrmRecordId;
  /** Customer details used when an organization has to be created first. */
  createOrganizationFrom?: { name: string; address?: string };
};

export type AttachmentResult = {
  target: AttachmentTarget;
  /** Set when this call created the organization rather than reusing one. */
  createdOrganizationId?: CrmRecordId;
  fileId?: CrmRecordId;
  noteId?: CrmRecordId;
  /** Populated when the document was made but could not be attached. */
  warning?: string;
};

/**
 * Resolves the attachment target, creating the organization if the seller asked
 * for one and none exists yet.
 *
 * When both a deal and an organization are given, the deal wins — but only
 * after confirming it actually belongs to that organization, so a document
 * cannot land on another customer's deal.
 */
export async function resolveAttachmentTarget(input: AttachmentInput): Promise<{
  target: AttachmentTarget;
  createdOrganizationId?: CrmRecordId;
}> {
  let organizationId = blankToUndefined(input.organizationId);

  if (input.dealId) {
    const dealId = blankToUndefined(input.dealId);

    if (dealId) {
      if (organizationId) {
        await assertDealBelongsToOrganization(dealId, organizationId);
      }

      return { target: { kind: "deal", dealId, organizationId } };
    }
  }

  let createdOrganizationId: CrmRecordId | undefined;

  // No organization yet, but the seller asked to create one (S17).
  if (!organizationId && input.createOrganizationFrom?.name) {
    const created = await createOrganization({
      name: input.createOrganizationFrom.name,
      address: input.createOrganizationFrom.address
    });

    const id = readId(created);

    if (!id) {
      throw new PipedriveApiError("Pipedrive returnerade inget organisations-ID.", 502);
    }

    organizationId = id;
    createdOrganizationId = id;
  }

  if (organizationId) {
    return { target: { kind: "organization", organizationId }, createdOrganizationId };
  }

  return { target: { kind: "none" }, createdOrganizationId };
}

/**
 * Uploads the document and writes its note.
 *
 * Attachment failures are returned as a `warning` rather than thrown: the
 * document has already been generated at this point, and the seller must still
 * receive it. The caller streams the file back regardless.
 */
export async function attachDocument(
  input: AttachmentInput & { document: GeneratedDocument; noteContent: string }
): Promise<AttachmentResult> {
  let target: AttachmentTarget = { kind: "none" };
  let createdOrganizationId: CrmRecordId | undefined;

  try {
    const resolved = await resolveAttachmentTarget(input);
    target = resolved.target;
    createdOrganizationId = resolved.createdOrganizationId;
  } catch (error) {
    return { target, warning: describeFailure(error) };
  }

  if (target.kind === "none") {
    return {
      target,
      createdOrganizationId,
      warning: "Dokumentet kopplades inte i Pipedrive — ingen affär eller organisation var vald."
    };
  }

  const link =
    target.kind === "deal"
      ? { dealId: target.dealId }
      : { organizationId: target.organizationId };

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
        ...link
      })
    );
  } catch (error) {
    return { target, createdOrganizationId, warning: describeFailure(error) };
  }

  try {
    const note = await createNote({
      content: input.noteContent,
      ...(target.kind === "deal" ? { deal_id: target.dealId } : { org_id: target.organizationId })
    });

    return { target, createdOrganizationId, fileId, noteId: readId(note) };
  } catch (error) {
    return {
      target,
      createdOrganizationId,
      fileId,
      warning: `Dokumentet laddades upp i Pipedrive men anteckningen kunde inte skapas: ${
        error instanceof Error ? error.message : String(error)
      }`
    };
  }
}

/**
 * Reports the attachment outcome alongside the streamed file.
 *
 * The body is the document, so the result has to travel in headers. Values are
 * ASCII-safe: header values cannot carry the Swedish characters a warning
 * message may contain.
 */
export function attachmentHeaders(result: AttachmentResult): Record<string, string> {
  const headers: Record<string, string> = { "X-Attachment-Target": result.target.kind };

  if (result.target.kind === "deal") {
    headers["X-Attachment-Deal-Id"] = String(result.target.dealId);
  } else if (result.target.kind === "organization") {
    headers["X-Attachment-Organization-Id"] = String(result.target.organizationId);
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
