import { CheckLabel, FieldLabel, FormSection, ReadOnlyField, TextArea, TextField, type StepProps } from "@/components/sales-wizard/fields";
// CheckLabel stays in use for the "register as new organization" choice.
import { ContactPicker } from "@/components/sales-wizard/ContactPicker";
import { LookupBox } from "@/components/sales-wizard/LookupBox";
import { SupplierEditor } from "@/components/sales-wizard/SupplierEditor";
import { fetchOrganizationProfile } from "@/components/sales-wizard/profiles";
import type { CrmRecordId, MediacleaningStepData } from "@/lib/crm/types";
import type { SearchHit } from "@/lib/pipedrive/types";

export function MediacleaningStep({ data, onChange, sellerName }: StepProps<MediacleaningStepData>) {
  const hasOrganization = Boolean(String(data.organizationId ?? "").trim());
  const hasLead = Boolean(String(data.leadId ?? "").trim());
  const hasDeal = Boolean(String(data.dealId ?? "").trim());

  /**
   * Fills the customer fields from the Pipedrive record the seller picked, so
   * nothing that already exists there has to be retyped.
   *
   * Overwritten, not merged: these are the customer's real details, and the
   * seller picked this record precisely to use them. A failed fetch keeps the
   * link and leaves the rest to the seller.
   */
  async function fillFromOrganization(organizationId: CrmRecordId, base: MediacleaningStepData = data) {
    const profile = await fetchOrganizationProfile(organizationId);
    if (!profile) return;

    onChange({
      ...base,
      organizationId,
      companyName: profile.name,
      organizationNumber: profile.organizationNumber ?? base.organizationNumber,
      address: profile.address ?? base.address,
      city: profile.city ?? base.city,
      createOrganization: false
    });
  }

  function linkOrganization(organizationId: CrmRecordId, name: string) {
    // A different organization means a different sale and signatory.
    const linked: MediacleaningStepData = {
      ...data,
      organizationId,
      companyName: name,
      leadId: "",
      dealId: "",
      signerPersonId: undefined,
      signerName: "",
      createOrganization: false
    };

    onChange(linked);
    void fillFromOrganization(organizationId, linked);
  }

  /**
   * Links a prospect or deal and everything it already names: its organization,
   * filled from the record, and its contact as the signatory.
   */
  function linkSale(hit: SearchHit, kind: "lead" | "deal") {
    const organizationId = hit.organizationId ?? data.organizationId;
    const changesOrganization = String(organizationId ?? "") !== String(data.organizationId ?? "");

    const linked: MediacleaningStepData = {
      ...data,
      leadId: kind === "lead" ? String(hit.id) : "",
      dealId: kind === "deal" ? hit.id : "",
      organizationId,
      companyName: hit.organizationName ?? data.companyName,
      signerPersonId: hit.personId ?? (changesOrganization ? undefined : data.signerPersonId),
      signerName: hit.personName ?? (changesOrganization ? "" : data.signerName),
      createOrganization: false
    };

    onChange(linked);

    if (organizationId) void fillFromOrganization(organizationId, linked);
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
        onSelect={(hit) => linkOrganization(hit.id, hit.name)}
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

        {/* One document, always the same shape: a cancellation letter per
            supplier, followed by the "Uppsägningar" summary page. The client
            asked for the summary to be part of every delivery, so there is
            nothing left to tick. */}
        <div className="field full">
          <FieldLabel label="Dokument" />
          <span className="field-hint">
            Ett uppsägningsbrev per leverantör nedan, samt sammanställningen Uppsägningar. Filen namnges efter
            kunden.
          </span>
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
