import { ConfigurationError, getPipedriveConfig } from "@/lib/config/pipedrive";
import type { CrmRecordId, SellerIdentity } from "@/lib/crm/types";
import type { UnderlagStatus } from "@/lib/crm/prospect";
import { UNDERLAG_LABELS } from "@/lib/crm/prospect";
import { getEnumOptions, listDealsWithSourceLead, listLeads } from "@/lib/pipedrive/service";
import type { CustomerStatus, DealStatus, ProspectStatus, SellerStatus } from "@/lib/status/types";

type AnyRecord = Record<string, unknown>;

/**
 * What one seller may see.
 *
 * Assignment is read from Pipedrive on every request, from the "Affärens
 * säljare" field an administrator maintains — never from who created the
 * record. A prospect moved to a colleague disappears from this seller's view
 * the moment the field changes, and appears in the colleague's. The filtering
 * happens here, server-side, so no request can widen it.
 */
export async function getSellerStatus(seller: SellerIdentity): Promise<SellerStatus> {
  const config = getPipedriveConfig();
  const sellerKey = config.customFields.affarensSaljare;
  const underlagKey = config.customFields.underlag;

  if (!sellerKey) {
    throw new ConfigurationError("Fältet Affärens säljare är inte mappat (PIPEDRIVE_FIELD_AFFARENS_SALJARE).");
  }

  const [leads, deals, underlagOptions] = await Promise.all([
    listLeads(),
    listDealsWithSourceLead(),
    underlagKey ? getEnumOptions(underlagKey) : Promise.resolve([])
  ]);

  const mine = (record: AnyRecord) => sameId(record[sellerKey], seller.optionId);
  const myDeals = deals.filter(mine);

  // A converted prospect is only recognisable through the deal it became, so
  // the deals are indexed by the lead they came from.
  const dealsBySourceLead = new Map<string, AnyRecord>();
  for (const deal of deals) {
    const sourceLeadId = asString(deal.source_lead_id);
    if (sourceLeadId) dealsBySourceLead.set(sourceLeadId, deal);
  }

  const underlagByOptionId = new Map<string, UnderlagStatus>();
  for (const option of underlagOptions) {
    const status = (Object.keys(UNDERLAG_LABELS) as UnderlagStatus[]).find(
      (candidate) => normalize(UNDERLAG_LABELS[candidate]) === normalize(option.label)
    );

    if (status) underlagByOptionId.set(String(option.id), status);
  }

  // Archived state is read from each lead, not from the query: the listing
  // cannot be filtered on it, and one lead must not appear twice. In practice
  // the listing returns only active leads, so an archived prospect is missing
  // rather than marked — see `listLeads`.
  const prospects = leads
    .filter(mine)
    .map((lead) =>
      toProspect(lead, lead.is_archived === true, dealsBySourceLead, underlagKey, underlagByOptionId)
    )
    .sort(byNewest);

  return {
    prospects,
    deals: myDeals.map(toDeal).sort(byNewest),
    customers: collectCustomers(prospects, myDeals.map(toDeal))
  };
}

function toProspect(
  lead: AnyRecord,
  archived: boolean,
  dealsBySourceLead: Map<string, AnyRecord>,
  underlagKey: string | undefined,
  underlagByOptionId: Map<string, UnderlagStatus>
): ProspectStatus {
  const leadId = asString(lead.id) ?? "";
  const deal = dealsBySourceLead.get(leadId);
  const organization = asRecord(lead.organization_id);

  return {
    leadId,
    title: asString(lead.title) ?? "Namnlöst prospekt",
    organizationId: readId(lead.organization_id),
    organizationName: organization ? asString(organization.name) : undefined,
    registeredAt: asString(lead.add_time),
    underlag: underlagKey ? underlagByOptionId.get(String(lead[underlagKey])) : undefined,
    // Conversion is the approval: a person made that decision in Pipedrive.
    // An archived prospect with no deal was shelved, which is a different
    // outcome from one still waiting.
    qualityControl: deal ? "converted" : archived ? "archived" : "pending",
    dealId: deal ? readId(deal.id) : undefined,
    convertedAt: deal ? asString(deal.add_time) : undefined
  };
}

function toDeal(deal: AnyRecord): DealStatus {
  const organization = asRecord(deal.org_id);

  return {
    dealId: readId(deal.id) ?? "",
    title: asString(deal.title) ?? "Namnlös affär",
    organizationId: readId(deal.org_id),
    organizationName: organization ? asString(organization.name) : undefined,
    status: asString(deal.status),
    addedAt: asString(deal.add_time),
    sourceLeadId: asString(deal.source_lead_id)
  };
}

/**
 * The customers behind the seller's prospects and deals.
 *
 * Organizations carry no seller field of their own, so "my customers" is
 * derived from the records that do. A customer nobody has a prospect or deal
 * for is nobody's customer to see.
 */
function collectCustomers(prospects: ProspectStatus[], deals: DealStatus[]): CustomerStatus[] {
  const customers = new Map<string, CustomerStatus>();

  const touch = (organizationId: CrmRecordId | undefined, name: string | undefined, kind: "prospect" | "deal") => {
    if (organizationId === undefined) return;

    const key = String(organizationId);
    const current = customers.get(key) ?? {
      organizationId,
      name: name ?? `Organisation ${key}`,
      prospectCount: 0,
      dealCount: 0
    };

    if (name && current.name.startsWith("Organisation ")) current.name = name;
    if (kind === "prospect") current.prospectCount += 1;
    else current.dealCount += 1;

    customers.set(key, current);
  };

  for (const prospect of prospects) touch(prospect.organizationId, prospect.organizationName, "prospect");
  for (const deal of deals) touch(deal.organizationId, deal.organizationName, "deal");

  return [...customers.values()].sort((a, b) => a.name.localeCompare(b.name, "sv"));
}

function byNewest(a: { registeredAt?: string; addedAt?: string }, b: { registeredAt?: string; addedAt?: string }) {
  return String(b.registeredAt ?? b.addedAt ?? "").localeCompare(String(a.registeredAt ?? a.addedAt ?? ""));
}

function sameId(value: unknown, expected: CrmRecordId): boolean {
  if (value === undefined || value === null || value === "") return false;

  // An enum custom field reads back as a bare id on a lead and, on some deal
  // payloads, as an object carrying it.
  const id = typeof value === "object" ? readId(value) : value;

  return id !== undefined && String(id) === String(expected);
}

function readId(value: unknown): CrmRecordId | undefined {
  if (typeof value === "string" || typeof value === "number") return value;

  const nested = typeof value === "object" && value !== null ? (value as AnyRecord).id : undefined;
  return typeof nested === "string" || typeof nested === "number" ? nested : undefined;
}

function asRecord(value: unknown): AnyRecord | undefined {
  return typeof value === "object" && value !== null ? (value as AnyRecord) : undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value === "number") return String(value);

  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("sv");
}
