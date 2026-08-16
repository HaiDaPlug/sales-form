import { z } from "zod";

/** The four workflows. Kept as a closed union so history stays scoped to them. */
export const WORKFLOW_KINDS = ["meeting", "deal", "mediacleaning", "contract"] as const;
export type WorkflowKind = (typeof WORKFLOW_KINDS)[number];

export const WORKFLOW_LABELS: Record<WorkflowKind, string> = {
  meeting: "Mötesbokning",
  deal: "Skapa affär",
  mediacleaning: "Mediacleaning",
  contract: "Avtalsgenerering"
};

export const historyEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(WORKFLOW_KINDS),
  /**
   * Did the workflow do its job? A document that was generated and delivered is
   * a success even if attaching it to Pipedrive afterwards failed — those are
   * separate outcomes and `warning` keeps them from being confused.
   */
  status: z.enum(["success", "warning", "error"]),
  /** Who ran it — from the session, never client-supplied. */
  createdBy: z.string(),
  createdAt: z.string(),
  /** Human-readable customer/company for scanning the list. */
  customerName: z.string().optional(),
  summary: z.string(),
  /** IDs of records this run created in Pipedrive, so later steps can reuse them. */
  pipedriveDealId: z.union([z.string(), z.number()]).optional(),
  pipedriveActivityId: z.union([z.string(), z.number()]).optional(),
  pipedrivePersonId: z.union([z.string(), z.number()]).optional(),
  pipedriveOrganizationId: z.union([z.string(), z.number()]).optional(),
  fileName: z.string().optional(),
  errorMessage: z.string().optional(),
  /** The validated submission, so a run can be inspected or resumed later. */
  payload: z.unknown().optional()
});

export type HistoryEntry = z.infer<typeof historyEntrySchema>;

export type NewHistoryEntry = Omit<HistoryEntry, "id" | "createdAt">;
