import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/config/env";

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

const { pipedriveRequest } = await import("@/lib/pipedrive/client");
const { findAvailableSlots, findBusySpans, resolveSlotTechnician } = await import("@/lib/pipedrive/service");

/**
 * Activities are stored in UTC. Swedish summer time is UTC+2, so a meeting the
 * calendar shows at 10:00 is stored as 08:00 — fixtures are in the stored form.
 */
function activity(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    subject: "Möte",
    due_date: "2026-09-09",
    due_time: "08:00",
    duration: "01:00",
    user_id: 11,
    ...overrides
  };
}

/** A Wednesday, at 07:00 Swedish time — before the working day starts. */
const MORNING = new Date("2026-09-09T05:00:00.000Z");
const DATE = "2026-09-09";

beforeEach(() => {
  vi.mocked(pipedriveRequest).mockReset().mockResolvedValue([]);
  process.env.PIPEDRIVE_TECHNICIAN_USER_IDS = "11,12";
  resetEnvCache();
});

afterEach(() => {
  delete process.env.PIPEDRIVE_TECHNICIAN_USER_IDS;
  resetEnvCache();
});

describe("findBusySpans", () => {
  it("queries a window either side of the day, for every user", async () => {
    await findBusySpans(DATE, [11]);

    expect(pipedriveRequest).toHaveBeenCalledWith(
      "/activities",
      expect.objectContaining({
        query: expect.objectContaining({ user_id: 0, start_date: "2026-09-08", end_date: "2026-09-11" })
      })
    );
  });

  it("converts a stored UTC time to the Swedish minutes the seller sees", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([activity()]);

    // 08:00Z is 10:00 in Stockholm in September.
    await expect(findBusySpans(DATE, [11])).resolves.toEqual([
      { userId: 11, startMinutes: 600, endMinutes: 660 }
    ]);
  });

  it("ignores activities that land on another Swedish date", async () => {
    // 22:30Z on the 9th is 00:30 on the 10th in Stockholm.
    vi.mocked(pipedriveRequest).mockResolvedValue([activity({ due_time: "22:30" })]);

    await expect(findBusySpans(DATE, [11])).resolves.toEqual([]);
  });

  it("ignores undated to-dos and cancelled activities", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([
      activity({ due_time: "" }),
      activity({ id: 2, active_flag: false })
    ]);

    await expect(findBusySpans(DATE, [11])).resolves.toEqual([]);
  });

  it("ignores a booking owned by someone outside the technician pool", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([activity({ user_id: 99 })]);

    await expect(findBusySpans(DATE, [11, 12])).resolves.toEqual([]);
  });

  it("counts every booking when no pool is configured", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([activity({ user_id: 99 })]);

    await expect(findBusySpans(DATE, [])).resolves.toEqual([
      { userId: 0, startMinutes: 600, endMinutes: 660 }
    ]);
  });

  it("treats a zero-length activity as occupying its start minute", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([activity({ duration: "00:00" })]);

    await expect(findBusySpans(DATE, [11])).resolves.toEqual([
      { userId: 11, startMinutes: 600, endMinutes: 601 }
    ]);
  });
});

describe("findAvailableSlots", () => {
  it("offers the working day when the technicians are free", async () => {
    const slots = await findAvailableSlots(DATE, MORNING);

    expect(slots[0]).toEqual({ time: "08:00", technicianIds: [11, 12] });
    expect(slots.at(-1)?.time).toBe("16:00");
  });

  it("keeps a slot the second technician still has free", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([activity()]);

    const slots = await findAvailableSlots(DATE, MORNING);

    expect(slots.find((slot) => slot.time === "10:00")).toEqual({ time: "10:00", technicianIds: [12] });
  });

  it("removes a slot both technicians are booked for", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([activity(), activity({ id: 2, user_id: 12 })]);

    const slots = (await findAvailableSlots(DATE, MORNING)).map((slot) => slot.time);

    expect(slots).not.toContain("10:00");
    expect(slots).toContain("11:00");
  });

  it("offers nothing on a weekend", async () => {
    await expect(findAvailableSlots("2026-09-12", MORNING)).resolves.toEqual([]);
    expect(pipedriveRequest).not.toHaveBeenCalled();
  });

  it("hides times that have already passed today", async () => {
    // 13:00 Swedish time on the same date.
    const afternoon = new Date("2026-09-09T11:00:00.000Z");

    const slots = (await findAvailableSlots(DATE, afternoon)).map((slot) => slot.time);

    expect(slots[0]).toBe("14:00");
    expect(slots).not.toContain("09:00");
  });
});

describe("resolveSlotTechnician", () => {
  it("assigns the first free technician to a booking", async () => {
    await expect(resolveSlotTechnician(DATE, "10:00", 60, MORNING)).resolves.toEqual({
      available: true,
      technicianId: 11
    });
  });

  it("moves the booking to the free colleague", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([activity()]);

    await expect(resolveSlotTechnician(DATE, "10:00", 60, MORNING)).resolves.toEqual({
      available: true,
      technicianId: 12
    });
  });

  /** The check that stops two sellers booking the same slot at once. */
  it("refuses a slot taken since the seller chose it", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([activity(), activity({ id: 2, user_id: 12 })]);

    await expect(resolveSlotTechnician(DATE, "10:00", 60, MORNING)).resolves.toEqual({ available: false });
  });

  it("refuses a time that has passed", async () => {
    const afternoon = new Date("2026-09-09T11:00:00.000Z");

    await expect(resolveSlotTechnician(DATE, "09:00", 60, afternoon)).resolves.toEqual({ available: false });
  });

  it("refuses a weekend without asking Pipedrive", async () => {
    await expect(resolveSlotTechnician("2026-09-12", "10:00", 60, MORNING)).resolves.toEqual({ available: false });
    expect(pipedriveRequest).not.toHaveBeenCalled();
  });

  it("leaves the owner to the token's user when no pool is configured", async () => {
    delete process.env.PIPEDRIVE_TECHNICIAN_USER_IDS;
    resetEnvCache();

    await expect(resolveSlotTechnician(DATE, "10:00", 60, MORNING)).resolves.toEqual({
      available: true,
      technicianId: undefined
    });
  });
});
