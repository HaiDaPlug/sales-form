import { getEnv } from "@/lib/config/env";

/**
 * Meeting slots, computed by the portal.
 *
 * Pipedrive's Scheduler has no public API for its availability, so "tillgängliga
 * tider" is derived here: the working window minus everything already booked in
 * the technicians' calendars. All arithmetic is in minutes from midnight on the
 * chosen date, in Swedish local time — the same wall clock the seller reads.
 */

export type SlotWindow = {
  /** Minutes from midnight, e.g. 480 for 08:00. */
  startMinutes: number;
  endMinutes: number;
  stepMinutes: number;
  durationMinutes: number;
  minLeadMinutes: number;
};

/** A span the technician is already occupied for, in the same minute space. */
export type BusySpan = {
  /** Which technician is busy; a slot needs only one of them free. */
  userId: number;
  startMinutes: number;
  endMinutes: number;
};

export function getSlotWindow(): SlotWindow {
  const env = getEnv();

  return {
    startMinutes: clockToMinutes(env.MEETING_WORKING_HOURS_START),
    endMinutes: clockToMinutes(env.MEETING_WORKING_HOURS_END),
    stepMinutes: env.MEETING_SLOT_STEP_MINUTES,
    durationMinutes: env.MEETING_DURATION_MINUTES,
    minLeadMinutes: env.MEETING_MIN_LEAD_MINUTES
  };
}

export function clockToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToClock(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Saturday and Sunday are not offered. */
export function isWeekend(date: string): boolean {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return weekday === 0 || weekday === 6;
}

/**
 * Every slot start the window allows, before availability is considered. A slot
 * that would run past the end of the working day is not offered.
 */
export function candidateSlots(window: SlotWindow): number[] {
  const slots: number[] = [];

  for (let start = window.startMinutes; start + window.durationMinutes <= window.endMinutes; start += window.stepMinutes) {
    slots.push(start);
  }

  return slots;
}

/**
 * The technicians free for a slot.
 *
 * A slot is bookable when at least one technician has nothing overlapping it,
 * which is why the busy spans carry their user: with a pool of two, one
 * technician's meeting must not hide the other's free hour. Touching edges do
 * not collide — a meeting ending at 10:00 leaves 10:00 free.
 */
export function freeTechniciansAt(
  startMinutes: number,
  durationMinutes: number,
  technicianIds: number[],
  busy: BusySpan[]
): number[] {
  const endMinutes = startMinutes + durationMinutes;

  return technicianIds.filter((userId) =>
    busy.every(
      (span) => span.userId !== userId || span.endMinutes <= startMinutes || span.startMinutes >= endMinutes
    )
  );
}

export type AvailableSlot = {
  /** `HH:MM`, Swedish local time — what the seller picks and the form stores. */
  time: string;
  /** The technicians who could take it, in configured order. */
  technicianIds: number[];
};

/**
 * The bookable times for a date.
 *
 * `nowMinutes` is the current time on that same date, or undefined for any
 * other date; it removes slots that have passed or fall inside the minimum
 * lead time, so today's list cannot offer a meeting an hour ago.
 *
 * With no technicians configured the pool is a single anonymous resource
 * (`userId` 0), which is how a deployment that has not named its technicians
 * still gets a working picker rather than an empty one.
 */
export function computeAvailableSlots(input: {
  window: SlotWindow;
  technicianIds: number[];
  busy: BusySpan[];
  nowMinutes?: number;
}): AvailableSlot[] {
  const technicianIds = input.technicianIds.length > 0 ? input.technicianIds : [0];
  const earliest = input.nowMinutes === undefined ? -Infinity : input.nowMinutes + input.window.minLeadMinutes;

  return candidateSlots(input.window).flatMap((start) => {
    if (start < earliest) return [];

    const free = freeTechniciansAt(start, input.window.durationMinutes, technicianIds, input.busy);

    return free.length > 0 ? [{ time: minutesToClock(start), technicianIds: free }] : [];
  });
}
