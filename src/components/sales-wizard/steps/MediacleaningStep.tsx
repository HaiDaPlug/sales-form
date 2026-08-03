import { CheckLabel, FormSection, TextArea, TextField, type StepProps } from "@/components/sales-wizard/fields";
import { LookupBox } from "@/components/sales-wizard/LookupBox";
import { SupplierEditor } from "@/components/sales-wizard/SupplierEditor";
import { toggleDocumentType } from "@/components/sales-wizard/utils";
import type { MediacleaningStepData } from "@/lib/crm/types";

export function MediacleaningStep({ data, onChange }: StepProps<MediacleaningStepData>) {
  return (
    <>
      <LookupBox title="Sök befintlig affär för uppladdning" endpoint="/api/pipedrive/deals/search" />
      <FormSection title="Kund och dokument">
        <TextField label="Företagsnamn" value={data.companyName} onChange={(companyName) => onChange({ ...data, companyName })} />
        <TextField label="Organisationsnummer" value={data.organizationNumber} onChange={(organizationNumber) => onChange({ ...data, organizationNumber })} />
        <TextField label="Adress" value={data.address} onChange={(address) => onChange({ ...data, address })} />
        <TextField label="Ort" value={data.city} onChange={(city) => onChange({ ...data, city })} />
        <TextField label="Pipedrive organisation ID" value={String(data.organizationId ?? "")} onChange={(organizationId) => onChange({ ...data, organizationId })} />
        <TextField label="Pipedrive affär ID" value={String(data.dealId ?? "")} onChange={(dealId) => onChange({ ...data, dealId })} />
        <div className="field full">
          <label>Dokument</label>
          <div className="checks">
            <CheckLabel
              label="Uppsägning"
              checked={data.documentTypes.includes("cancellation")}
              onChange={(checked) => toggleDocumentType(data, onChange, "cancellation", checked)}
            />
            <CheckLabel
              label="Avtalssammanfattning"
              checked={data.documentTypes.includes("agreementSummary")}
              onChange={(checked) => toggleDocumentType(data, onChange, "agreementSummary", checked)}
            />
          </div>
        </div>
      </FormSection>

      <SupplierEditor suppliers={data.suppliers} onChange={(suppliers) => onChange({ ...data, suppliers })} />
      <FormSection title="Intern kommentar">
        <TextArea className="full" label="Kommentar" value={data.internalComment} onChange={(internalComment) => onChange({ ...data, internalComment })} />
      </FormSection>
    </>
  );
}
