"use client";

import { useEffect, useRef } from "react";
import { formatDisplayDate } from "@/components/sales-wizard/calendar";
import type { MeetingOverlap } from "@/lib/pipedrive/types";

/**
 * Blocks a booking that collides with existing activities until the seller
 * decides.
 *
 * Deliberately a hard stop rather than an inline warning: the wizard creates
 * the activity as soon as the step is submitted, and an overlap is usually the
 * seller re-submitting a booking that already exists. A notice they can scroll
 * past is how the duplicate pairs already in the account were made.
 *
 * The choice is never remembered — a later edit re-runs the check, because the
 * new time may clash with something else entirely.
 */
export function OverlapDialog({
  overlaps,
  onCancel,
  onConfirm
}: {
  overlaps: MeetingOverlap[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus lands on cancel, not confirm: the safe choice should be the one an
  // accidental Enter takes.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const sameContact = overlaps.some((overlap) => overlap.sameContact);

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="overlap-title"
        aria-describedby="overlap-description"
        // Without this a click that starts inside the panel closes the dialog.
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="modal-title" id="overlap-title">
          {sameContact ? "Mötet finns kanske redan" : "Tiden krockar med en annan bokning"}
        </h2>

        <p className="modal-description" id="overlap-description">
          {sameContact
            ? "Det finns redan en bokning med den här kontakten på en tid som överlappar. Kontrollera att du inte bokar samma möte två gånger."
            : `Det finns ${overlaps.length === 1 ? "en aktivitet" : `${overlaps.length} aktiviteter`} i Pipedrive som överlappar den valda tiden.`}
        </p>

        <ul className="overlap-list">
          {overlaps.map((overlap) => (
            <li className="overlap-item" key={String(overlap.id)}>
              <span className="overlap-when">
                {formatDisplayDate(overlap.date) ?? overlap.date} {overlap.time}–{overlap.endTime}
              </span>
              <span className="overlap-subject">{overlap.subject}</span>
              {(overlap.personName || overlap.organizationName) && (
                <span className="overlap-detail">
                  {[overlap.personName, overlap.organizationName].filter(Boolean).join(" · ")}
                  {overlap.sameContact && <span className="overlap-tag">samma kontakt</span>}
                </span>
              )}
            </li>
          ))}
        </ul>

        <div className="modal-actions">
          <button className="btn primary" type="button" ref={cancelRef} onClick={onCancel}>
            Avbryt och ändra tid
          </button>
          <button className="btn" type="button" onClick={onConfirm}>
            Boka ändå
          </button>
        </div>
      </div>
    </div>
  );
}
