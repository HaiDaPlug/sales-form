import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resetEnvCache } from "@/lib/config/env";
import { recordHistory } from "@/lib/history/store";

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "history-test-"));
  process.env.HISTORY_FILE_PATH = path.join(directory, "history.jsonl");
  resetEnvCache();
});

afterEach(async () => {
  delete process.env.HISTORY_FILE_PATH;
  resetEnvCache();
  await rm(directory, { recursive: true, force: true });
});

async function writtenLine(): Promise<Record<string, unknown>> {
  const raw = await readFile(process.env.HISTORY_FILE_PATH as string, "utf8");
  return JSON.parse(raw.trim().split("\n").at(-1) as string);
}

/**
 * A personnummer is personal data and belongs only where it is needed — the
 * customer record, the deal, the document and the Pipedrive link. The local run
 * log is none of those.
 */
describe("recordHistory redaction", () => {
  it("removes an identity number from the stored payload", async () => {
    await recordHistory({
      kind: "deal",
      status: "success",
      createdBy: "Roble",
      summary: "Affär",
      payload: { organization: { name: "Anna Andersson", organizationNumber: "850101-1234" } }
    });

    const entry = await writtenLine();
    const organization = (entry.payload as { organization: Record<string, unknown> }).organization;

    expect(organization).not.toHaveProperty("organizationNumber");
    expect(organization.name).toBe("Anna Andersson");
    expect(JSON.stringify(entry)).not.toContain("850101-1234");
  });

  it("removes the identity number at the top level of a document payload", async () => {
    await recordHistory({
      kind: "mediacleaning",
      status: "success",
      createdBy: "Roble",
      summary: "Mediacleaning",
      payload: { companyName: "Andersson AB", organizationNumber: "556677-8899" }
    });

    const payload = (await writtenLine()).payload as Record<string, unknown>;

    expect(payload).not.toHaveProperty("organizationNumber");
    expect(payload.companyName).toBe("Andersson AB");
  });

  it("keeps no part of the identity number, not even the last digits", async () => {
    await recordHistory({
      kind: "deal",
      status: "success",
      createdBy: "Roble",
      summary: "Affär",
      payload: { organizationNumber: "556677-8899" }
    });

    expect(JSON.stringify(await writtenLine())).not.toContain("8899");
  });

  it.each(["personnummer", "identityNumber", "organisationsnummer"])(
    "removes the aliased field %j",
    async (key) => {
      await recordHistory({
        kind: "deal",
        status: "success",
        createdBy: "Roble",
        summary: "Affär",
        payload: { [key]: "556677-8899" }
      });

      expect(JSON.stringify(await writtenLine())).not.toContain("556677-8899");
    }
  );

  it("removes identity numbers inside arrays", async () => {
    await recordHistory({
      kind: "deal",
      status: "success",
      createdBy: "Roble",
      summary: "Affär",
      payload: { customers: [{ organizationNumber: "556677-8899" }] }
    });

    expect(JSON.stringify(await writtenLine())).not.toContain("556677-8899");
  });

  it("leaves non-sensitive fields untouched", async () => {
    await recordHistory({
      kind: "deal",
      status: "success",
      createdBy: "Roble",
      summary: "Affär",
      payload: { organization: { name: "Andersson AB", address: "Storgatan 1" } }
    });

    expect((await writtenLine()).payload).toMatchObject({
      organization: { name: "Andersson AB", address: "Storgatan 1" }
    });
  });

  it("removes the identity field even when it is empty", async () => {
    await recordHistory({
      kind: "meeting",
      status: "success",
      createdBy: "Roble",
      summary: "Möte",
      payload: { organization: { name: "Andersson AB", organizationNumber: "" } }
    });

    const organization = ((await writtenLine()).payload as { organization: Record<string, unknown> }).organization;

    expect(organization).not.toHaveProperty("organizationNumber");
    expect(organization.name).toBe("Andersson AB");
  });

  it("still records the Pipedrive ids, which are not sensitive", async () => {
    await recordHistory({
      kind: "deal",
      status: "success",
      createdBy: "Roble",
      summary: "Affär",
      pipedriveDealId: 42,
      pipedriveOrganizationId: 7,
      payload: { organizationNumber: "556677-8899" }
    });

    expect(await writtenLine()).toMatchObject({ pipedriveDealId: 42, pipedriveOrganizationId: 7 });
  });

  it("accepts the warning status for a document that was generated but not attached", async () => {
    await recordHistory({
      kind: "contract",
      status: "warning",
      createdBy: "Roble",
      summary: "Avtal",
      errorMessage: "Kunde inte kopplas i Pipedrive"
    });

    expect(await writtenLine()).toMatchObject({ status: "warning" });
  });
});
