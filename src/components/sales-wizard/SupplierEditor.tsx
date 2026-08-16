"use client";

import { useMemo, useState } from "react";
import { TextField } from "@/components/sales-wizard/fields";
import type { SupplierSelection } from "@/lib/crm/types";

/**
 * Suppliers the customer wants to cancel.
 *
 * The standard list covers the common Swedish directory services; anything
 * else is entered by hand via "Annan leverantör", which then requires a name
 * and a notice address because there is no known address to fall back on.
 */
const KNOWN_SUPPLIERS = [
  "Telia Sverige AB",
  "Tele2 Sverige AB",
  "Telenor Sverige AB",
  "Eniro Group AB",
  "Hitta.se",
  "Merinfo Sverige AB",
  "UC Affärsinformation AB",
  "Generaxion AB",
  "Nordiska Webbyrån AB",
  "Advago AB",
  "Servicefinder Sverige AB",
  "Reco Sverige AB"
];

const OTHER_SUPPLIER = "__other__";

export function SupplierEditor({
  suppliers,
  onChange
}: {
  suppliers: SupplierSelection[];
  onChange: (suppliers: SupplierSelection[]) => void;
}) {
  const [search, setSearch] = useState("");
  const matches = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("sv");

    if (!term) return [];

    return KNOWN_SUPPLIERS.filter(
      (name) =>
        name.toLocaleLowerCase("sv").includes(term) &&
        !suppliers.some((supplier) => supplier.name === name)
    );
  }, [search, suppliers]);

  function updateSupplier(index: number, patch: Partial<SupplierSelection>) {
    onChange(suppliers.map((supplier, supplierIndex) => (supplierIndex === index ? { ...supplier, ...patch } : supplier)));
  }

  return (
    <section className="section">
      <h2 className="section-title">Leverantörer att säga upp</h2>
      <p className="hint">Ett uppsägningsdokument skapas per leverantör och samlas i samma PDF.</p>

      <div className="lookup">
        <label htmlFor="supplier-search">Sök leverantör</label>
        <div className="lookup-row">
          <input
            id="supplier-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Sök i leverantörslistan"
          />
        </div>
        {matches.length > 0 && (
          <ul className="results">
            {matches.map((name) => (
              <li key={name}>
                <button
                  className="result-item"
                  type="button"
                  onClick={() => {
                    onChange([...suppliers, { name, customerNumber: "", noticeAddress: "", email: "", comment: "" }]);
                    setSearch("");
                  }}
                >
                  <span className="result-name">{name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {suppliers.map((supplier, index) => {
        const isOther = Boolean(supplier.isOther);

        return (
          <div className="grid" key={index}>
            <div className="field">
              <label>Leverantör</label>
              <select
                value={isOther ? OTHER_SUPPLIER : supplier.name}
                onChange={(event) => {
                  const value = event.target.value;

                  updateSupplier(
                    index,
                    value === OTHER_SUPPLIER
                      ? { isOther: true, name: "" }
                      : { isOther: false, name: value, noticeAddress: "", email: "", comment: "" }
                  );
                }}
              >
                <option value="">Välj leverantör...</option>
                {KNOWN_SUPPLIERS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                <option value={OTHER_SUPPLIER}>Annan leverantör...</option>
              </select>
            </div>

            {isOther && (
              <TextField
                label="Företagsnamn"
                value={supplier.name}
                onChange={(name) => updateSupplier(index, { name })}
              />
            )}

            <TextField label="Kundnummer" value={supplier.customerNumber} onChange={(customerNumber) => updateSupplier(index, { customerNumber })} />
            <TextField
              className="full"
              label="Uppsägningsadress (krävs)"
              value={supplier.noticeAddress}
              onChange={(noticeAddress) => updateSupplier(index, { noticeAddress })}
            />

            {isOther && (
              <>
                <TextField
                  label="E-post (valfritt)"
                  value={supplier.email}
                  onChange={(email) => updateSupplier(index, { email })}
                />
                <TextField
                  label="Kommentar"
                  value={supplier.comment}
                  onChange={(comment) => updateSupplier(index, { comment })}
                />
              </>
            )}
          </div>
        );
      })}

      <div className="button-group">
        <button
          className="btn"
          type="button"
          onClick={() => onChange([...suppliers, { name: "", customerNumber: "", noticeAddress: "" }])}
        >
          Lägg till leverantör
        </button>
        <button className="btn" type="button" disabled={suppliers.length === 0} onClick={() => onChange(suppliers.slice(0, -1))}>
          Ta bort sista
        </button>
      </div>
    </section>
  );
}
