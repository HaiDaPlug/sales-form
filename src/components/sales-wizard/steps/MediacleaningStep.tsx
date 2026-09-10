import { CheckLabel, FieldLabel, FormSection, ReadOnlyField, TextArea, TextField, type StepProps } from "@/components/sales-wizard/fields";
import { ContactPicker } from "@/components/sales-wizard/ContactPicker";
import { LookupBox } from "@/components/sales-wizard/LookupBox";
import { SupplierEditor } from "@/components/sales-wizard/SupplierEditor";
import { toggleDocumentType } from "@/components/sales-wizard/utils";
import type { MediacleaningStepData } from "@/lib/crm/types";
import type { SearchHit } from "@/lib/pipedrive/types";

export function MediacleaningStep({ data, onChange, sellerName }: StepProps<MediacleaningStepData>) {
  const hasOrganization = Boolean(String(data.organizationId ?? "").trim());
  const hasLead = Boolean(String(data.leadId ?? "").trim());
  const hasDeal = Boolean(String(data.dealId ?? "").trim());

  /**
   * Fills the customer fields from the Pipedrive record the seller picked, so
   * nothing that already exists there has to be retyped.
   */
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
        // Overwritten, not merged: these are the customer's real details, and
        // the seller picked this record precisely to use them.
        companyName: profile.name,
        organizationNumber: profile.organizationNumber ?? data.organizationNumber,
        address: profile.address ?? data.address,
        city: profile.city ?? data.city,
        leadId: "",
        dealId: "",
        signerPersonId: undefined,
        signerName: "",
        createOrganization: false
      });
    } catch {
      // The lookup already wrote the id and name; leaving the rest to the
      // seller is better than losing the selection over a failed fetch.
    }
  }

  function linkSale(hit: SearchHit, kind: "lead" | "deal") {
    const organizationId = hit.organizationId ?? data.organizationId;

    onChange({
      ...data,
      leadId: kind === "lead" ? String(hit.id) : "",
      dealId: kind === "deal" ? hit.id : "",
      organizationId,
      companyName: data.companyName || hit.organizationName || ""
    });

    // A sale names its customer, so the company details follow from it.
    if (organizationId && !data.companyName) void fillFromOrganization(organizationId);
  }

  return (
    <>
      <LookupBox
        title="Koppla befintlig organisation"
        endpoint="/api/pipedrive/organizations/search"
        selectedLabel={hasOrganization ? `${data.companyName || "Organisation"} (ID ${data.organizationId})` : undefined}
        onClear={() =>
          onChange({ ...data, organizationId: "", leadId: "", dealId: "", signerPersonId: undefined, signerName: "" })
        }
        onSelect={(hit) => void fillFromOrganization(hit.id)}
      />

      <LookupBox
        title="Koppla befintligt prospekt"
        endpoint="/api/pipedrive/leads/search"
        selectedLabel={hasLead ? `Prospekt ${data.leadId}` : undefined}
        onClear={() => onChange({ ...data, leadId: "" })}
        onSelect={(hit) => linkSale(hit, "lead")}
      />

      <LookupBox
        title="Koppla befintlig affär"
        endpoint="/api/pipedrive/deals/search"
        selectedLabel={hasDeal ? `Affär ${data.dealId}` : undefined}
        onClear={() => onChange({ ...data, dealId: "" })}
        onSelect={(hit) => linkSale(hit, "deal")}
      />

      {/* Mediacleaning never creates a sale, so a customer with neither a
          prospect nor a deal is normal — but they must exist as an organization. */}
      {!hasOrganization && (
        <div className="field full">
          <CheckLabel
            label="Ingen träff i Pipedrive — registrera kunden som ny organisation"
            checked={Boolean(data.createOrganization)}
            onChange={(createOrganization) => onChange({ ...data, createOrganization })}
          />
        </div>
      )}

      <p className="hint">{describeTarget(hasLead, hasDeal, hasOrganization, Boolean(data.createOrganization))}</p>

      <FormSection title="Kund och dokument">
        <TextField required label="Företagsnamn/kundnamn" value={data.companyName} onChange={(companyName) => onChange({ ...data, companyName })} />
        <TextField required label="Organisationsnummer/personnummer" value={data.organizationNumber} onChange={(organizationNumber) => onChange({ ...data, organizationNumber })} />
        <TextField required label="Adress" value={data.address} onChange={(address) => onChange({ ...data, address })} />
        <TextField required label="Ort" value={data.city} onChange={(city) => onChange({ ...data, city })} />
        <ReadOnlyField label="Säljare" value={`Inloggad som: ${sellerName}`} />

        {hasOrganization ? (
          <ContactPicker
            organizationId={data.organizationId}
            value={data.signerPersonId}
            onChange={(person) => onChange({ ...data, signerPersonId: person.id, signerName: person.name })}
          />
        ) : (
          // A customer being registered now has no people in Pipedrive yet, so
          // the signatory is typed and created with the organization.
          <TextField
            required
            className="full"
            label="Firmatecknare"
            value={data.signerName}
            onChange={(signerName) => onChange({ ...data, signerName })}
          />
        )}

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
        <span className="field-hint">
          Sparas som anteckning på det kopplade prospektet, annars på affären, annars på organisationen.
        </span>
      </FormSection>
    </>
  );
}

/** The seller must know where the PDF and the note will land before generating. */
function describeTarget(hasLead: boolean, hasDeal: boolean, hasOrganization: boolean, willCreate: boolean): string {
  const note = hasLead
    ? "anteckningen till prospektet"
    : hasDeal
      ? "anteckningen till affären"
      : "anteckningen till organisationen";

  if (hasOrganization) return `PDF:en laddas upp till organisationen och ${note}.`;
  if (willCreate) return `En ny organisation registreras, PDF:en laddas upp till den och ${note}. Ingen affär skapas.`;

  return "Koppla en organisation, eller registrera kunden som ny, innan dokumentet skapas.";
}
