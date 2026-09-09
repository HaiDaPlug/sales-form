"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildTimeSlots, normalizeTime } from "@/components/sales-wizard/calendar";
import { FieldLabel } from "@/components/sales-wizard/fields";
import { useDismissable } from "@/components/sales-wizard/usePopover";

const SLOTS = buildTimeSlots();

/**
 * Time picker replacing `<input type="time">`.
 *
 * Typing stays the fast path — `9`, `930` and `9.30` all become `09:30` on blur
 * — with a quarter-hour list for picking. The stored value is always `HH:MM`,
 * which is what the meeting schema validates.
 */
export function TimeField({
  label,
  value,
  onChange,
  className,
  required
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Held separately so a half-typed "9" is not written back as state mid-keystroke.
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const listRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const rootRef = useDismissable(open, close);

  const text = draft ?? value ?? "";

  function commit(raw: string) {
    const normalized = normalizeTime(raw);

    setDraft(undefined);
    // An unreadable entry is cleared rather than kept, so the field never shows
    // something the submit would reject.
    onChange(normalized ?? "");
  }

  function pick(slot: string) {
    setDraft(undefined);
    onChange(slot);
    setOpen(false);
    rootRef.current?.querySelector<HTMLElement>("[data-popover-trigger]")?.focus();
  }

  // Scrolls to the chosen time, or to now when nothing is chosen — opening at
  // 06:00 would mean scrolling past the morning on every booking.
  useEffect(() => {
    if (!open) return;

    const list = listRef.current;
    const anchor = value || nearestSlot(new Date());
    const target =
      list?.querySelector<HTMLElement>(`[data-slot="${anchor}"]`) ?? list?.querySelector<HTMLElement>("[data-slot]");

    if (list && target) list.scrollTop = target.offsetTop - list.clientHeight / 2 + target.clientHeight / 2;
  }, [open, value]);

  return (
    <div className={`field ${className ?? ""}`}>
      <FieldLabel label={label} required={required} />
      <div className="picker" ref={rootRef}>
        <div className="picker-combo">
          <input
            className="picker-input"
            value={text}
            inputMode="numeric"
            placeholder="--:--"
            aria-label={label}
            aria-required={required || undefined}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => commit(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;

              event.preventDefault();
              commit(event.currentTarget.value);
              setOpen(false);
            }}
          />
          <button
            type="button"
            data-popover-trigger
            className="picker-addon"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label="Visa tider"
            onClick={() => setOpen(!open)}
          >
            <ClockIcon />
          </button>
        </div>

        {open && (
          <div className="picker-popover time-list" role="listbox" aria-label={label} ref={listRef}>
            {SLOTS.map((slot) => (
              <button
                key={slot}
                type="button"
                role="option"
                data-slot={slot}
                data-selected={slot === value ? "true" : undefined}
                aria-selected={slot === value}
                className="time-slot"
                onClick={() => pick(slot)}
              >
                {slot}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** The quarter-hour slot closest to `now`, clamped to the ends of the list. */
function nearestSlot(now: Date): string {
  const minutes = Math.round((now.getHours() * 60 + now.getMinutes()) / 15) * 15;
  const slot = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

  return SLOTS.includes(slot) ? slot : SLOTS[minutes < 12 * 60 ? 0 : SLOTS.length - 1];
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 4.6V8l2.4 1.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
