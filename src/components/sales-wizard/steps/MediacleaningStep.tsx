import { CheckLabel, FieldLabel, FormSection, TextArea, TextField, type StepProps } from "@/components/sales-wizard/fields";
import { LookupBox } from "@/components/sales-wizard/LookupBox";
import { SupplierEditor } from "@/components/sales-wizard/SupplierEditor";
import { toggleDocumentType } from "@/components/sales-wizard/utils";
import type { MediacleaningStepData } from "@/lib/crm/types";

export function MediacleaningStep({ data, onChange }: StepProps<MediacleaningStepData>) {
  const hasOrganization = Boolean(String(data.organizationId ?? "").trim());
  const hasDeal = Boolean(String(data.dealId ?? "").trim());

  return (
    <>
      <LookupBox
        title="Koppla befintlig organisation"
        endpoint="/api/pipedrive/organizations/search"
        selectedLabel={hasOrganization ? `Organisation ${data.organizationId}` : undefined}
        onClear={() => onChange({ ...data, organizationId: "", dealId: "" })}
        onSelect={(hit) =>
          onChange({
            ...data,
            organizationId: hit.id,
            companyName: data.companyName || hit.name,
            address: data.address || hit.address || "",
            // A deal chosen for the previous organization would no longer belong
            // to this one, so the pairing is cleared rather than left stale.
            dealId: "",
            createOrganization: false
          })
        }
      />

      <LookupBox
        title="Koppla befintlig affär för uppladdning"
        endpoint="/api/pipedrive/deals/search"
        selectedLabel={hasDeal ? `Affär ${data.dealId}` : undefined}
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

      {/* Mediacleaning never creates a deal, so the seller has to be able to
          finish with only an organization — or with a brand new one. */}
      {!hasOrganization && !hasDeal && (
        <div className="field full">
          <CheckLabel
            label="Ingen träff i Pipedrive — skapa ny organisation/kundpost"
            checked={Boolean(data.createOrganization)}
            onChange={(createOrganization) => onChange({ ...data, createOrganization })}
          />
        </div>
      )}

      <p className="hint">{describeTarget(hasDeal, hasOrganization, Boolean(data.createOrganization))}</p>

      <FormSection title="Kund och dokument">
        <TextField required label="Företagsnamn/kundnamn" value={data.companyName} onChange={(companyName) => onChange({ ...data, companyName })} />
        <TextField required label="Organisationsnummer/personnummer" value={data.organizationNumber} onChange={(organizationNumber) => onChange({ ...data, organizationNumber })} />
        <TextField required label="Adress" value={data.address} onChange={(address) => onChange({ ...data, address })} />
        <TextField required label="Ort" value={data.city} onChange={(city) => onChange({ ...data, city })} />
        <div className="field full">
          <FieldLabel label="Dokument" required />
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

      <SupplierEditor suppliers={data.suppliers ?? []} onChange={(suppliers) => onChange({ ...data, suppliers })} />
      <FormSection title="Intern kommentar">
        <TextArea className="full" label="Kommentar" value={data.internalComment} onChange={(internalComment) => onChange({ ...data, internalComment })} />
      </FormSection>
    </>
  );
}

/** The seller must know where the PDF will land before generating it. */
function describeTarget(hasDeal: boolean, hasOrganization: boolean, willCreate: boolean): string {
  if (hasDeal) return "PDF och anteckning kopplas till den valda affären.";
  if (hasOrganization) return "PDF och anteckning kopplas till den valda organisationen/kundposten.";
  if (willCreate) return "En ny organisation/kundpost skapas och dokumentet kopplas till den. Ingen affär skapas.";

  return "Ingen affär eller organisation vald — dokumentet laddas bara ner lokalt.";
}
