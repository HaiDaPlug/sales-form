import type { ZodError } from "zod";
import type { MediacleaningStepData, PersonRef } from "@/lib/crm/types";
import type { FieldConflict } from "@/components/sales-wizard/LookupBox";
import type { SearchHit } from "@/lib/pipedrive/types";

export function formatZodErrors(error: ZodError) {
  return error.issues.map((issue) => `${issue.path.join(".") || "form"}: ${issue.message}`);
}

export function toggleDocumentType(
  data: MediacleaningStepData,
  onChange: (value: MediacleaningStepData) => void,
  documentType: NonNullable<MediacleaningStepData["documentTypes"]>[number],
  checked: boolean
) {
  const current = data.documentTypes ?? [];
  const documentTypes = checked ? [...current, documentType] : current.filter((item) => item !== documentType);

  onChange({ ...data, documentTypes });
}

/**
 * Compares what the seller typed against the record they just linked (S06).
 *
 * Only fields the seller actually filled in are compared — a blank field is not
 * a disagreement, it is simply unknown. Phone numbers are compared ignoring
 * spaces, hyphens and a leading +46/0, so the same number written two ways does
 * not raise a false conflict.
 */
export function findPersonConflicts(entered: PersonRef, hit: SearchHit): FieldConflict[] {
  const conflicts: FieldConflict[] = [];

  if (entered.phone && hit.phone && !samePhone(entered.phone, hit.phone)) {
    conflicts.push({
      field: "phone",
      label: "Telefonnummer",
      enteredValue: entered.phone,
      existingValue: hit.phone
    });
  }

  if (entered.email && hit.email && entered.email.trim().toLowerCase() !== hit.email.trim().toLowerCase()) {
    conflicts.push({
      field: "email",
      label: "E-post",
      enteredValue: entered.email,
      existingValue: hit.email
    });
  }

  return conflicts;
}

/** `+46 70-123 45 67`, `070-1234567` and `0701234567` are the same number. */
function samePhone(left: string, right: string): boolean {
  return normalizePhone(left) === normalizePhone(right);
}

function normalizePhone(value: string): string {
  const digits = value.replace(/[^\d+]/g, "");
  return digits.replace(/^\+46/, "0").replace(/^0046/, "0");
}

/** Triggers a browser download for a document streamed back by an API route. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

/** Pipedrive returns the created record with a numeric `id`. */
export function readRecordId(data: unknown): string | number | undefined {
  if (typeof data !== "object" || data === null) return undefined;

  const id = (data as { id?: unknown }).id;
  return typeof id === "string" || typeof id === "number" ? id : undefined;
}
