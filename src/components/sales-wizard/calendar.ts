/**
 * Date and time helpers for the wizard's own pickers.
 *
 * Everything here is local-time and string based. `Date.toISOString()` is never
 * used: it converts to UTC, which in Swedish summer time turns midnight on the
 * 19th into the 18th — a booking silently landing on the wrong day.
 */

/** Monday first, as the week is read in Sweden. */
export const WEEKDAY_LABELS = ["må", "ti", "on", "to", "fr", "lö", "sö"] as const;

const MONTH_NAMES = [
  "januari",
  "februari",
  "mars",
  "april",
  "maj",
  "juni",
  "juli",
  "augusti",
  "september",
  "oktober",
  "november",
  "december"
] as const;

const MONTH_ABBREVIATIONS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"] as const;

const DAY_ABBREVIATIONS = ["sön", "mån", "tis", "ons", "tors", "fre", "lör"] as const;

export type CalendarDay = {
  /** `YYYY-MM-DD`, the value the form stores. */
  iso: string;
  dayOfMonth: number;
  /** False for the leading and trailing days borrowed from the neighbouring months. */
  inCurrentMonth: boolean;
};

export type MonthCursor = {
  year: number;
  /** 0-indexed, matching `Date.getMonth()`. */
  month: number;
};

export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

/** Returns undefined for anything that is not a real calendar date, e.g. `2026-02-30`. */
export function parseIsoDate(iso: string | undefined): Date | undefined {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;

  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  // `new Date(2026, 1, 30)` rolls over into March rather than failing.
  return toIsoDate(date) === iso ? date : undefined;
}

export function monthCursorFor(iso: string | undefined, fallback: Date): MonthCursor {
  const date = parseIsoDate(iso) ?? fallback;

  return { year: date.getFullYear(), month: date.getMonth() };
}

export function shiftMonth(cursor: MonthCursor, delta: number): MonthCursor {
  const shifted = new Date(cursor.year, cursor.month + delta, 1);

  return { year: shifted.getFullYear(), month: shifted.getMonth() };
}

export function shiftIsoDate(iso: string, days: number): string {
  const date = parseIsoDate(iso);

  if (!date) return iso;

  date.setDate(date.getDate() + days);

  return toIsoDate(date);
}

export function monthTitle({ year, month }: MonthCursor): string {
  return `${MONTH_NAMES[month]} ${year}`;
}

/**
 * Always six rows of seven days, so the popover keeps one height and the grid
 * below it does not jump when the seller pages through months.
 */
export function buildMonthGrid({ year, month }: MonthCursor): CalendarDay[] {
  const first = new Date(year, month, 1);
  // `getDay()` counts from Sunday; the grid starts on Monday.
  const lead = (first.getDay() + 6) % 7;
  const days: CalendarDay[] = [];

  for (let offset = 0; offset < 42; offset += 1) {
    const date = new Date(year, month, 1 - lead + offset);

    days.push({
      iso: toIsoDate(date),
      dayOfMonth: date.getDate(),
      inCurrentMonth: date.getMonth() === month
    });
  }

  return days;
}

/** `2026-08-19` → `ons 19 aug 2026`. The weekday is what a seller checks a booking against. */
export function formatDisplayDate(iso: string | undefined): string | undefined {
  const date = parseIsoDate(iso);

  if (!date) return undefined;

  return `${DAY_ABBREVIATIONS[date.getDay()]} ${date.getDate()} ${MONTH_ABBREVIATIONS[date.getMonth()]} ${date.getFullYear()}`;
}

/** Spoken form for screen readers and day-cell labels: `19 augusti 2026`. */
export function formatLongDate(iso: string): string {
  const date = parseIsoDate(iso);

  if (!date) return iso;

  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Accepts what people actually type — `9`, `930`, `9.30`, `9:3` — and answers
 * with `HH:MM`, or undefined when there is no sensible reading. Applied on blur
 * so it never fights the seller mid-keystroke.
 */
export function normalizeTime(input: string): string | undefined {
  const trimmed = input.trim();
  const digits = trimmed.replace(/[^\d]/g, "");

  // Text with no digits at all ("morgon") has no reading to complete.
  if (!digits) return undefined;

  const separated = /^(\d{1,2})[^\d](\d{1,2})$/.exec(trimmed);

  let hours: number;
  let minutes: number;

  if (separated) {
    hours = Number(separated[1]);
    minutes = Number(separated[2]);
  } else if (digits.length <= 2) {
    hours = Number(digits);
    minutes = 0;
  } else if (digits.length === 3) {
    hours = Number(digits.slice(0, 1));
    minutes = Number(digits.slice(1));
  } else if (digits.length === 4) {
    hours = Number(digits.slice(0, 2));
    minutes = Number(digits.slice(2));
  } else {
    return undefined;
  }

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) return undefined;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Working-hours slots for the dropdown; typing is still free-form. */
export function buildTimeSlots(startHour = 6, endHour = 21, stepMinutes = 15): string[] {
  const slots: string[] = [];

  for (let minutes = startHour * 60; minutes <= endHour * 60; minutes += stepMinutes) {
    slots.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
  }

  return slots;
}
