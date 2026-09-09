import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCache } from "@/lib/config/env";
import {
  candidateSlots,
  computeAvailableSlots,
  freeTechniciansAt,
  getSlotWindow,
  isWeekend,
  minutesToClock,
  type BusySpan
} from "@/lib/meetings/slots";

const WINDOW = {
  startMinutes: 8 * 60,
  endMinutes: 17 * 60,
  stepMinutes: 30,
  durationMinutes: 60,
  minLeadMinutes: 60
};

function busy(userId: number, from: string, to: string): BusySpan {
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));

  return { userId, startMinutes: minutes(from), endMinutes: minutes(to) };
}

describe("getSlotWindow", () => {
  afterEach(() => {
    for (const name of [
      "MEETING_WORKING_HOURS_START",
      "MEETING_WORKING_HOURS_END",
      "MEETING_SLOT_STEP_MINUTES",
      "MEETING_DURATION_MINUTES",
      "MEETING_MIN_LEAD_MINUTES"
    ]) {
      delete process.env[name];
    }
    resetEnvCache();
  });

  it("defaults to a Swedish working day in half hours", () => {
    resetEnvCache();

    expect(getSlotWindow()).toEqual(WINDOW);
  });

  it("takes the window from configuration", () => {
    process.env.MEETING_WORKING_HOURS_START = "09:00";
    process.env.MEETING_WORKING_HOURS_END = "15:30";
    process.env.MEETING_SLOT_STEP_MINUTES = "15";
    process.env.MEETING_DURATION_MINUTES = "45";
    process.env.MEETING_MIN_LEAD_MINUTES = "120";
    resetEnvCache();

    expect(getSlotWindow()).toEqual({
      startMinutes: 540,
      endMinutes: 930,
      stepMinutes: 15,
      durationMinutes: 45,
      minLeadMinutes: 120
    });
  });
});

describe("candidateSlots", () => {
  it("offers every step from the opening time", () => {
    const slots = candidateSlots(WINDOW).map(minutesToClock);

    expect(slots[0]).toBe("08:00");
    expect(slots[1]).toBe("08:30");
  });

  /** A 16:30 start would end at 17:30, past the end of the working day. */
  it("stops early enough that the meeting fits inside the day", () => {
    const slots = candidateSlots(WINDOW).map(minutesToClock);

    expect(slots.at(-1)).toBe("16:00");
    expect(slots).not.toContain("16:30");
  });
});

describe("freeTechniciansAt", () => {
  it("keeps a technician whose bookings are elsewhere", () => {
    expect(freeTechniciansAt(600, 60, [1], [busy(1, "13:00", "14:00")])).toEqual([1]);
  });

  it("drops a technician booked across the slot", () => {
    expect(freeTechniciansAt(600, 60, [1], [busy(1, "09:30", "11:00")])).toEqual([]);
  });

  /** Back-to-back meetings are deliberate, so touching edges are free. */
  it.each([
    ["ends exactly as the slot starts", busy(1, "09:00", "10:00")],
    ["starts exactly as the slot ends", busy(1, "11:00", "12:00")]
  ])("treats a booking that %s as no clash", (_label, span) => {
    expect(freeTechniciansAt(600, 60, [1], [span])).toEqual([1]);
  });

  /**
   * The reason busy spans carry their owner: one technician's meeting must not
   * hide the other's free hour.
   */
  it("keeps the free technician when a colleague is booked", () => {
    expect(freeTechniciansAt(600, 60, [1, 2], [busy(1, "09:30", "11:00")])).toEqual([2]);
  });

  it("reports none free when the whole pool is booked", () => {
    expect(
      freeTechniciansAt(600, 60, [1, 2], [busy(1, "09:30", "11:00"), busy(2, "10:00", "10:30")])
    ).toEqual([]);
  });
});

describe("computeAvailableSlots", () => {
  it("offers the working day when nothing is booked", () => {
    const slots = computeAvailableSlots({ window: WINDOW, technicianIds: [1], busy: [] });

    expect(slots).toHaveLength(17);
    expect(slots[0]).toEqual({ time: "08:00", technicianIds: [1] });
  });

  it("removes the slots a booking covers", () => {
    const slots = computeAvailableSlots({
      window: WINDOW,
      technicianIds: [1],
      busy: [busy(1, "10:00", "11:00")]
    }).map((slot) => slot.time);

    // A 60-minute meeting starting 09:30 or 10:30 would overlap 10:00–11:00.
    expect(slots).not.toContain("09:30");
    expect(slots).not.toContain("10:00");
    expect(slots).not.toContain("10:30");
    expect(slots).toContain("09:00");
    expect(slots).toContain("11:00");
  });

  it("keeps a slot one technician still has free, and names them", () => {
    const slots = computeAvailableSlots({
      window: WINDOW,
      technicianIds: [1, 2],
      busy: [busy(1, "10:00", "11:00")]
    });

    expect(slots.find((slot) => slot.time === "10:00")).toEqual({ time: "10:00", technicianIds: [2] });
  });

  it("hides times that have passed and those inside the lead time", () => {
    // 09:10 now, one hour of lead time: nothing before 10:30 is offered.
    const slots = computeAvailableSlots({
      window: WINDOW,
      technicianIds: [1],
      busy: [],
      nowMinutes: 9 * 60 + 10
    }).map((slot) => slot.time);

    expect(slots[0]).toBe("10:30");
    expect(slots).not.toContain("09:30");
  });

  it("offers the whole day for a date that is not today", () => {
    const slots = computeAvailableSlots({ window: WINDOW, technicianIds: [1], busy: [] });

    expect(slots[0].time).toBe("08:00");
  });

  it("reports no slots when the day is fully booked", () => {
    expect(
      computeAvailableSlots({ window: WINDOW, technicianIds: [1], busy: [busy(1, "08:00", "17:00")] })
    ).toEqual([]);
  });

  /**
   * A deployment that has not named its technicians still needs a working
   * picker: the pool becomes one anonymous resource that any booking blocks.
   */
  it("treats an unconfigured pool as a single resource", () => {
    const slots = computeAvailableSlots({
      window: WINDOW,
      technicianIds: [],
      busy: [busy(0, "10:00", "11:00")]
    }).map((slot) => slot.time);

    expect(slots).toContain("09:00");
    expect(slots).not.toContain("10:00");
  });
});

describe("isWeekend", () => {
  it.each([
    ["2026-09-12", true],
    ["2026-09-13", true],
    ["2026-09-11", false],
    ["2026-09-14", false]
  ])("says %s is weekend: %s", (date, expected) => {
    expect(isWeekend(date)).toBe(expected);
  });
});
