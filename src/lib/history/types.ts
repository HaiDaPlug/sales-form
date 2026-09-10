import { z } from "zod";

/**
 * The four workflows. Kept as a closed union so history stays scoped to them.
 *
 * "deal" survives only as a label for entries written before the prospect
 * overhaul; the portal no longer creates deals.
 */
export const WORKFLOW_KINDS = ["meeting", "prospect", "deal", "mediacleaning", "contract"] as const;
export type WorkflowKind = (typeof WORKFLOW_KINDS)[number];

export const WORKFLOW_LABELS: Record<WorkflowKind, string> = {
  meeting: "Mötesbokning",
  prospect: "Skapa prospekt",
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
  /**
   * The "Affärens säljare" option the session was logged in as. This is what
   * scopes the history to one seller; `createdBy` is only a display name.
   */
  sellerOptionId: z.union([z.string(), z.number()]).optional(),
  createdAt: z.string(),
  /** Human-readable customer/company for scanning the list. */
  customerName: z.string().optional(),
  summary: z.string(),
  /** IDs of records this run created in Pipedrive, so later steps can reuse them. */
  pipedriveLeadId: z.string().optional(),
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

export type HistoryQuery = {
  kind?: WorkflowKind;
  limit?: number;
  /** Restricts the result to one seller's runs. Omitted only by trusted callers. */
  sellerOptionId?: string | number;
};
