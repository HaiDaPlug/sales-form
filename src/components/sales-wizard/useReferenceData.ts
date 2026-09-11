"use client";

import { useEffect, useState } from "react";
import type { ReferenceOption } from "@/lib/pipedrive/types";

export type ReferenceData = {
  users: ReferenceOption[];
  /** Options of the "Fakturagrupp" deal field; empty means fall back to text. */
  invoiceGroups: ReferenceOption[];
  schedulerUrl?: string;
  loading: boolean;
  /** Set when Pipedrive is unreachable or misconfigured, so steps can fall back. */
  error?: string;
};

/**
 * Loads the Pipedrive reference lists backing the dropdowns.
 *
 * Fetched once in the wizard and passed down rather than per step. Sellers,
 * pipelines and stages are no longer lists the form offers: the seller is the
 * session, and a prospect has no pipeline.
 */
export function useReferenceData(): ReferenceData {
  const [data, setData] = useState<Omit<ReferenceData, "loading">>({ users: [], invoiceGroups: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const schedulerPromise = fetchSchedulerUrl().catch(() => undefined);
      // An unreadable invoice-group list costs the dropdown, not the step: the
      // field falls back to free text rather than failing the whole load.
      const invoiceGroupsPromise = fetchOptions("/api/pipedrive/invoice-groups").catch(() => []);

      try {
        const users = await fetchOptions("/api/pipedrive/users");

        if (cancelled) return;
        setData({
          users,
          invoiceGroups: await invoiceGroupsPromise,
          schedulerUrl: await schedulerPromise
        });
      } catch (error) {
        if (cancelled) return;
        setData({
          users: [],
          invoiceGroups: await invoiceGroupsPromise,
          schedulerUrl: await schedulerPromise,
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

async function fetchSchedulerUrl(): Promise<string | undefined> {
  const response = await fetch("/api/pipedrive/scheduler-config");
  const payload = (await response.json()) as {
    ok: boolean;
    data?: { bookingUrl?: string | null };
  };

  if (!response.ok || !payload.ok) return undefined;
  return payload.data?.bookingUrl ?? undefined;
}

async function fetchOptions(endpoint: string): Promise<ReferenceOption[]> {
  const response = await fetch(endpoint);
  const payload = (await response.json()) as { ok: boolean; data?: ReferenceOption[]; error?: string };

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Kunde inte hämta listor från Pipedrive");
  }

  return payload.data ?? [];
}
