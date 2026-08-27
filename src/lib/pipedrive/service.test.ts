import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DealStepInput, MeetingStepInput } from "@/lib/crm/schemas";

vi.mock("@/lib/pipedrive/client", () => ({
  pipedriveRequest: vi.fn(),
  PipedriveApiError: class PipedriveApiError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
}));

const { pipedriveRequest, PipedriveApiError } = await import("@/lib/pipedrive/client");
const {
  assertDealBelongsToOrganization,
  buildMeetingActivityPayload,
  DealOwnershipError,
  ExistingRecordProtectionError,
  PartialResolutionError,
  resolveDealParties,
  resolveFirstStageId,
  resolveMeetingParties
} = await import("@/lib/pipedrive/service");

beforeEach(() => {
  vi.mocked(pipedriveRequest).mockReset();
});

/** S15 — a document must not land on another customer's deal. */
describe("assertDealBelongsToOrganization (S15)", () => {
  it("passes when the deal belongs to the organization", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue({ id: 42, org_id: 7 });

    await expect(assertDealBelongsToOrganization(42, 7)).resolves.toBeUndefined();
  });

  it("passes when org_id arrives as a nested object", async () => {
    // Pipedrive returns `org_id` either as a bare id or as an expanded object.
    vi.mocked(pipedriveRequest).mockResolvedValue({ id: 42, org_id: { id: 7, name: "Andersson AB" } });

    await expect(assertDealBelongsToOrganization(42, 7)).resolves.toBeUndefined();
  });

  it("compares ids across string and number forms", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue({ id: 42, org_id: 7 });

    await expect(assertDealBelongsToOrganization("42", "7")).resolves.toBeUndefined();
  });

  it("rejects a deal belonging to another organization", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue({ id: 42, org_id: 99 });

    await expect(assertDealBelongsToOrganization(42, 7)).rejects.toBeInstanceOf(DealOwnershipError);
  });

  it("rejects a deal with no organization at all", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue({ id: 42 });

    await expect(assertDealBelongsToOrganization(42, 7)).rejects.toBeInstanceOf(DealOwnershipError);
  });
});

/** S12 — no stage chosen means the first stage of the selected pipeline. */
describe("resolveFirstStageId (S12)", () => {
  it("returns the first stage of the requested pipeline by order", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([
      { id: 3, name: "Intro Möte", pipeline_id: 1, order_nr: 3 },
      { id: 1, name: "Välkomstbrev utskick", pipeline_id: 1, order_nr: 1 },
      { id: 2, name: "Mediacleaning Utskick", pipeline_id: 1, order_nr: 2 }
    ]);

    await expect(resolveFirstStageId(1)).resolves.toBe(1);
  });

  it("ignores stages belonging to a different pipeline", async () => {
    // `order_nr` restarts per pipeline, so a flat first-element read is wrong.
    vi.mocked(pipedriveRequest).mockResolvedValue([
      { id: 10, name: "Kvalificerade", pipeline_id: 2, order_nr: 1 },
      { id: 1, name: "Välkomstbrev utskick", pipeline_id: 1, order_nr: 1 }
    ]);

    await expect(resolveFirstStageId(1)).resolves.toBe(1);
  });

  it("returns undefined when the pipeline has no stages", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([]);

    await expect(resolveFirstStageId(1)).resolves.toBeUndefined();
  });
});

function dealParties(overrides: Partial<DealStepInput> = {}): DealStepInput {
  return {
    person: {
      id: 11,
      name: "Anna Andersson",
      email: "anna@example.se",
      phone: "0701234567",
      organizationId: 7
    },
    organization: {
      id: 7,
      name: "Andersson AB",
      organizationNumber: "556677-8899",
      website: "https://example.se",
      address: "Storgatan 1"
    },
    deal: { title: "Digital Kontakt", value: 12000, currency: "SEK", pipelineId: 1 },
    sellerId: 3,
    viktigastForKunden: "Synlighet",
    fakturaStart: "2026-09-01",
    fakturagrupp: "Standard",
    ...overrides
  };
}

describe("resolveDealParties CRM protection", () => {
  it("reuses matching existing records without an update request", async () => {
    const result = await resolveDealParties(dealParties());

    expect(result.personLinkedToOrganization).toBe(true);
    expect(pipedriveRequest).not.toHaveBeenCalled();
  });

  it("refuses to relink a person owned by another organization", async () => {
    await expect(
      resolveDealParties(
        dealParties({
          person: { ...dealParties().person, organizationId: 99 }
        })
      )
    ).rejects.toBeInstanceOf(ExistingRecordProtectionError);

    expect(pipedriveRequest).not.toHaveBeenCalled();
  });

  it("does not mutate an existing unlinked person", async () => {
    const result = await resolveDealParties(
      dealParties({ person: { ...dealParties().person, organizationId: undefined } })
    );

    expect(result.personLinkedToOrganization).toBe(false);
    expect(pipedriveRequest).not.toHaveBeenCalled();
  });
});

function meetingParties(overrides: Partial<MeetingStepInput> = {}): MeetingStepInput {
  return {
    person: { name: "Anna Andersson", email: "anna@example.se", phone: "0701234567" },
    meetingType: "IT-genomgång",
    agenda: "Genomgång",
    technicianNotes: "Ta med demokonto",
    date: "2026-09-01",
    time: "13:30",
    durationMinutes: 60,
    locationOrLink: "Teams",
    ...overrides
  } as MeetingStepInput;
}

/**
 * S01, S03, S04 — booking a meeting for a new contact must create that contact,
 * while leaving the organization optional.
 */
describe("resolveMeetingParties (S01, S03, S04)", () => {
  it("creates the contact when none was selected (S01)", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue({ id: 11 });

    const result = await resolveMeetingParties(meetingParties());

    expect(result.createdPerson).toBe(true);
    expect(result.personId).toBe(11);
    expect(pipedriveRequest).toHaveBeenCalledWith("/persons", expect.objectContaining({ method: "POST" }));
  });

  it("creates no organization when none was named (S01)", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue({ id: 11 });

    const result = await resolveMeetingParties(meetingParties());

    expect(result.createdOrganization).toBe(false);
    expect(result.organizationId).toBeUndefined();
    expect(pipedriveRequest).toHaveBeenCalledTimes(1);
  });

  it("passes the contact's details through to Pipedrive", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue({ id: 11 });

    await resolveMeetingParties(meetingParties());

    expect(pipedriveRequest).toHaveBeenCalledWith(
      "/persons",
      expect.objectContaining({
        body: expect.objectContaining({
          name: "Anna Andersson",
          email: [{ value: "anna@example.se", primary: true }],
          phone: [{ value: "0701234567", primary: true }]
        })
      })
    );
  });

  it("creates both records and links them when an organization is named (S03)", async () => {
    vi.mocked(pipedriveRequest)
      .mockResolvedValueOnce({ id: 7 })
      .mockResolvedValueOnce({ id: 11 });

    const result = await resolveMeetingParties(
      meetingParties({ organization: { name: "Andersson AB", address: "Storgatan 1" } })
    );

    expect(result).toMatchObject({
      personId: 11,
      organizationId: 7,
      createdPerson: true,
      createdOrganization: true
    });

    // Organization first, so the person is created already carrying `org_id`.
    expect(vi.mocked(pipedriveRequest).mock.calls[0][0]).toBe("/organizations");
    expect(vi.mocked(pipedriveRequest).mock.calls[1][1]).toMatchObject({ body: { org_id: 7 } });
  });

  it("creates an organization for a private individual too (S04)", async () => {
    vi.mocked(pipedriveRequest)
      .mockResolvedValueOnce({ id: 7 })
      .mockResolvedValueOnce({ id: 11 });

    const result = await resolveMeetingParties(
      meetingParties({
        organization: { name: "Anna Andersson", customerType: "individual", organizationNumber: "850101-1234" }
      })
    );

    expect(result.createdOrganization).toBe(true);
  });

  it("reuses a selected contact without creating anything", async () => {
    const result = await resolveMeetingParties(
      meetingParties({ person: { id: 11, name: "Anna Andersson" } })
    );

    expect(result).toMatchObject({ personId: 11, createdPerson: false });
    expect(pipedriveRequest).not.toHaveBeenCalled();
  });

  it("reuses both records when both were selected (S02)", async () => {
    const result = await resolveMeetingParties(
      meetingParties({
        person: { id: 11, name: "Anna Andersson", organizationId: 7 },
        organization: { id: 7, name: "Andersson AB" }
      })
    );

    expect(result).toMatchObject({ personId: 11, organizationId: 7, createdPerson: false, createdOrganization: false });
    expect(pipedriveRequest).not.toHaveBeenCalled();
  });

  it("ignores a blank organization name", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue({ id: 11 });

    const result = await resolveMeetingParties(meetingParties({ organization: { name: "   " } }));

    expect(result.organizationId).toBeUndefined();
    expect(pipedriveRequest).toHaveBeenCalledTimes(1);
  });

  it("refuses to relink a contact owned by another organization", async () => {
    await expect(
      resolveMeetingParties(
        meetingParties({
          person: { id: 11, name: "Anna Andersson", organizationId: 99 },
          organization: { id: 7, name: "Andersson AB" }
        })
      )
    ).rejects.toBeInstanceOf(ExistingRecordProtectionError);

    expect(pipedriveRequest).not.toHaveBeenCalled();
  });

  it("fails when Pipedrive returns no person id", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue({});

    await expect(resolveMeetingParties(meetingParties())).rejects.toThrow("person-ID");
  });
});

/**
 * Partial-failure boundaries.
 *
 * Each case is "one call succeeded, the next failed". The created record must
 * travel out with the error, because a lost ID is what makes the seller's retry
 * create a duplicate in the CRM.
 */
describe("partial resolution failures preserve created records", () => {
  it("keeps the organization id when meeting person creation fails", async () => {
    vi.mocked(pipedriveRequest)
      .mockResolvedValueOnce({ id: 7 })
      .mockRejectedValueOnce(new Error("timeout"));

    const error = await resolveMeetingParties(
      meetingParties({ organization: { name: "Andersson AB" } })
    ).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(PartialResolutionError);
    expect(error.parties).toEqual({ organizationId: 7 });
    expect(error.message).toContain("timeout");
  });

  it("keeps the organization id when deal person creation fails", async () => {
    vi.mocked(pipedriveRequest)
      .mockResolvedValueOnce({ id: 7 })
      .mockRejectedValueOnce(new Error("timeout"));

    const error = await resolveDealParties(
      dealParties({
        person: { name: "Anna Andersson", email: "anna@example.se", phone: "0701234567" },
        organization: {
          name: "Andersson AB",
          organizationNumber: "556677-8899",
          website: "https://example.se",
          address: "Storgatan 1"
        }
      })
    ).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(PartialResolutionError);
    expect(error.parties).toEqual({ organizationId: 7 });
  });

  it("carries no organization id when there was none to create", async () => {
    // Person-only meeting: nothing exists to preserve, so the retry is clean.
    vi.mocked(pipedriveRequest).mockRejectedValueOnce(new Error("timeout"));

    const error = await resolveMeetingParties(meetingParties()).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(PartialResolutionError);
    expect(error.parties).toEqual({ organizationId: undefined });
  });

  it("preserves the upstream status code", async () => {
    vi.mocked(pipedriveRequest)
      .mockResolvedValueOnce({ id: 7 })
      .mockRejectedValueOnce(new PipedriveApiError("saknar behörighet", 403));

    const error = await resolveMeetingParties(
      meetingParties({ organization: { name: "Andersson AB" } })
    ).catch((thrown) => thrown);

    expect(error.status).toBe(403);
  });

  it("does not report the person as created when its creation failed", async () => {
    vi.mocked(pipedriveRequest)
      .mockResolvedValueOnce({ id: 7 })
      .mockResolvedValueOnce({});

    const error = await resolveMeetingParties(
      meetingParties({ organization: { name: "Andersson AB" } })
    ).catch((thrown) => thrown);

    // Pipedrive answered but without an id — still a failure, not a success.
    expect(error).toBeInstanceOf(PartialResolutionError);
    expect(error.parties.personId).toBeUndefined();
  });
});

describe("buildMeetingActivityPayload", () => {
  it("converts Stockholm summer time to UTC for Pipedrive Calendar", () => {
    const payload = buildMeetingActivityPayload(
      meetingParties({ date: "2026-08-19", time: "16:10" }),
      { personId: 11, createdPerson: true, createdOrganization: false }
    );

    expect(payload.due_date).toBe("2026-08-19");
    expect(payload.due_time).toBe("14:10");
  });

  it("converts Stockholm winter time with the standard-time offset", () => {
    const payload = buildMeetingActivityPayload(
      meetingParties({ date: "2026-01-19", time: "16:10" }),
      { personId: 11, createdPerson: true, createdOrganization: false }
    );

    expect(payload.due_date).toBe("2026-01-19");
    expect(payload.due_time).toBe("15:10");
  });

  it("moves the Pipedrive due date back when UTC conversion crosses midnight", () => {
    const payload = buildMeetingActivityPayload(
      meetingParties({ date: "2026-06-02", time: "00:30" }),
      { personId: 11, createdPerson: true, createdOrganization: false }
    );

    expect(payload.due_date).toBe("2026-06-01");
    expect(payload.due_time).toBe("22:30");
  });

  it("folds agenda, technician notes and internal comment into one note", () => {
    const payload = buildMeetingActivityPayload(
      meetingParties({ internalComment: "Ring först" }),
      { personId: 11, createdPerson: true, createdOrganization: false }
    );

    expect(payload.note).toBe(
      ["Genomgång", "IT-tekniker: Ta med demokonto", "Internt: Ring först"].join("\n\n")
    );
    expect(payload.location).toBe("Teams");
  });

  it("names the activity after the meeting type", () => {
    const payload = buildMeetingActivityPayload(meetingParties(), {
      personId: 11,
      createdPerson: true,
      createdOrganization: false
    });

    expect(payload.subject).toBe("Möte: IT-genomgång");
  });

  it("falls back to a plain subject when no meeting type was given", () => {
    const payload = buildMeetingActivityPayload(meetingParties({ meetingType: "" }), {
      personId: 11,
      createdPerson: true,
      createdOrganization: false
    });

    // "Möte: " with nothing after it is what a blank type used to produce.
    expect(payload.subject).toBe("Möte");
  });

  it("omits the note and location rather than writing them blank", () => {
    // All three are optional, so a meeting booked without them must not stamp
    // empty values onto the Pipedrive activity.
    const payload = buildMeetingActivityPayload(
      meetingParties({ agenda: "", technicianNotes: "", locationOrLink: "" }),
      { personId: 11, createdPerson: true, createdOrganization: false }
    );

    expect(payload.note).toBeUndefined();
    expect(payload.location).toBeUndefined();
  });
});
