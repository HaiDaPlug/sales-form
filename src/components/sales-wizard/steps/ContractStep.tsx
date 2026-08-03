import { FormSection, SelectField, TextArea, TextField, type StepProps } from "@/components/sales-wizard/fields";
import type { ContractStepData } from "@/lib/crm/types";

export function ContractStep({ data, onChange }: StepProps<ContractStepData>) {
  return (
    <>
      <FormSection title="Avtal">
        <TextField label="Företagsnamn" value={data.companyName} onChange={(companyName) => onChange({ ...data, companyName })} />
        <TextField label="Organisationsnummer" value={data.organizationNumber} onChange={(organizationNumber) => onChange({ ...data, organizationNumber })} />
        <TextField label="Firmatecknare/kontaktperson" value={data.signerName} onChange={(signerName) => onChange({ ...data, signerName })} />
        <TextField label="Adress" value={data.address} onChange={(address) => onChange({ ...data, address })} />
        <TextField label="Säljare ID" value={String(data.sellerId ?? "")} onChange={(sellerId) => onChange({ ...data, sellerId })} />
        <TextField label="Säljare namn" value={data.sellerName} onChange={(sellerName) => onChange({ ...data, sellerName })} />
        <TextField label="Pris/kostnad" type="number" value={String(data.price)} onChange={(price) => onChange({ ...data, price: Number(price) })} />
        <SelectField
          label="Betalningsintervall"
          value={data.paymentInterval}
          options={["monthly", "quarterly", "yearly"]}
          onChange={(paymentInterval) => onChange({ ...data, paymentInterval: paymentInterval as ContractStepData["paymentInterval"] })}
        />
        <TextField label="Bindningstid månader" type="number" value={String(data.bindingPeriodMonths)} onChange={(bindingPeriodMonths) => onChange({ ...data, bindingPeriodMonths: Number(bindingPeriodMonths) })} />
        <TextField label="Pipedrive organisation ID" value={String(data.organizationId ?? "")} onChange={(organizationId) => onChange({ ...data, organizationId })} />
        <TextField label="Pipedrive affär ID" value={String(data.dealId ?? "")} onChange={(dealId) => onChange({ ...data, dealId })} />
        <TextArea
          className="full"
          label="Inkluderade tjänster, en per rad"
          value={data.includedServices.join("\n")}
          onChange={(value) => onChange({ ...data, includedServices: value.split("\n").map((item) => item.trim()).filter(Boolean) })}
        />
      </FormSection>
    </>
  );
}
