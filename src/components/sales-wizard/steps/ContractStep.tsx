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
import { fetchOrganizationProfile } from "@/components/sales-wizard/profiles";
import type { ContractStepData, CrmRecordId } from "@/lib/crm/types";
import { CONTRACT_TEMPLATES, DEFAULT_CONTRACT_TEMPLATE_ID } from "@/lib/pdf/templates/contract";
import type { SearchHit } from "@/lib/pipedrive/types";

export function ContractStep({
  data,
  onChange,
  sellerName,
  mediacleaningReady
}: StepProps<ContractStepData> & { mediacleaningReady: boolean }) {
  /**
   * Fills the customer fields from the record the seller picked. A failed
   * fetch keeps the link and leaves the rest to the seller.
   */
  async function fillFromOrganization(organizationId: CrmRecordId, base: ContractStepData = data) {
    const profile = await fetchOrganizationProfile(organizationId);
    if (!profile) return;

    onChange({
      ...base,
      organizationId,
      companyName: profile.name,
      organizationNumber: profile.organizationNumber ?? base.organizationNumber,
      // The contract prints one address line, so the city stays folded in.
      address: [profile.address, profile.city].filter(Boolean).join(", ") || base.address
    });
  }

  function linkOrganization(organizationId: CrmRecordId, name: string) {
    // A different organization means a different prospect and signatory.
    const linked: ContractStepData = {
      ...data,
      organizationId,
      companyName: name,
      leadId: "",
      dealId: "",
      signerPersonId: undefined,
      signerName: ""
    };

    onChange(linked);
    void fillFromOrganization(organizationId, linked);
  }

  /** Links a prospect and what it names: its organization, filled in, and its contact as signatory. */
  function linkProspect(hit: SearchHit) {
    const organizationId = hit.organizationId ?? data.organizationId;
    const changesOrganization = String(organizationId ?? "") !== String(data.organizationId ?? "");

    const linked: ContractStepData = {
      ...data,
      leadId: String(hit.id),
      dealId: "",
      organizationId,
      companyName: hit.organizationName ?? data.companyName,
      signerPersonId: hit.personId ?? (changesOrganization ? undefined : data.signerPersonId),
      signerName: hit.personName ?? (changesOrganization ? "" : data.signerName)
    };

    onChange(linked);

    if (organizationId) void fillFromOrganization(organizationId, linked);
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
        onSelect={(hit) => linkOrganization(hit.id, hit.name)}
      />
      <LookupBox
        title="Koppla befintligt prospekt"
        endpoint="/api/pipedrive/leads/search"
        selectedLabel={data.leadId ? `Prospekt ${data.leadId}` : undefined}
        onClear={() => onChange({ ...data, leadId: "" })}
        onSelect={linkProspect}
      />
      <p className="hint">
        Avtalet laddas upp till organisationen, som är där det skickas för signering med smart doc. Anteckningen
        kopplas till prospektet. Ingen affär skapas — försäljningen godkänns i Pipedrive efter kvalitetskontroll.
      </p>

      <FormSection title="Avtal">
        {/* Which agreement to print. The names and texts are placeholders
            until the client delivers their two templates; swapping them in is
            a change to the template file alone. */}
        <div className="field">
          <SelectField
            required
            label="Avtalstyp"
            value={data.templateId ?? DEFAULT_CONTRACT_TEMPLATE_ID}
            options={CONTRACT_TEMPLATES.map((template) => ({ value: template.id, label: template.label }))}
            onChange={(templateId) => onChange({ ...data, templateId: templateId as ContractStepData["templateId"] })}
          />
          <span className="field-hint">Avtalstexterna byts ut när kundens mallar har levererats.</span>
        </div>
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
