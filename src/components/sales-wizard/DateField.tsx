"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  formatDisplayDate,
  formatLongDate,
  monthCursorFor,
  monthTitle,
  shiftIsoDate,
  shiftMonth,
  toIsoDate,
  type MonthCursor
} from "@/components/sales-wizard/calendar";
import { FieldLabel } from "@/components/sales-wizard/fields";
import { useDismissable } from "@/components/sales-wizard/usePopover";

/**
 * Date picker replacing `<input type="date">`.
 *
 * The native control renders in the browser's own chrome — a different shape,
 * font and date order per browser and OS locale, none of it the product's. This
 * one always shows a Monday-first Swedish month and stores the same
 * `YYYY-MM-DD` string the schemas expect.
 */
export function DateField({
  label,
  value,
  onChange,
  className,
  clearable = true,
  required
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  className?: string;
  clearable?: boolean;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState<MonthCursor>(() => monthCursorFor(value, new Date()));
  // The day the arrow keys are on, which is not yet a choice until Enter.
  const [focused, setFocused] = useState<string>(() => value || toIsoDate(new Date()));
  const gridRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const rootRef = useDismissable(open, close);

  const todayIso = toIsoDate(new Date());
  const display = formatDisplayDate(value);
  const days = buildMonthGrid(cursor);

  function openCalendar() {
    // Always opens on the chosen date, or on this month when there is none.
    setCursor(monthCursorFor(value, new Date()));
    setFocused(value || todayIso);
    setOpen(true);
  }

  function pick(iso: string) {
    onChange(iso);
    setOpen(false);
    rootRef.current?.querySelector<HTMLElement>("[data-popover-trigger]")?.focus();
  }

  function moveFocus(iso: string) {
    setFocused(iso);
    setCursor(monthCursorFor(iso, new Date()));
  }

  function onGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const step = steps[event.key];

    if (step !== undefined) {
      event.preventDefault();
      moveFocus(shiftIsoDate(focused, step));
      return;
    }

    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      const next = shiftMonth(monthCursorFor(focused, new Date()), event.key === "PageUp" ? -1 : 1);
      // Clamped by the Date constructor: 31 March paging back lands on 3 March,
      // so it is pinned to the last day the shorter month has.
      const day = Math.min(Number(focused.slice(8)), new Date(next.year, next.month + 1, 0).getDate());

      moveFocus(`${next.year}-${String(next.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick(focused);
    }
  }

  // Keeps the browser's focus ring on the day the arrow keys moved to.
  useEffect(() => {
    if (!open) return;

    gridRef.current?.querySelector<HTMLElement>(`[data-iso="${focused}"]`)?.focus();
  }, [open, focused]);

  return (
    <div className={`field ${className ?? ""}`}>
      <FieldLabel label={label} required={required} />
      <div className="picker" ref={rootRef}>
        <button
          type="button"
          data-popover-trigger
          className={`picker-trigger ${value ? "" : "is-empty"}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          // The label's asterisk is decorative, and a button cannot carry
          // `aria-required`, so the trigger says it in words instead.
          aria-label={`${display ? `${label}: ${formatLongDate(value as string)}` : label}${
            required ? ", obligatoriskt" : ""
          }`}
          onClick={() => (open ? close() : openCalendar())}
        >
          <span>{display ?? "Välj datum"}</span>
          <CalendarIcon />
        </button>

        {open && (
          <div className="picker-popover calendar" role="dialog" aria-label={label}>
            <div className="calendar-header">
              <button type="button" className="calendar-nav" aria-label="Föregående månad" onClick={() => setCursor(shiftMonth(cursor, -1))}>
                <ChevronIcon direction="left" />
              </button>
              <span className="calendar-title" aria-live="polite">
                {monthTitle(cursor)}
              </span>
              <button type="button" className="calendar-nav" aria-label="Nästa månad" onClick={() => setCursor(shiftMonth(cursor, 1))}>
                <ChevronIcon direction="right" />
              </button>
            </div>

            <div className="calendar-weekdays" aria-hidden="true">
              {WEEKDAY_LABELS.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>

            <div className="calendar-grid" ref={gridRef} onKeyDown={onGridKeyDown}>
              {days.map((day) => (
                <button
                  key={day.iso}
                  type="button"
                  data-iso={day.iso}
                  className="calendar-day"
                  data-outside={day.inCurrentMonth ? undefined : "true"}
                  data-today={day.iso === todayIso ? "true" : undefined}
                  aria-pressed={day.iso === value}
                  aria-label={formatLongDate(day.iso)}
                  tabIndex={day.iso === focused ? 0 : -1}
                  onClick={() => pick(day.iso)}
                >
                  {day.dayOfMonth}
                </button>
              ))}
            </div>

            <div className="calendar-footer">
              <button type="button" className="calendar-action" onClick={() => pick(todayIso)}>
                Idag
              </button>
              {clearable && value && (
                <button
                  type="button"
                  className="calendar-action"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  Rensa
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="12" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 6.5h12M5.5 1.8v2.4M10.5 1.8v2.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d={direction === "left" ? "M8.6 3.2 4.8 7l3.8 3.8" : "M5.4 3.2 9.2 7l-3.8 3.8"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
