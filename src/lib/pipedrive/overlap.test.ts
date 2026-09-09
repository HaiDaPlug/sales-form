import { beforeEach, describe, expect, it, vi } from "vitest";

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
const { findMeetingOverlaps } = await import("@/lib/pipedrive/service");

beforeEach(() => {
  vi.mocked(pipedriveRequest).mockReset();
  vi.mocked(pipedriveRequest).mockResolvedValue([]);
});

/**
 * Activities are stored in UTC, the same convention the meeting payload writes.
 * Swedish summer time is UTC+2, so a booking the seller makes at 16:10 is
 * stored as 14:10 — fixtures below are written in that stored form, and the
 * booking in the seller's own wall-clock time.
 */
const booking = { date: "2026-08-19", time: "16:10", durationMinutes: 60 };

function activity(overrides: Record<string, unknown> = {}) {
  return {
    id: 4505,
    subject: "Möte: IT-genomgång",
    due_date: "2026-08-19",
    due_time: "14:10",
    duration: "01:00",
    ...overrides
  };
}

describe("findMeetingOverlaps", () => {
  it("reports an activity occupying the same time", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([activity()]);

    const [overlap] = await findMeetingOverlaps(booking);

    expect(overlap).toMatchObject({ id: 4505, subject: "Möte: IT-genomgång" });
  });

  /**
   * The stored time is UTC; the seller checks the warning against a calendar
   * showing Swedish time, so the reported time must be converted back.
   */
  it("reports the clash in Swedish local time, not the stored UTC", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([activity()]);

    const [overlap] = await findMeetingOverlaps(booking);

    expect(overlap).toMatchObject({ date: "2026-08-19", time: "16:10", endTime: "17:10" });
  });

  it("finds a partial overlap that starts before and runs into the booking", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([
      activity({ due_time: "13:40", duration: "01:00" })
    ]);

    await expect(findMeetingOverlaps(booking)).resolves.toHaveLength(1);
  });

  /**
   * Back-to-back bookings are deliberate, so touching edges must not warn —
   * otherwise the dialog fires on every meeting scheduled after another.
   */
  it("does not warn when an activity ends exactly as the booking starts", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([
      activity({ due_time: "13:10", duration: "01:00" })
    ]);

    await expect(findMeetingOverlaps(booking)).resolves.toEqual([]);
  });

  it("does not warn when an activity starts exactly as the booking ends", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([
      activity({ due_time: "15:10", duration: "01:00" })
    ]);

    await expect(findMeetingOverlaps(booking)).resolves.toEqual([]);
  });

  /**
   * The account is full of undated to-dos. Treating a missing time as midnight
   * would warn on every booking that happens to share their date.
   */
  it("ignores undated to-dos that have no time", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([
      activity({ due_time: "", duration: "" }),
      activity({ id: 99, due_time: undefined })
    ]);

    await expect(findMeetingOverlaps(booking)).resolves.toEqual([]);
  });

  it("ignores cancelled activities", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([activity({ active_flag: false })]);

    await expect(findMeetingOverlaps(booking)).resolves.toEqual([]);
  });

  /** A zero-length activity still occupies its start minute. */
  it("treats a zero-duration activity as occupying its start minute", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([
      activity({ due_time: "14:30", duration: "00:00" })
    ]);

    await expect(findMeetingOverlaps(booking)).resolves.toHaveLength(1);
  });

  /**
   * `end_date` is exclusive on this endpoint: a same-day range returns nothing,
   * which would make the whole check silently useless. Verified against the
   * live API — `19→19` found none of the two meetings on the 19th, `19→20` both.
   * The window is built from the UTC date the booking converts to.
   */
  it("queries a window wider than the meeting day, for all users", async () => {
    await findMeetingOverlaps(booking);

    expect(pipedriveRequest).toHaveBeenCalledWith(
      "/activities",
      expect.objectContaining({
        query: expect.objectContaining({
          // Defaults to only the token user's activities without this.
          user_id: 0,
          start_date: "2026-08-18",
          end_date: "2026-08-21"
        })
      })
    );
  });

  it("marks a clash with the same contact", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([
      activity({ person_id: { id: 981, name: "Anna Andersson" } })
    ]);

    const [overlap] = await findMeetingOverlaps({ ...booking, personId: 981 });

    expect(overlap).toMatchObject({ sameContact: true, personName: "Anna Andersson" });
  });

  it("does not mark a clash with a different contact", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([
      activity({ person_id: { id: 12, name: "Bo Bergman" } })
    ]);

    const [overlap] = await findMeetingOverlaps({ ...booking, personId: 981 });

    expect(overlap.sameContact).toBe(false);
  });

  it("orders several clashes by when they start", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([
      activity({ id: 2, due_time: "14:30" }),
      activity({ id: 1, due_time: "13:45" })
    ]);

    const overlaps = await findMeetingOverlaps(booking);

    expect(overlaps.map((overlap) => overlap.id)).toEqual([1, 2]);
  });

  /**
   * The known duplicate pair in the account, at the exact time and duration the
   * live API reports for them. This is the case the whole feature exists for.
   */
  it("catches a duplicate booked at the identical time", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([
      activity({ id: 4505 }),
      activity({ id: 4506 })
    ]);

    await expect(findMeetingOverlaps(booking)).resolves.toHaveLength(2);
  });

  /** Winter is UTC+1, so a 10:00 Swedish booking is stored as 09:00. */
  it("handles a booking in winter time", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([
      { id: 7, subject: "Vintermöte", due_date: "2026-01-15", due_time: "09:00", duration: "01:00" }
    ]);

    const [overlap] = await findMeetingOverlaps({
      date: "2026-01-15",
      time: "10:00",
      durationMinutes: 60
    });

    expect(overlap).toMatchObject({ time: "10:00", endTime: "11:00" });
  });

  /**
   * An early Swedish morning sits on the previous UTC day, so the query window
   * and the comparison both have to look back a day.
   */
  it("matches an activity stored on the previous UTC day", async () => {
    vi.mocked(pipedriveRequest).mockResolvedValue([
      { id: 8, subject: "Tidigt pass", due_date: "2026-08-18", due_time: "23:30", duration: "01:00" }
    ]);

    const [overlap] = await findMeetingOverlaps({
      date: "2026-08-19",
      time: "01:00",
      durationMinutes: 60
    });

    // 23:30Z on the 18th is 01:30 Swedish time on the 19th.
    expect(overlap).toMatchObject({ date: "2026-08-19", time: "01:30" });
  });
});
