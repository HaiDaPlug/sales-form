import type { CrmRecordId } from "@/lib/crm/types";
import type { UnderlagStatus } from "@/lib/crm/prospect";

/**
 * Where a prospect stands, as the seller's status page reports it.
 *
 * Two independent things, deliberately kept apart: what evidence the sale
 * rests on (`underlag`), and whether quality control has approved it
 * (`qualityControl`). An uploaded recording is not an approval, and the
 * document is explicit that the two must not be confused.
 */
export type QualityControlState =
  /** The prospect is waiting: the evidence is in, nobody has decided yet. */
  | "pending"
  /** Converted to a deal in Pipedrive — the approval, performed by a person. */
  | "converted"
  /** Archived without becoming a deal. Why is not the portal's to say. */
  | "archived";

export type ProspectStatus = {
  leadId: string;
  title: string;
  organizationId?: CrmRecordId;
  organizationName?: string;
  /** When the prospect was registered. */
  registeredAt?: string;
  underlag?: UnderlagStatus;
  qualityControl: QualityControlState;
  /** Set once the prospect has become a deal. */
  dealId?: CrmRecordId;
  convertedAt?: string;
};

export type DealStatus = {
  dealId: CrmRecordId;
  title: string;
  organizationId?: CrmRecordId;
  organizationName?: string;
  status?: string;
  addedAt?: string;
  /** Set when this deal came from a prospect the portal can see. */
  sourceLeadId?: string;
};

export type CustomerStatus = {
  organizationId: CrmRecordId;
  name: string;
  prospectCount: number;
  dealCount: number;
};

export type SellerStatus = {
  prospects: ProspectStatus[];
  deals: DealStatus[];
  customers: CustomerStatus[];
};
