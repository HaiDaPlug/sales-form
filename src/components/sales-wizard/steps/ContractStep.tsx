import {
  CheckLabel,
  FormSection,
  ReadOnlyField,
  SelectField,
  TextArea,
  TextField,
  type StepProps
} from "@/components/sales-wizard/fields";
import { ContactPicker } from "@/components/sales-wizard/ContactPicker";
import { LookupBox } from "@/components/sales-wizard/LookupBox";
import type { ContractStepData } from "@/lib/crm/types";

export function ContractStep({
  data,
  onChange,
  sellerName,
  mediacleaningReady
}: StepProps<ContractStepData> & { mediacleaningReady: boolean }) {
  /** Fills the customer fields from the record the seller picked. */
  async function fillFromOrganization(organizationId: string | number) {
    try {
      const response = await fetch(`/api/pipedrive/organizations/${encodeURIComponent(String(organizationId))}`);
      const payload = (await response.json()) as {
        ok: boolean;
        data?: { name: string; organizationNumber?: string; address?: string; city?: string };
      };

      if (!response.ok || !payload.ok || !payload.data) return;

      const profile = payload.data;

      onChange({
        ...data,
        organizationId,
        companyName: profile.name,
        organizationNumber: profile.organizationNumber ?? data.organizationNumber,
        // The contract prints one address line, so the city stays folded in.
        address: [profile.address, profile.city].filter(Boolean).join(", ") || data.address,
        leadId: "",
        dealId: "",
        signerPersonId: undefined,
        signerName: ""
      });
    } catch {
      // The lookup already wrote the id; leaving the rest to the seller beats
      // losing the selection over a failed fetch.
    }
  }

  return (
    <>
      <LookupBox
        title="Koppla befintlig organisation"
        endpoint="/api/pipedrive/organizations/search"
        selectedLabel={
          data.organizationId ? `${data.companyName || "Organisation"} (ID ${data.organizationId})` : undefined
        }
        onClear={() =>
          onChange({ ...data, organizationId: "", leadId: "", dealId: "", signerPersonId: undefined, signerName: "" })
        }
        onSelect={(hit) => void fillFromOrganization(hit.id)}
      />
      <LookupBox
        title="Koppla befintligt prospekt"
        endpoint="/api/pipedrive/leads/search"
        selectedLabel={data.leadId ? `Prospekt ${data.leadId}` : undefined}
        onClear={() => onChange({ ...data, leadId: "" })}
        onSelect={(hit) => {
          const organizationId = hit.organizationId ?? data.organizationId;
          onChange({ ...data, leadId: String(hit.id), dealId: "", organizationId });

          if (organizationId && !data.companyName) void fillFromOrganization(organizationId);
        }}
      />
      <p className="hint">
        Avtalet laddas upp till organisationen, som är där det skickas för signering med smart doc. Anteckningen
        kopplas till prospektet. Ingen affär skapas — försäljningen godkänns i Pipedrive efter kvalitetskontroll.
      </p>

      <FormSection title="Avtal">
        <TextField required label="Företagsnamn" value={data.companyName} onChange={(companyName) => onChange({ ...data, companyName })} />
        <TextField required label="Organisationsnummer" value={data.organizationNumber} onChange={(organizationNumber) => onChange({ ...data, organizationNumber })} />
        <TextField required className="full" label="Adress" value={data.address} onChange={(address) => onChange({ ...data, address })} />

        {data.organizationId ? (
          <ContactPicker
            organizationId={data.organizationId}
            value={data.signerPersonId}
            onChange={(person) => onChange({ ...data, signerPersonId: person.id, signerName: person.name })}
          />
        ) : (
          <TextField
            required
            className="full"
            label="Firmatecknare/kontaktperson"
            value={data.signerName}
            onChange={(signerName) => onChange({ ...data, signerName })}
          />
        )}

        {/* The contract prints the logged-in seller; there is nothing to choose. */}
        <ReadOnlyField label="Ansvarig säljare" value={`Inloggad som: ${sellerName}`} />
        <TextField required label="Pris/kostnad" type="number" value={String(data.price)} onChange={(price) => onChange({ ...data, price: Number(price) })} />
        <SelectField
          label="Betalningsintervall"
          value={data.paymentInterval}
          options={[
            { value: "monthly", label: "Månadsvis" },
            { value: "quarterly", label: "Kvartalsvis" },
            { value: "semiannual", label: "Var 6:e månad / halvårsvis" }
          ]}
          onChange={(paymentInterval) => onChange({ ...data, paymentInterval: paymentInterval as ContractStepData["paymentInterval"] })}
        />
        <TextField required label="Bindningstid månader" type="number" value={String(data.bindingPeriodMonths)} onChange={(bindingPeriodMonths) => onChange({ ...data, bindingPeriodMonths: Number(bindingPeriodMonths) })} />
        <TextArea
          required
          className="full"
          label="Inkluderade tjänster, en per rad"
          value={data.includedServices.join("\n")}
          onChange={(value) => onChange({ ...data, includedServices: value.split("\n").map((item) => item.trim()).filter(Boolean) })}
        />
        <div className="field full">
          <CheckLabel
            label="Lägg uttryckligen till Mediacleaning-dokumenten i samma PDF"
            checked={Boolean(data.includeMediacleaningDocuments)}
            disabled={!mediacleaningReady}
            onChange={(includeMediacleaningDocuments) =>
              onChange({ ...data, includeMediacleaningDocuments })
            }
          />
          <span className="field-hint">
            {mediacleaningReady
              ? "Valet är frivilligt. Utan markering skapas endast avtalet."
              : "Slutför Mediacleaning-steget först för att kunna kombinera dokumenten."}
          </span>
        </div>
      </FormSection>
    </>
  );
}
