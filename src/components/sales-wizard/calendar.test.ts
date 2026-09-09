import { describe, expect, it } from "vitest";
import {
  buildMonthGrid,
  buildTimeSlots,
  formatDisplayDate,
  monthCursorFor,
  monthTitle,
  normalizeTime,
  parseIsoDate,
  shiftIsoDate,
  shiftMonth,
  toIsoDate
} from "@/components/sales-wizard/calendar";

describe("buildMonthGrid", () => {
  it("always returns six Monday-first weeks", () => {
    const grid = buildMonthGrid({ year: 2026, month: 7 });

    expect(grid).toHaveLength(42);
    // 1 August 2026 is a Saturday, so the grid opens on Monday 27 July.
    expect(grid[0]).toEqual({ iso: "2026-07-27", dayOfMonth: 27, inCurrentMonth: false });
    expect(grid[5]).toMatchObject({ iso: "2026-08-01", inCurrentMonth: true });
    expect(grid.at(-1)?.iso).toBe("2026-09-06");
  });

  it("opens on the first when the month itself starts on a Monday", () => {
    const grid = buildMonthGrid({ year: 2026, month: 5 });

    expect(grid[0]).toEqual({ iso: "2026-06-01", dayOfMonth: 1, inCurrentMonth: true });
  });

  it("marks only the month's own days as belonging to it", () => {
    const grid = buildMonthGrid({ year: 2024, month: 1 });

    expect(grid.filter((day) => day.inCurrentMonth)).toHaveLength(29);
  });
});

/** DST is the trap: `toISOString` would report 2026-08-18 for Swedish midnight. */
describe("toIsoDate", () => {
  it("reads the local calendar day, not the UTC one", () => {
    expect(toIsoDate(new Date(2026, 7, 19))).toBe("2026-08-19");
    expect(toIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("parseIsoDate", () => {
  it("rejects dates that do not exist", () => {
    expect(parseIsoDate("2026-02-30")).toBeUndefined();
    expect(parseIsoDate("2026-13-01")).toBeUndefined();
  });

  it("rejects anything that is not an ISO date", () => {
    expect(parseIsoDate("19/08/2026")).toBeUndefined();
    expect(parseIsoDate("")).toBeUndefined();
    expect(parseIsoDate(undefined)).toBeUndefined();
  });

  it("accepts a real date", () => {
    expect(toIsoDate(parseIsoDate("2026-08-19") as Date)).toBe("2026-08-19");
  });
});

describe("month navigation", () => {
  it("wraps across the year boundary", () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });

  it("opens on the selected date, or on today when nothing is selected", () => {
    expect(monthCursorFor("2026-08-19", new Date(2020, 0, 1))).toEqual({ year: 2026, month: 7 });
    expect(monthCursorFor(undefined, new Date(2020, 0, 1))).toEqual({ year: 2020, month: 0 });
  });

  it("titles the month in Swedish", () => {
    expect(monthTitle({ year: 2026, month: 7 })).toBe("augusti 2026");
  });
});

describe("shiftIsoDate", () => {
  it("steps across month and year ends", () => {
    expect(shiftIsoDate("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftIsoDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftIsoDate("2026-08-19", 7)).toBe("2026-08-26");
  });
});

describe("formatDisplayDate", () => {
  it("shows the weekday, so a booking can be checked at a glance", () => {
    expect(formatDisplayDate("2026-08-19")).toBe("ons 19 aug 2026");
  });

  it("has nothing to show for an unset or broken value", () => {
    expect(formatDisplayDate(undefined)).toBeUndefined();
    expect(formatDisplayDate("nonsense")).toBeUndefined();
  });
});

describe("normalizeTime", () => {
  it("completes the shorthand people type", () => {
    expect(normalizeTime("9")).toBe("09:00");
    expect(normalizeTime("14")).toBe("14:00");
    expect(normalizeTime("930")).toBe("09:30");
    expect(normalizeTime("1345")).toBe("13:45");
    expect(normalizeTime("9.30")).toBe("09:30");
    expect(normalizeTime("9:5")).toBe("09:05");
    expect(normalizeTime(" 08:15 ")).toBe("08:15");
  });

  it("refuses impossible clock readings", () => {
    expect(normalizeTime("25:00")).toBeUndefined();
    expect(normalizeTime("12:75")).toBeUndefined();
    expect(normalizeTime("123456")).toBeUndefined();
    expect(normalizeTime("morgon")).toBeUndefined();
    expect(normalizeTime("")).toBeUndefined();
  });
});

describe("buildTimeSlots", () => {
  it("covers the working day at quarter-hour steps", () => {
    const slots = buildTimeSlots();

    expect(slots[0]).toBe("06:00");
    expect(slots[1]).toBe("06:15");
    expect(slots.at(-1)).toBe("21:00");
    expect(new Set(slots).size).toBe(slots.length);
  });
});
