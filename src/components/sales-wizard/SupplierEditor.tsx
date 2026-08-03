import { TextField } from "@/components/sales-wizard/fields";
import type { SupplierSelection } from "@/lib/crm/types";

export function SupplierEditor({
  suppliers,
  onChange
}: {
  suppliers: SupplierSelection[];
  onChange: (suppliers: SupplierSelection[]) => void;
}) {
  function updateSupplier(index: number, patch: Partial<SupplierSelection>) {
    onChange(suppliers.map((supplier, supplierIndex) => (supplierIndex === index ? { ...supplier, ...patch } : supplier)));
  }

  return (
    <section className="section">
      <h2 className="section-title">Leverantörer att säga upp</h2>
      {suppliers.map((supplier, index) => (
        <div className="grid" key={index}>
          <TextField label="Leverantör" value={supplier.name} onChange={(name) => updateSupplier(index, { name })} />
          <TextField label="Kundnummer" value={supplier.customerNumber} onChange={(customerNumber) => updateSupplier(index, { customerNumber })} />
          <TextField className="full" label="Uppsägning skickas till" value={supplier.noticeAddress} onChange={(noticeAddress) => updateSupplier(index, { noticeAddress })} />
        </div>
      ))}
      <div className="button-group">
        <button className="btn" type="button" onClick={() => onChange([...suppliers, { name: "", customerNumber: "", noticeAddress: "" }])}>
          Lägg till leverantör
        </button>
        <button className="btn" type="button" disabled={suppliers.length === 0} onClick={() => onChange(suppliers.slice(0, -1))}>
          Ta bort sista
        </button>
      </div>
    </section>
  );
}
