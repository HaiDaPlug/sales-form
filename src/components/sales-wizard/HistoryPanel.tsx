"use client";

import { useEffect, useState } from "react";
import type { HistoryEntry } from "@/lib/history/types";
import { WORKFLOW_LABELS } from "@/lib/history/types";

/**
 * Recent runs across the team, newest first. `refreshToken` changes whenever the
 * wizard completes a step, which re-fetches without the panel needing to know
 * what happened.
 */
export function HistoryPanel({ refreshToken }: { refreshToken: number }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // `cancelled` keeps a slow response from overwriting a newer one after the
    // refresh token changes again.
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/history?limit=8");
        const result = (await response.json()) as { ok: boolean; data?: HistoryEntry[]; error?: string };

        if (cancelled) return;

        if (!response.ok || !result.ok) throw new Error(result.error ?? "Kunde inte läsa historiken");

        setEntries(result.data ?? []);
        setError(null);
      } catch (fetchError) {
        if (cancelled) return;
        setError(fetchError instanceof Error ? fetchError.message : "Kunde inte läsa historiken");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  return (
    <div className="history-panel">
      <div className="history-header">
        <h2 className="section-title">Senaste körningar</h2>
        <a className="link-button" href="/historik">
          Visa alla
        </a>
      </div>

      {loading && entries.length === 0 && <p className="history-empty">Laddar...</p>}
      {error && <div className="notice error">{error}</div>}
      {!loading && !error && entries.length === 0 && <p className="history-empty">Inga körningar än.</p>}

      <ul className="history-list">
        {entries.map((entry) => (
          <li className="history-item" key={entry.id} data-status={entry.status}>
            <div className="history-item-top">
              <span className="history-kind">{WORKFLOW_LABELS[entry.kind]}</span>
              <span className="history-time">{formatTimestamp(entry.createdAt)}</span>
            </div>
            <p className="history-summary">{entry.customerName ?? entry.summary}</p>
            <span className="history-meta">
              {entry.createdBy}
              {entry.status === "error" ? " · misslyckades" : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });
}
