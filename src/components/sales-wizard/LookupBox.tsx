"use client";

import { useState, type FormEvent } from "react";
import type { SubmitState } from "@/lib/crm/types";
import type { SearchHit } from "@/lib/pipedrive/types";

/**
 * Mirrors `MAX_SEARCH_RESULTS` in the Pipedrive service. Duplicated rather than
 * imported: that module pulls in the API client and config, which must never
 * reach the client bundle.
 */
const MAX_SEARCH_RESULTS = 10;

/**
 * Pipedrive record search.
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
  onClear
}: {
  title: string;
  endpoint: string;
  onSelect: (hit: SearchHit) => void;
  /** Shown when a record is currently selected. */
  selectedLabel?: string;
  onClear?: () => void;
}) {
  const [term, setTerm] = useState("");
  const [state, setState] = useState<SubmitState>({ status: "idle" });
  const [results, setResults] = useState<SearchHit[]>([]);

  async function search(event: FormEvent) {
    event.preventDefault();

    if (!term.trim() || state.status === "loading") return;

    setState({ status: "loading", message: "Söker..." });

    try {
      const response = await fetch(`${endpoint}?term=${encodeURIComponent(term.trim())}`);
      const payload = (await response.json()) as { ok: boolean; data?: SearchHit[]; error?: string };

      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Sökningen misslyckades");

      const hits = payload.data ?? [];
      setResults(hits);
      setState({
        status: "success",
        message: hits.length === 0 ? "Inga träffar." : `${hits.length} träffar`
      });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Sökningen misslyckades" });
      setResults([]);
    }
  }

  function select(hit: SearchHit) {
    onSelect(hit);
    setResults([]);
    setTerm("");
    setState({ status: "idle" });
  }

  return (
    <form className="lookup" onSubmit={search}>
      <label htmlFor={`lookup-${endpoint}`}>{title}</label>

      {selectedLabel ? (
        <div className="lookup-selected">
          <span className="lookup-selected-name">✓ {selectedLabel}</span>
          {onClear && (
            <button className="link-button" type="button" onClick={onClear}>
              Koppla loss
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="lookup-row">
            <input
              id={`lookup-${endpoint}`}
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Sök på namn, e-post, telefon eller org.nr"
            />
            <button className="btn" type="submit" disabled={state.status === "loading"}>
              {state.status === "loading" ? "Söker..." : "Sök"}
            </button>
          </div>

          {state.status === "error" && <div className="notice error">{state.message}</div>}
          {state.status === "success" && results.length === 0 && <p className="lookup-empty">{state.message}</p>}

          {results.length > 0 && (
            <>
              <p className="lookup-empty">
                {results.length >= MAX_SEARCH_RESULTS
                  ? "Visar de första träffarna — förfina söktermen om du inte ser rätt post."
                  : "Välj en befintlig post för att undvika dubbletter."}
              </p>
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
            </>
          )}
        </>
      )}
    </form>
  );
}
