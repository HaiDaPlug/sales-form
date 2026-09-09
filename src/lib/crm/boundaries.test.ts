import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as service from "@/lib/pipedrive/service";

/**
 * The boundaries the client's document draws, checked against the code rather
 * than trusted to reviewers.
 *
 * "Säljformuläret och dess integration får inte skapa affärer, godkänna
 * försäljningar eller konvertera prospekt till affärer. Begränsningen ska gälla
 * även vid direkt anrop till formulärets backend." A missing button is not
 * enough for that: the capability has to be absent from the code, which is
 * what these assert.
 */
const SOURCE_ROOT = path.join(process.cwd(), "src");

async function readSource(relativePath: string): Promise<string> {
  return readFile(path.join(SOURCE_ROOT, relativePath), "utf8");
}

describe("the portal cannot create deals", () => {
  it("exposes no deal-creating function", () => {
    // `createDeal` and `buildDealPayload` were deleted, not disabled.
    expect(service).not.toHaveProperty("createDeal");
    expect(service).not.toHaveProperty("buildDealPayload");
    expect(service).not.toHaveProperty("resolveDealParties");
  });

  it("never posts to Pipedrive's deals endpoint", async () => {
    const source = await readSource("lib/pipedrive/service.ts");
    const dealWrites = source.match(/"\/deals[^"]*",\s*\{[^}]*method:\s*"POST"/g);

    expect(dealWrites).toBeNull();
  });

  it("has no route operation that creates a deal", async () => {
    const source = await readSource("app/api/pipedrive/[...operation]/route.ts");

    expect(source).not.toContain('operation === "deals"');
    expect(source).not.toContain("createDeal");
  });
});

describe("the portal cannot approve or convert a prospect", () => {
  it("exposes no conversion function", () => {
    expect(service).not.toHaveProperty("convertLeadToDeal");
    expect(Object.keys(service).filter((name) => /convert/i.test(name))).toEqual([]);
  });

  it("never calls a conversion endpoint", async () => {
    const source = await readSource("lib/pipedrive/service.ts");

    expect(source).not.toMatch(/\/convert/);
  });

  /**
   * Approval is a person's act in Pipedrive. The portal writes the evidence a
   * sale rests on and nothing else, which the type of `setLeadUnderlag` is what
   * enforces: only "audioUploaded" can be passed.
   */
  it("can only write the one status that follows from its own action", async () => {
    const source = await readSource("lib/pipedrive/service.ts");

    expect(source).toContain("status: PortalUpdatableUnderlag");

    const prospect = await readSource("lib/crm/prospect.ts");
    expect(prospect).toContain('export type PortalUpdatableUnderlag = "audioUploaded"');
  });

  it("never writes the statuses that describe someone else's action", async () => {
    // "Väntar på signering" and "Avtal signerat" are set by the back-office in
    // Pipedrive; the portal only ever reads them back.
    for (const file of ["lib/pipedrive/service.ts", "app/api/pdf/contract/route.ts"]) {
      const source = await readSource(file);
      const writes = source.match(/setLeadUnderlag\([^)]*(awaitingSignature|signed)/g);

      expect(writes).toBeNull();
    }
  });
});

describe("existing CRM records stay read-only", () => {
  /**
   * One deliberate exception: a lead the portal created, whose evidence status
   * it advances after an upload. Everything else is create-or-read.
   */
  it("allows exactly one update path, on the lead status", async () => {
    const source = await readSource("lib/pipedrive/service.ts");
    const patches = source.match(/method:\s*"PATCH"/g) ?? [];

    expect(patches).toHaveLength(1);
    expect(source).toMatch(/\/leads\/\$\{encodeURIComponent\(leadId\)\}`,\s*\{\s*method:\s*"PATCH"/);
  });

  it("offers no delete method at all", async () => {
    const client = await readSource("lib/pipedrive/client.ts");

    expect(client).not.toMatch(/"DELETE"/);
  });
});
