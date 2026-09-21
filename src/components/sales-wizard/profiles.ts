"use client";

import type { CrmRecordId } from "@/lib/crm/types";

/** The organization as `/api/pipedrive/organizations/:id` returns it. */
export type OrganizationProfileView = {
  id: CrmRecordId;
  name: string;
  organizationNumber?: string;
  website?: string;
  address?: string;
  city?: string;
};

/**
 * Reads the organization the seller just linked, so its details fill the form
 * instead of being retyped.
 *
 * The full record is read by id rather than taken from the search hit: the
 * search endpoint does not return custom fields keyed the way the record does,
 * which is why the organisationsnummer never arrived through the lookup. Every
 * step links through this one function so the fill cannot work in one step
 * and be missing from another.
 *
 * Returns undefined on any failure. The link itself already holds, and the
 * seller can type what the fetch could not provide.
 */
export async function fetchOrganizationProfile(
  organizationId: CrmRecordId
): Promise<OrganizationProfileView | undefined> {
  try {
    const response = await fetch(`/api/pipedrive/organizations/${encodeURIComponent(String(organizationId))}`);
    const payload = (await response.json()) as { ok: boolean; data?: OrganizationProfileView };

    if (!response.ok || !payload.ok || !payload.data) return undefined;

    return payload.data;
  } catch {
    return undefined;
  }
}
