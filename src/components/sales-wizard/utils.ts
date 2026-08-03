import type { ZodError } from "zod";
import type { MediacleaningStepData } from "@/lib/crm/types";

export function formatZodErrors(error: ZodError) {
  return error.issues.map((issue) => `${issue.path.join(".") || "form"}: ${issue.message}`);
}

export function toggleDocumentType(
  data: MediacleaningStepData,
  onChange: (value: MediacleaningStepData) => void,
  documentType: MediacleaningStepData["documentTypes"][number],
  checked: boolean
) {
  const documentTypes = checked
    ? [...data.documentTypes, documentType]
    : data.documentTypes.filter((current) => current !== documentType);

  onChange({ ...data, documentTypes });
}
