"use client";

import { useEffect, useRef } from "react";

/**
 * Confirms a fresh start before anything is cleared.
 *
 * The reset exists because customer data was carrying over from one booking
 * to the next; a reset that fires on a stray click would trade that problem
 * for a seller losing a half-filled form. Cancel takes focus, so an accidental
 * Enter keeps the work.
 */
export function ResetDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);

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

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reset-title"
        aria-describedby="reset-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="modal-title" id="reset-title">
          Börja om med en ny kund?
        </h2>

        <p className="modal-description" id="reset-description">
          Allt som är ifyllt i de fyra stegen rensas, och kopplingen till vald person och organisation tas
          bort. Det som redan är skapat i Pipedrive påverkas inte.
        </p>

        <div className="modal-actions">
          <button className="btn primary" type="button" ref={cancelRef} onClick={onCancel}>
            Avbryt
          </button>
          <button className="btn" type="button" onClick={onConfirm}>
            Rensa och börja om
          </button>
        </div>
      </div>
    </div>
  );
}
