import {
  CheckLabel,
  FormSection,
  ReferenceSelect,
  SelectField,
  TextArea,
  TextField,
  type StepProps
} from "@/components/sales-wizard/fields";
import { LookupBox } from "@/components/sales-wizard/LookupBox";
import type { ContractStepData } from "@/lib/crm/types";

export function ContractStep({
  data,
  onChange,
  reference,
  mediacleaningReady
}: StepProps<ContractStepData> & { mediacleaningReady: boolean }) {
  return (
    <>
      <LookupBox
        title="Koppla befintlig organisation"
        endpoint="/api/pipedrive/organizations/search"
        selectedLabel={data.organizationId ? `Organisation ${data.organizationId}` : undefined}
        onClear={() => onChange({ ...data, organizationId: "", dealId: "" })}
        onSelect={(hit) =>
          onChange({
            ...data,
            organizationId: hit.id,
            dealId: "",
            companyName: data.companyName || hit.name,
            address: data.address || hit.address || ""
          })
        }
      />
      <LookupBox
        title="Koppla befintlig affär för uppladdning"
        endpoint="/api/pipedrive/deals/search"
        selectedLabel={data.dealId ? `Affär ${data.dealId}` : undefined}
        onClear={() => onChange({ ...data, dealId: "" })}
        onSelect={(hit) =>
          onChange({
            ...data,
            dealId: hit.id,
            organizationId: hit.organizationId ?? data.organizationId,
            companyName: data.companyName || hit.organizationName || ""
          })
        }
      />
      <p className="hint">
        PDF och anteckning kopplas i första hand till vald affär, annars till vald organisation.
      </p>

      <FormSection title="Avtal">
        <TextField label="Företagsnamn" value={data.companyName} onChange={(companyName) => onChange({ ...data, companyName })} />
        <TextField label="Organisationsnummer" value={data.organizationNumber} onChange={(organizationNumber) => onChange({ ...data, organizationNumber })} />
        <TextField label="Firmatecknare/kontaktperson" value={data.signerName} onChange={(signerName) => onChange({ ...data, signerName })} />
        <TextField label="Adress" value={data.address} onChange={(address) => onChange({ ...data, address })} />
        <ReferenceSelect
          label="Säljare"
          value={data.sellerId}
          options={reference.users}
          loading={reference.loading}
          error={reference.error}
          onChange={(sellerId) => {
            // The contract prints the seller's name, so keep it in sync.
            const seller = reference.users.find((user) => String(user.id) === sellerId);
            onChange({ ...data, sellerId, sellerName: seller?.name ?? data.sellerName });
          }}
        />
        <TextField label="Säljare namn" value={data.sellerName} onChange={(sellerName) => onChange({ ...data, sellerName })} />
        <TextField label="Pris/kostnad" type="number" value={String(data.price)} onChange={(price) => onChange({ ...data, price: Number(price) })} />
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
        <TextField label="Bindningstid månader" type="number" value={String(data.bindingPeriodMonths)} onChange={(bindingPeriodMonths) => onChange({ ...data, bindingPeriodMonths: Number(bindingPeriodMonths) })} />
        <TextArea
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
