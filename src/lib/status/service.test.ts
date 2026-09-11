import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/config/env";

vi.mock("@/lib/pipedrive/service", () => ({
  listLeads: vi.fn(),
  listDealsWithSourceLead: vi.fn(),
  getEnumOptions: vi.fn()
}));

const service = await import("@/lib/pipedrive/service");
const { getSellerStatus } = await import("@/lib/status/service");
const { ConfigurationError } = await import("@/lib/config/pipedrive");

const SELLER_KEY = "seller_key";
const UNDERLAG_KEY = "underlag_key";

/** Filippa is logged in; 72 is her option on "Affärens säljare". */
const filippa = { optionId: 72, name: "Filippa" };

function lead(overrides: Record<string, unknown> = {}) {
  return {
    id: "lead-1",
    title: "Andersson AB Prospekt",
    organization_id: { id: 7, name: "Andersson AB" },
    add_time: "2026-09-01 09:00:00",
    [SELLER_KEY]: 72,
    ...overrides
  };
}

function deal(overrides: Record<string, unknown> = {}) {
  return {
    id: 900,
    title: "Andersson AB",
    org_id: { id: 7, name: "Andersson AB" },
    add_time: "2026-09-05 11:00:00",
    status: "open",
    [SELLER_KEY]: 72,
    ...overrides
  };
}

beforeEach(() => {
  process.env.PIPEDRIVE_FIELD_AFFARENS_SALJARE = SELLER_KEY;
  process.env.PIPEDRIVE_FIELD_UNDERLAG = UNDERLAG_KEY;
  resetEnvCache();

  vi.mocked(service.listLeads).mockReset().mockResolvedValue([]);
  vi.mocked(service.listDealsWithSourceLead).mockReset().mockResolvedValue([]);
  vi.mocked(service.getEnumOptions)
    .mockReset()
    .mockResolvedValue([
      { id: 201, label: "Digital signering krävs" },
      { id: 202, label: "Ljudfil uppladdad" },
      { id: 203, label: "Väntar på signering" },
      { id: 204, label: "Avtal signerat" }
    ]);
});

afterEach(() => {
  delete process.env.PIPEDRIVE_FIELD_AFFARENS_SALJARE;
  delete process.env.PIPEDRIVE_FIELD_UNDERLAG;
  resetEnvCache();
});

/**
 * One listing carrying both states, as the endpoint actually returns them —
 * archived leads are marked with `is_archived`, not separated by the query.
 */
function withLeads(active: Record<string, unknown>[], archived: Record<string, unknown>[] = []) {
  vi.mocked(service.listLeads).mockResolvedValue([
    ...active.map((entry) => ({ is_archived: false, ...entry })),
    ...archived.map((entry) => ({ is_archived: true, ...entry }))
  ]);
}

describe("getSellerStatus", () => {
  it("shows the seller their own prospects", async () => {
    withLeads([lead()]);

    const status = await getSellerStatus(filippa);

    expect(status.prospects).toHaveLength(1);
    expect(status.prospects[0]).toMatchObject({
      leadId: "lead-1",
      title: "Andersson AB Prospekt",
      organizationName: "Andersson AB",
      registeredAt: "2026-09-01 09:00:00"
    });
  });

  /**
   * The rule the whole page rests on: assignment is the current value of
   * "Affärens säljare", not who created the record.
   */
  it("hides a colleague's prospects and deals", async () => {
    withLeads([lead(), lead({ id: "lead-2", [SELLER_KEY]: 73 })]);
    vi.mocked(service.listDealsWithSourceLead).mockResolvedValue([deal(), deal({ id: 901, [SELLER_KEY]: 73 })]);

    const status = await getSellerStatus(filippa);

    expect(status.prospects.map((prospect) => prospect.leadId)).toEqual(["lead-1"]);
    expect(status.deals.map((entry) => entry.dealId)).toEqual([900]);
  });

  it("hides a prospect with no seller at all", async () => {
    withLeads([lead({ [SELLER_KEY]: undefined })]);

    await expect(getSellerStatus(filippa)).resolves.toMatchObject({ prospects: [] });
  });

  it("matches an option id whether it reads back as a number or a string", async () => {
    withLeads([lead({ [SELLER_KEY]: "72" })]);

    await expect(getSellerStatus({ optionId: "72", name: "Filippa" })).resolves.toMatchObject({
      prospects: [expect.objectContaining({ leadId: "lead-1" })]
    });
  });

  it("names the evidence a prospect carries", async () => {
    withLeads([lead({ [UNDERLAG_KEY]: 202 })]);

    const status = await getSellerStatus(filippa);

    expect(status.prospects[0].underlag).toBe("audioUploaded");
  });

  it("reports no evidence rather than guessing when the field is unset", async () => {
    withLeads([lead()]);

    const status = await getSellerStatus(filippa);

    expect(status.prospects[0].underlag).toBeUndefined();
  });

  /**
   * Conversion is the approval, and it is performed by a person in Pipedrive.
   * A converted lead leaves the active list, so it is found among the archived
   * ones and matched to its deal by `source_lead_id`.
   */
  it("reports a converted prospect with its deal and date", async () => {
    withLeads([], [lead()]);
    vi.mocked(service.listDealsWithSourceLead).mockResolvedValue([deal({ source_lead_id: "lead-1" })]);

    const status = await getSellerStatus(filippa);

    expect(status.prospects[0]).toMatchObject({
      qualityControl: "converted",
      dealId: 900,
      convertedAt: "2026-09-05 11:00:00"
    });
  });

  it("reports an unconverted prospect as waiting for quality control", async () => {
    withLeads([lead()]);

    expect((await getSellerStatus(filippa)).prospects[0].qualityControl).toBe("pending");
  });

  it("separates an archived prospect from a converted one", async () => {
    withLeads([], [lead()]);

    expect((await getSellerStatus(filippa)).prospects[0].qualityControl).toBe("archived");
  });

  /**
   * The listing cannot be filtered by archived state — `archived_status` is
   * accepted and ignored, so both requests returned the same rows and every
   * prospect was listed twice. One lead is one row, whatever it is asked for.
   */
  it("lists a lead once, even though the listing cannot be filtered by state", async () => {
    withLeads([lead(), lead({ id: "lead-2" })]);

    const status = await getSellerStatus(filippa);

    expect(status.prospects).toHaveLength(2);
    expect(status.prospects.map((prospect) => prospect.leadId)).toEqual(["lead-1", "lead-2"]);
    expect(service.listLeads).toHaveBeenCalledTimes(1);
  });

  /**
   * A colleague's deal may still be what a shared prospect became; the
   * conversion is a fact about the prospect, not about who owns the deal now.
   */
  it("recognises a conversion even when the deal moved to a colleague", async () => {
    withLeads([], [lead()]);
    vi.mocked(service.listDealsWithSourceLead).mockResolvedValue([
      deal({ source_lead_id: "lead-1", [SELLER_KEY]: 73 })
    ]);

    const status = await getSellerStatus(filippa);

    expect(status.prospects[0].qualityControl).toBe("converted");
    // The deal itself is not the seller's to see.
    expect(status.deals).toEqual([]);
  });

  it("lists the customers behind the seller's own records, counted", async () => {
    withLeads([lead(), lead({ id: "lead-2" })]);
    vi.mocked(service.listDealsWithSourceLead).mockResolvedValue([deal()]);

    const status = await getSellerStatus(filippa);

    expect(status.customers).toEqual([
      { organizationId: 7, name: "Andersson AB", prospectCount: 2, dealCount: 1 }
    ]);
  });

  it("does not list a colleague's customer", async () => {
    withLeads([lead({ id: "lead-2", [SELLER_KEY]: 73, organization_id: { id: 9, name: "Bergman AB" } })]);

    await expect(getSellerStatus(filippa)).resolves.toMatchObject({ customers: [] });
  });

  it("shows the newest prospect first", async () => {
    withLeads([lead(), lead({ id: "lead-2", add_time: "2026-09-08 09:00:00" })]);

    const status = await getSellerStatus(filippa);

    expect(status.prospects.map((prospect) => prospect.leadId)).toEqual(["lead-2", "lead-1"]);
  });

  it("fails loudly when the seller field is unmapped, rather than showing everything", async () => {
    delete process.env.PIPEDRIVE_FIELD_AFFARENS_SALJARE;
    resetEnvCache();

    await expect(getSellerStatus(filippa)).rejects.toBeInstanceOf(ConfigurationError);
    expect(service.listLeads).not.toHaveBeenCalled();
  });

  it("still lists prospects when the underlag field is unmapped", async () => {
    delete process.env.PIPEDRIVE_FIELD_UNDERLAG;
    resetEnvCache();
    withLeads([lead()]);

    const status = await getSellerStatus(filippa);

    expect(status.prospects).toHaveLength(1);
    expect(status.prospects[0].underlag).toBeUndefined();
  });
});
