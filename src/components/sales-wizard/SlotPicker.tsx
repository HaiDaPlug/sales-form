"use client";

import { useEffect, useState } from "react";
import { FieldLabel } from "@/components/sales-wizard/fields";

export type AvailableSlot = { time: string; technicianIds: number[] };

/** Carries the date it belongs to, so a stale result cannot be shown as current. */
type LoadState =
  | { status: "loading"; date: string }
  | { status: "ready"; date: string; slots: AvailableSlot[] }
  | { status: "error"; date: string };

/**
 * The bookable times for the chosen date, as buttons.
 *
 * Replaces the free-text time field: a seller can only pick a time the
 * technicians actually have free, which is what stops the double bookings the
 * account already contains. The list is fetched when the date changes, and the
 * server checks the choice again at submit time — this is a convenience, not
 * the guarantee.
 */
export function SlotPicker({
  date,
  value,
  onChange,
  /** Bumped by the wizard when a booking is refused, to re-fetch the list. */
  refreshToken = 0
}: {
  date?: string;
  value?: string;
  onChange: (time: string) => void;
  refreshToken?: number;
}) {
  const [loaded, setLoaded] = useState<LoadState | undefined>(undefined);

  useEffect(() => {
    if (!date) return;

    // Keeps a slow response for an earlier date from replacing a newer list.
    const controller = new AbortController();

    async function load(wanted: string) {
      try {
        const response = await fetch(`/api/pipedrive/activities/slots?date=${encodeURIComponent(wanted)}`, {
          signal: controller.signal
        });
        const payload = (await response.json()) as { ok: boolean; data?: AvailableSlot[] };

        if (!response.ok || !payload.ok) throw new Error("Kunde inte hämta tider");

        const slots = payload.data ?? [];
        setLoaded({ status: "ready", date: wanted, slots });

        // A time chosen before the list arrived — or one taken since — must not
        // stay selected behind a list that no longer offers it.
        if (value && !slots.some((slot) => slot.time === value)) onChange("");
      } catch {
        if (controller.signal.aborted) return;
        setLoaded({ status: "error", date: wanted });
      }
    }

    void load(date);

    return () => controller.abort();
    // `value` and `onChange` are deliberately not dependencies: re-fetching the
    // list every time the seller picks a time would replace it under them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, refreshToken]);

  // Derived, not stored: a result for another date is a result still loading.
  const state: LoadState | undefined = !date
    ? undefined
    : loaded?.date === date
      ? loaded
      : { status: "loading", date };

  return (
    <div className="field full">
      <FieldLabel label="Tid" required />

      <div aria-live="polite" className="slot-status">
        {!state && "Välj ett datum för att se lediga tider."}
        {state?.status === "loading" && "Hämtar tillgängliga tider…"}
        {state?.status === "error" && "Det gick inte att hämta tillgängliga tider. Försök igen."}
        {state?.status === "ready" &&
          state.slots.length === 0 &&
          "Det finns inga lediga tider detta datum. Välj ett annat datum."}
      </div>

      {state?.status === "ready" && state.slots.length > 0 && (
        <div className="slots" role="radiogroup" aria-label="Tillgängliga tider">
          {state.slots.map((slot) => (
            <button
              key={slot.time}
              type="button"
              role="radio"
              aria-checked={slot.time === value}
              className="slot"
              data-selected={slot.time === value ? "true" : undefined}
              onClick={() => onChange(slot.time)}
            >
              {slot.time}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
