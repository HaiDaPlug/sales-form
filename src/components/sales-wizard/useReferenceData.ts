"use client";

import { useEffect, useState } from "react";
import type { ReferenceOption } from "@/lib/pipedrive/types";

export type ReferenceData = {
  users: ReferenceOption[];
  pipelines: ReferenceOption[];
  stages: ReferenceOption[];
  loading: boolean;
  /** Set when Pipedrive is unreachable or misconfigured, so steps can fall back. */
  error?: string;
};

/**
 * Loads the Pipedrive reference lists backing the dropdowns.
 *
 * Fetched once in the wizard and passed down, rather than per step — the lists
 * are small, unchanging within a session, and shared by three of the four
 * steps. All three are fetched together so a single failure (e.g. a missing
 * token) surfaces one message instead of three.
 *
 * Stages are fetched unfiltered and filtered client-side by pipeline; they
 * carry `pipelineId` for exactly that reason.
 */
export function useReferenceData(): ReferenceData {
  const [data, setData] = useState<Omit<ReferenceData, "loading">>({ users: [], pipelines: [], stages: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [users, pipelines, stages] = await Promise.all([
          fetchOptions("/api/pipedrive/users"),
          fetchOptions("/api/pipedrive/pipelines"),
          fetchOptions("/api/pipedrive/stages")
        ]);

        if (cancelled) return;
        setData({ users, pipelines, stages });
      } catch (error) {
        if (cancelled) return;
        setData({
          users: [],
          pipelines: [],
          stages: [],
          error: error instanceof Error ? error.message : "Kunde inte hämta listor från Pipedrive"
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return { ...data, loading };
}

async function fetchOptions(endpoint: string): Promise<ReferenceOption[]> {
  const response = await fetch(endpoint);
  const payload = (await response.json()) as { ok: boolean; data?: ReferenceOption[]; error?: string };

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Kunde inte hämta listor från Pipedrive");
  }

  return payload.data ?? [];
}
