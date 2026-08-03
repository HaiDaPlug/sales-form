"use client";

import { useState } from "react";
import type { SubmitState } from "@/lib/crm/types";

export function LookupBox({ title, endpoint }: { title: string; endpoint: string }) {
  const [term, setTerm] = useState("");
  const [state, setState] = useState<SubmitState>({ status: "idle" });
  const [results, setResults] = useState<Array<Record<string, unknown>>>([]);

  async function search() {
    if (!term.trim()) return;

    setState({ status: "loading", message: "Söker..." });

    try {
      const response = await fetch(`${endpoint}?term=${encodeURIComponent(term)}`);
      const payload = (await response.json()) as { ok: boolean; data?: Array<Record<string, unknown>>; error?: string };

      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Sökningen misslyckades");

      setResults(payload.data ?? []);
      setState({ status: "success", message: `${payload.data?.length ?? 0} träffar` });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Sökningen misslyckades" });
      setResults([]);
    }
  }

  return (
    <div className="lookup">
      <label>{title}</label>
      <div className="lookup-row">
        <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Sök på namn, e-post, telefon eller org.nr" />
        <button className="btn" type="button" onClick={search} disabled={state.status === "loading"}>
          Sök
        </button>
      </div>
      {state.status === "success" && results.length > 0 && <div className="notice warning">Möjliga befintliga CRM-poster hittades. Välj/återanvänd innan ny post skapas.</div>}
      {state.status === "error" && <div className="notice error">{state.message}</div>}
      {results.length > 0 && (
        <div className="results">
          {results.slice(0, 5).map((result, index) => (
            <pre className="result-item" key={index}>
              {JSON.stringify(result, null, 2)}
            </pre>
          ))}
        </div>
      )}
    </div>
  );
}
