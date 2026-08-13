import type { ZodError } from "zod";
import type { MediacleaningStepData } from "@/lib/crm/types";

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
