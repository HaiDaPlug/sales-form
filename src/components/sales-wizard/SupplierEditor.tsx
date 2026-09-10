"use client";

import { useEffect, useMemo, useState } from "react";
import { FieldLabel, TextField } from "@/components/sales-wizard/fields";
import type { SupplierRecord } from "@/lib/suppliers/types";
import type { SupplierSelection } from "@/lib/crm/types";

type NewSupplierDraft = { name: string; organizationNumber: string; address: string; email: string };

const EMPTY_DRAFT: NewSupplierDraft = { name: "", organizationNumber: "", address: "", email: "" };

/**
 * Picks the suppliers a customer's agreements are cancelled with.
 *
 * The list is the shared registry, loaded from the server: each entry carries
 * the notice address the letter is posted to and, where the client has supplied
 * it, the supplier's own organisationsnummer. A supplier that is not there is
 * added to the registry with "Spara", so the next seller finds it.
 */
export function SupplierEditor({
  suppliers,
  onChange
}: {
  suppliers: SupplierSelection[];
  onChange: (suppliers: SupplierSelection[]) => void;
}) {
  const [registry, setRegistry] = useState<SupplierRecord[]>([]);
  const [registryError, setRegistryError] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<NewSupplierDraft>(EMPTY_DRAFT);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/suppliers");
        const payload = (await response.json()) as { ok: boolean; data?: SupplierRecord[]; error?: string };

        if (cancelled) return;
        if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Kunde inte hämta leverantörer");

        setRegistry(payload.data ?? []);
      } catch (error) {
        if (cancelled) return;
        setRegistryError(error instanceof Error ? error.message : "Kunde inte hämta leverantörer");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const matches = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("sv");

    if (!term) return [];

    return registry.filter(
      (supplier) =>
        (supplier.name.toLocaleLowerCase("sv").includes(term) || supplier.organizationNumber.includes(term)) &&
        !suppliers.some((chosen) => chosen.name === supplier.name)
    );
  }, [registry, search, suppliers]);

  function addFromRegistry(supplier: SupplierRecord) {
    onChange([
      ...suppliers,
      {
        id: supplier.id,
        name: supplier.name,
        organizationNumber: supplier.organizationNumber,
        noticeAddress: supplier.address,
        email: supplier.email ?? "",
        comment: ""
      }
    ]);
    setSearch("");
  }

  async function saveNewSupplier() {
    setSaving(true);
    setSaveError(undefined);

    try {
      const response = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft)
      });
      const payload = (await response.json()) as { ok: boolean; data?: SupplierRecord; error?: string };

      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error ?? "Leverantören kunde inte sparas");
      }

      setRegistry((current) => [...current, payload.data as SupplierRecord].sort((a, b) => a.name.localeCompare(b.name, "sv")));
      addFromRegistry(payload.data);
      setDraft(EMPTY_DRAFT);
      setAdding(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Leverantören kunde inte sparas");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="section">
      <h2 className="section-title">Leverantörer att säga upp</h2>
      <p className="hint">
        Ett uppsägningsdokument skapas per leverantör och samlas i samma PDF. Leverantörens uppgifter fylls i
        automatiskt från listan.
      </p>

      <div className="lookup">
        <label htmlFor="supplier-search">Sök leverantör</label>
        <div className="lookup-row">
          <input
            id="supplier-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Sök på namn eller organisationsnummer"
          />
        </div>

        {registryError && <div className="notice error">{registryError}</div>}

        {matches.length > 0 && (
          <ul className="results">
            {matches.map((supplier) => (
              <li key={supplier.id}>
                <button className="result-item" type="button" onClick={() => addFromRegistry(supplier)}>
                  <span className="result-name">{supplier.name}</span>
                  <span className="result-detail">
                    {[supplier.organizationNumber, supplier.address].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {search.trim().length > 1 && matches.length === 0 && !registryError && (
          <p className="lookup-empty">Ingen träff. Lägg till leverantören nedan så finns den kvar i listan.</p>
        )}
      </div>

      {suppliers.map((supplier, index) => (
        <div className="supplier-card" key={supplier.id ?? `${supplier.name}-${index}`}>
          <div className="supplier-head">
            <span className="supplier-name">{supplier.name}</span>
            <button
              className="link-button"
              type="button"
              onClick={() => onChange(suppliers.filter((_, position) => position !== index))}
            >
              Ta bort
            </button>
          </div>
          <p className="supplier-detail">
            {[supplier.organizationNumber, supplier.noticeAddress].filter(Boolean).join(" · ")}
          </p>
          <TextField
            label="Kommentar"
            value={supplier.comment}
            onChange={(comment) =>
              onChange(
                suppliers.map((entry, position) => (position === index ? { ...entry, comment } : entry))
              )
            }
          />
        </div>
      ))}

      {adding ? (
        <div className="grid">
          <TextField required label="Företagsnamn" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
          <TextField
            required
            label="Organisationsnummer"
            value={draft.organizationNumber}
            onChange={(organizationNumber) => setDraft({ ...draft, organizationNumber })}
          />
          <TextField
            required
            className="full"
            label="Adress"
            value={draft.address}
            onChange={(address) => setDraft({ ...draft, address })}
          />
          <TextField label="E-postadress" value={draft.email} onChange={(email) => setDraft({ ...draft, email })} />

          {saveError && (
            <div className="field full">
              <div className="notice error">{saveError}</div>
            </div>
          )}

          <div className="field full">
            <div className="button-group">
              <button className="btn primary" type="button" disabled={saving} onClick={saveNewSupplier}>
                {saving ? "Sparar..." : "Spara"}
              </button>
              <button
                className="btn"
                type="button"
                disabled={saving}
                onClick={() => {
                  setAdding(false);
                  setDraft(EMPTY_DRAFT);
                  setSaveError(undefined);
                }}
              >
                Avbryt
              </button>
            </div>
            <span className="field-hint">
              Sparade leverantörer läggs till i listan och kan väljas av alla säljare.
            </span>
          </div>
        </div>
      ) : (
        <div className="button-group">
          <button className="btn" type="button" onClick={() => setAdding(true)}>
            Lägg till ny leverantör
          </button>
        </div>
      )}

      {suppliers.length === 0 && (
        <div className="field full">
          <FieldLabel label="Valda leverantörer" required />
          <span className="field-hint">Sök upp minst en leverantör innan uppsägningsdokumentet skapas.</span>
        </div>
      )}
    </section>
  );
}
