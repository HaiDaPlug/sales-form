"use client";

import { useCallback, useEffect, useState } from "react";
import { useDismissable } from "@/components/sales-wizard/usePopover";
import type { SubmitState } from "@/lib/crm/types";
import type { SearchHit } from "@/lib/pipedrive/types";

/**
 * Mirrors `MAX_SEARCH_RESULTS` in the Pipedrive service. Duplicated rather than
 * imported: that module pulls in the API client and config, which must never
 * reach the client bundle.
 */
const MAX_SEARCH_RESULTS = 10;

/**
 * Mirrors `MIN_SEARCH_TERM_LENGTH` in the Pipedrive service, duplicated for the
 * same reason. Checked here so the first keystroke does not fire a request the
 * route would reject with a 400.
 */
const MIN_SEARCH_TERM_LENGTH = 2;

/**
 * How long typing must pause before the search fires. Long enough that a name
 * typed at speed costs one request instead of one per keystroke, short enough
 * that results feel like a response to typing rather than a separate step.
 */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * A field where the seller's typed value and the linked Pipedrive record
 * disagree — e.g. a contact found by email whose phone number has changed.
 * Surfaced as an explicit choice rather than silently overwriting either side,
 * because both values may be correct and only the seller knows which.
 */
export type FieldConflict = {
  field: "phone" | "email";
  label: string;
  /** What the seller typed in this session. */
  enteredValue: string;
  /** What Pipedrive currently holds. */
  existingValue: string;
};

export type ConflictChoice = "keepExisting" | "useEntered";

/**
 * Pipedrive record search.
 *
 * Searches as the seller types — there is no search button, because the lookup
 * exists to stop duplicates being created, and anything the seller has to
 * remember to press is a step they can skip. Hits land in a dropdown floating
 * over the form rather than in the flow, so a search never pushes the fields
 * the seller is filling in down the page.
 *
 * Results are selectable rows: picking one writes the record's real ID into the
 * step, which is what lets a deal attach to an existing contact and company
 * instead of creating duplicates.
 */
export function LookupBox({
  title,
  endpoint,
  onSelect,
  selectedLabel,
  onClear,
  conflicts,
  onResolveConflict
}: {
  title: string;
  endpoint: string;
  onSelect: (hit: SearchHit) => void;
  /** Shown when a record is currently selected. */
  selectedLabel?: string;
  onClear?: () => void;
  /** Differences between the typed values and the linked record (S06). */
  conflicts?: FieldConflict[];
  onResolveConflict?: (conflict: FieldConflict, choice: ConflictChoice) => void;
}) {
  const [term, setTerm] = useState("");
  const [state, setState] = useState<SubmitState>({ status: "idle" });
  const [results, setResults] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);
  const rootRef = useDismissable(open, close);

  const trimmedTerm = term.trim();

  useEffect(() => {
    // Too short to search; `clearResults` has already emptied the previous hits.
    if (trimmedTerm.length < MIN_SEARCH_TERM_LENGTH) return;

    // Aborting on cleanup does double duty: it drops a request nobody is
    // waiting for any more, and it stops a slow earlier response from
    // overwriting the results of a later, narrower term.
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setState({ status: "loading", message: "Söker..." });

      try {
        const response = await fetch(`${endpoint}?term=${encodeURIComponent(trimmedTerm)}`, {
          signal: controller.signal
        });
        const payload = (await response.json()) as { ok: boolean; data?: SearchHit[]; error?: string };

        if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Sökningen misslyckades");

        const hits = payload.data ?? [];
        setResults(hits);
        setState({
          status: "success",
          message: hits.length === 0 ? "Inga träffar." : `${hits.length} träffar`
        });
      } catch (error) {
        // A search the seller has already typed past is not a failure to report.
        if (controller.signal.aborted) return;

        setState({ status: "error", message: error instanceof Error ? error.message : "Sökningen misslyckades" });
        setResults([]);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedTerm, endpoint]);

  function clearResults() {
    setResults([]);
    setState({ status: "idle" });
  }

  function retype(next: string) {
    setTerm(next);
    setOpen(true);

    // Cleared here rather than in the effect: a term too short to search has no
    // results by definition, and doing it on the keystroke keeps the previous
    // hits from lingering under a term that no longer produced them.
    if (next.trim().length < MIN_SEARCH_TERM_LENGTH) clearResults();
  }

  function select(hit: SearchHit) {
    onSelect(hit);
    clearResults();
    setTerm("");
    setOpen(false);
  }

  const hint = searchHint(state, trimmedTerm, results.length);

  return (
    <div className="lookup">
      <label htmlFor={`lookup-${endpoint}`}>{title}</label>

      {selectedLabel ? (
        <>
          <div className="lookup-selected">
            <span className="lookup-selected-name">✓ {selectedLabel}</span>
            {onClear && (
              <button className="link-button" type="button" onClick={onClear}>
                Koppla loss
              </button>
            )}
          </div>

          {conflicts?.map((conflict) => (
            <div className="notice warning" key={conflict.field} role="alert">
              <p>
                Kontakten finns redan, men {conflict.label.toLowerCase()} skiljer sig. Välj vilket värde som ska
                användas i det här formuläret.
              </p>
              {/* These buttons choose what this run uses. They do not write to
                  Pipedrive — the app has no controlled update operation yet, and
                  saying "uppdatera" would tell the seller the CRM was corrected
                  when it was not. */}
              <p className="field-hint">
                Valet gäller endast detta formulär. Kontaktuppgifterna i Pipedrive ändras inte — rätta dem i
                Pipedrive om de är felaktiga.
              </p>
              <div className="button-group">
                <button
                  className="btn"
                  type="button"
                  onClick={() => onResolveConflict?.(conflict, "keepExisting")}
                >
                  Använd Pipedrives värde: {conflict.existingValue}
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => onResolveConflict?.(conflict, "useEntered")}
                >
                  Använd det du angav: {conflict.enteredValue}
                </button>
              </div>
            </div>
          ))}
        </>
      ) : (
        <>
          <div className="lookup-field" ref={rootRef}>
            <input
              id={`lookup-${endpoint}`}
              type="search"
              autoComplete="off"
              data-popover-trigger
              value={term}
              onChange={(event) => retype(event.target.value)}
              onFocus={() => setOpen(true)}
              placeholder="Sök på namn, e-post, telefon eller org.nr"
            />

            {/* The dropdown carries the same text visibly, but it mounts and
                unmounts, so it cannot be the live region itself. */}
            <p aria-live="polite" className="lookup-live">
              {hint}
            </p>

            {open && (hint || results.length > 0) && (
              <div className="lookup-menu">
                {hint && <p className="lookup-empty">{hint}</p>}

                {results.length > 0 && (
                  <ul className="results">
                    {results.map((hit) => (
                      <li key={String(hit.id)}>
                        <button className="result-item" type="button" onClick={() => select(hit)}>
                          <span className="result-name">{hit.name}</span>
                          {hit.detail && <span className="result-detail">{hit.detail}</span>}
                          {hit.organizationName && <span className="result-detail">{hit.organizationName}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Kept in the flow, not in the dropdown: a failed search is
              something the seller must still see after clicking away. */}
          {state.status === "error" && <div className="notice error">{state.message}</div>}
        </>
      )}
    </div>
  );
}

/**
 * The one line describing the current search. A single string rather than a set
 * of conditional elements, so the live region replaces its text instead of
 * announcing each state in turn — and so an empty return doubles as "there is
 * nothing to show", which is what keeps the dropdown closed.
 */
function searchHint(state: SubmitState, trimmedTerm: string, hitCount: number): string {
  if (state.status === "loading") return "Söker...";

  // Silent until the term can actually be searched, so an empty field is not
  // scolding the seller before they have typed anything.
  if (trimmedTerm.length > 0 && trimmedTerm.length < MIN_SEARCH_TERM_LENGTH) {
    return `Skriv minst ${MIN_SEARCH_TERM_LENGTH} tecken för att söka.`;
  }

  if (hitCount === 0) return state.status === "success" ? "Inga träffar." : "";

  return hitCount >= MAX_SEARCH_RESULTS
    ? "Visar de första träffarna — förfina söktermen om du inte ser rätt post."
    : "Välj en befintlig post för att undvika dubbletter.";
}
