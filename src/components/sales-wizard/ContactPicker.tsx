"use client";

import { useEffect, useState } from "react";
import { FieldLabel } from "@/components/sales-wizard/fields";
import type { CrmRecordId } from "@/lib/crm/types";
import type { SearchHit } from "@/lib/pipedrive/types";

/**
 * Chooses which of the organization's people signs the document.
 *
 * The people come from Pipedrive rather than being typed, so the name on a
 * cancellation is a contact the customer record actually has. Nothing can be
 * generated before one is chosen.
 */
export function ContactPicker({
  organizationId,
  value,
  onChange
}: {
  organizationId?: CrmRecordId;
  value?: CrmRecordId;
  onChange: (person: { id?: CrmRecordId; name: string }) => void;
}) {
  const [people, setPeople] = useState<SearchHit[] | undefined>(undefined);
  const [loadedFor, setLoadedFor] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const key = organizationId === undefined ? "" : String(organizationId);

  useEffect(() => {
    if (!key) return;

    const controller = new AbortController();

    async function load(wanted: string) {
      setError(undefined);

      try {
        const response = await fetch(`/api/pipedrive/organizations/${encodeURIComponent(wanted)}/persons`, {
          signal: controller.signal
        });
        const payload = (await response.json()) as { ok: boolean; data?: SearchHit[]; error?: string };

        if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Kunde inte hämta kontaktpersoner");

        setPeople(payload.data ?? []);
        setLoadedFor(wanted);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setPeople([]);
        setLoadedFor(wanted);
        setError(loadError instanceof Error ? loadError.message : "Kunde inte hämta kontaktpersoner");
      }
    }

    void load(key);

    return () => controller.abort();
  }, [key]);

  const current = loadedFor === key ? people : undefined;

  return (
    <div className="field full">
      <FieldLabel label="Firmatecknare" required htmlFor="signer-person" />

      {!key && <span className="field-hint">Koppla en organisation för att välja kontaktperson.</span>}

      {key && current === undefined && <span className="field-hint">Hämtar kontaktpersoner…</span>}

      {key && current && current.length === 0 && (
        <span className="field-hint">
          {error ?? "Organisationen har inga kontaktpersoner i Pipedrive. Lägg till en där först."}
        </span>
      )}

      {key && current && current.length > 0 && (
        <>
          <select
            id="signer-person"
            aria-required="true"
            value={value === undefined ? "" : String(value)}
            onChange={(event) => {
              const person = current.find((candidate) => String(candidate.id) === event.target.value);
              onChange(person ? { id: person.id, name: person.name } : { id: undefined, name: "" });
            }}
          >
            <option value="">Välj kontaktperson...</option>
            {current.map((person) => (
              <option key={String(person.id)} value={String(person.id)}>
                {person.detail ? `${person.name} — ${person.detail}` : person.name}
              </option>
            ))}
          </select>
          <span className="field-hint">Namnet anges som firmatecknare i dokumentet.</span>
        </>
      )}
    </div>
  );
}
