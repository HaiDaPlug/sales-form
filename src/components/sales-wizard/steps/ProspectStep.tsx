import {
  FieldLabel,
  FormSection,
  ReadOnlyField,
  SelectField,
  TextArea,
  TextField,
  type StepProps
} from "@/components/sales-wizard/fields";
import { DateField } from "@/components/sales-wizard/DateField";
import { LookupBox } from "@/components/sales-wizard/LookupBox";
import { SuggestionBox } from "@/components/sales-wizard/SuggestionBox";
import { describeOrganizationMatch, describePersonMatch, searchTerms } from "@/components/sales-wizard/matching";
import { fetchOrganizationProfile } from "@/components/sales-wizard/profiles";
import { prospectTitle } from "@/lib/crm/prospect";
import type { CrmRecordId, ProspectStepData } from "@/lib/crm/types";
import type { SearchHit } from "@/lib/pipedrive/types";

/** Recordings of sales calls. The server enforces the same list and the size cap. */
export const AUDIO_ACCEPT = "audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/ogg,.mp3,.m4a,.wav,.ogg";

/** Shown under a name that belongs to a linked Pipedrive record. */
const LINKED_HINT = "Hämtat från Pipedrive. Koppla loss posten ovan för att ange en annan.";

export function ProspectStep({
  data,
  onChange,
  reference,
  sellerName,
  audioFile,
  onAudioFileChange
}: StepProps<ProspectStepData> & {
  /** Held outside the step data: a File is not JSON and is uploaded separately. */
  audioFile: File | null;
  onAudioFileChange: (file: File | null) => void;
}) {
  const organizationName = data.organization.name.trim();
  const personLinked = data.person.id !== undefined;
  const organizationLinked = data.organization.id !== undefined;

  /**
   * Links an organization and fills the form from its record.
   *
   * The name and id are written at once so the link shows immediately; the
   * rest follows when the profile arrives. Values Pipedrive holds replace what
   * was typed — the seller picked this record to use its details — while a
   * blank in Pipedrive keeps whatever the seller had entered.
   */
  async function linkOrganization(organizationId: CrmRecordId, name: string, base: ProspectStepData = data) {
    const linked: ProspectStepData = { ...base, organization: { ...base.organization, id: organizationId, name } };
    onChange(linked);

    const profile = await fetchOrganizationProfile(organizationId);
    if (!profile) return;

    onChange({
      ...linked,
      organization: {
        ...linked.organization,
        name: profile.name || name,
        organizationNumber: profile.organizationNumber ?? linked.organization.organizationNumber,
        website: profile.website ?? linked.organization.website,
        address: profile.address ?? linked.organization.address,
        city: profile.city ?? linked.organization.city
      }
    });
  }

  /** Links a contact and, when Pipedrive knows their organization, that too. */
  function linkPerson(hit: SearchHit) {
    const withPerson: ProspectStepData = {
      ...data,
      person: {
        ...data.person,
        id: hit.id,
        name: hit.name,
        email: hit.email ?? data.person.email,
        phone: hit.phone ?? data.person.phone,
        organizationId: hit.organizationId
      }
    };

    if (hit.organizationId !== undefined && hit.organizationName) {
      void linkOrganization(hit.organizationId, hit.organizationName, withPerson);
    } else {
      onChange(withPerson);
    }
  }

  return (
    <>
      <LookupBox
        title="Koppla befintlig person"
        endpoint="/api/pipedrive/persons/search"
        selectedLabel={personLinked ? `${data.person.name} (ID ${data.person.id})` : undefined}
        onClear={() => onChange({ ...data, person: { ...data.person, id: undefined, organizationId: undefined } })}
        onSelect={linkPerson}
      />
      <LookupBox
        title="Koppla befintlig organisation"
        endpoint="/api/pipedrive/organizations/search"
        selectedLabel={organizationLinked ? `${data.organization.name} (ID ${data.organization.id})` : undefined}
        onClear={() => onChange({ ...data, organization: { ...data.organization, id: undefined } })}
        onSelect={(hit) => void linkOrganization(hit.id, hit.name)}
      />

      <p className="hint">
        Utan vald post skapas en ny person och organisation i Pipedrive, och prospektet kopplas till dem.
      </p>

      <FormSection title="Kontakt och organisation">
        {/* The name is the linked record's own once one is chosen. Editing it
            while linked is what put "Falafel AB" on Kebab AB's record: the
            label changed, the id underneath did not. */}
        {personLinked ? (
          <ReadOnlyField label="Kontaktperson" value={data.person.name} hint={LINKED_HINT} />
        ) : (
          <TextField required label="Kontaktperson" value={data.person.name} onChange={(name) => onChange({ ...data, person: { ...data.person, name } })} />
        )}
        <TextField required label="Telefon" value={data.person.phone} onChange={(phone) => onChange({ ...data, person: { ...data.person, phone } })} />
        <SelectField
          label="Typ av telefonnummer"
          value={data.person.phoneType ?? "work"}
          options={[
            { value: "work", label: "Arbete" },
            { value: "mobile", label: "Mobil" },
            { value: "other", label: "Annat" }
          ]}
          onChange={(phoneType) =>
            onChange({ ...data, person: { ...data.person, phoneType: phoneType as ProspectStepData["person"]["phoneType"] } })
          }
        />
        <TextField required label="E-post" value={data.person.email} onChange={(email) => onChange({ ...data, person: { ...data.person, email } })} />
        <SelectField
          label="Typ av e-postadress"
          value={data.person.emailType ?? "work"}
          options={[
            { value: "work", label: "Arbete" },
            { value: "private", label: "Privat" },
            { value: "other", label: "Annat" }
          ]}
          onChange={(emailType) =>
            onChange({ ...data, person: { ...data.person, emailType: emailType as ProspectStepData["person"]["emailType"] } })
          }
        />

        {/* Offered as the contact is typed, so a customer who already exists is
            found without the seller having to think to search. */}
        {!personLinked && (
          <SuggestionBox
            title="Liknande kontakter finns i Pipedrive"
            endpoint="/api/pipedrive/persons/search"
            terms={searchTerms(data.person.name, data.person.email, data.person.phone)}
            describe={(hit) => describePersonMatch(data.person, hit)}
            onSelect={linkPerson}
          />
        )}

        {organizationLinked ? (
          <ReadOnlyField label="Organisation" value={data.organization.name} hint={LINKED_HINT} />
        ) : (
          <TextField
            required
            label="Organisation"
            value={data.organization.name}
            onChange={(name) => onChange({ ...data, organization: { ...data.organization, name } })}
          />
        )}
        <TextField
          required
          label="Webbplats"
          value={data.organization.website}
          onChange={(website) => onChange({ ...data, organization: { ...data.organization, website } })}
        />
        <div className="field">
          <TextField
            required
            label="Organisationsnummer"
            value={data.organization.organizationNumber}
            onChange={(organizationNumber) => onChange({ ...data, organization: { ...data.organization, organizationNumber } })}
          />
          {/* One field, both shapes: a private individual or sole trader gives
              their personnummer here and is handled exactly like a company. */}
          <span className="field-hint">Organisationsnummer eller personnummer, i samma fält.</span>
        </div>
        <TextField
          label="Ort"
          value={data.organization.city}
          onChange={(city) => onChange({ ...data, organization: { ...data.organization, city } })}
        />
        <TextField
          required
          className="full"
          label="Adress"
          value={data.organization.address}
          onChange={(address) => onChange({ ...data, organization: { ...data.organization, address } })}
        />

        {!organizationLinked && (
          <SuggestionBox
            title="Liknande organisationer finns i Pipedrive"
            endpoint="/api/pipedrive/organizations/search"
            terms={searchTerms(data.organization.name, data.organization.organizationNumber)}
            describe={(hit) => describeOrganizationMatch(data.organization, hit)}
            onSelect={(hit) => void linkOrganization(hit.id, hit.name)}
          />
        )}
      </FormSection>

      <FormSection title="Prospekt">
        {/* Derived, never typed: it follows the organization name as it is
            entered or picked, exactly as the client asked. */}
        <ReadOnlyField
          label="Prospekttitel"
          value={organizationName ? prospectTitle(organizationName) : "Fyll i organisationens namn"}
        />
        <ReadOnlyField label="Säljare" value={`Inloggad som: ${sellerName}`} />
        <TextField label="Värde" type="number" value={String(data.value ?? 0)} onChange={(value) => onChange({ ...data, value: Number(value) })} />
        <SelectField
          label="Valuta"
          value={data.currency ?? "SEK"}
          options={["SEK", "EUR", "USD"]}
          onChange={(currency) => onChange({ ...data, currency: currency as ProspectStepData["currency"] })}
        />
        <TextArea required className="full" label="Viktigast för kunden" value={data.viktigastForKunden} onChange={(viktigastForKunden) => onChange({ ...data, viktigastForKunden })} />
        <DateField required label="Faktura/avtal start" value={data.fakturaAvtalStart} onChange={(fakturaAvtalStart) => onChange({ ...data, fakturaAvtalStart })} />
        {/* A single-option field in Pipedrive: the label has to match an
            existing option exactly, so it is picked rather than typed. The
            options carry their labels as values — the server resolves the
            label to the option id Pipedrive requires. An unreadable list
            falls back to free text rather than leaving a dead field. */}
        {reference.invoiceGroups.length > 0 ? (
          <SelectField
            required
            label="Fakturagrupp"
            value={data.fakturagrupp}
            options={[
              { value: "", label: reference.loading ? "Hämtar..." : "Välj fakturagrupp..." },
              ...reference.invoiceGroups.map((group) => ({ value: group.name, label: group.name }))
            ]}
            onChange={(fakturagrupp) => onChange({ ...data, fakturagrupp })}
          />
        ) : (
          <TextField
            required
            label="Fakturagrupp"
            value={data.fakturagrupp}
            onChange={(fakturagrupp) => onChange({ ...data, fakturagrupp })}
          />
        )}
        <TextField label="Avtalslängd månader" type="number" value={String(data.contractLengthMonths ?? "")} onChange={(contractLengthMonths) => onChange({ ...data, contractLengthMonths: Number(contractLengthMonths) })} />
        <TextField label="Bindningstid månader" type="number" value={String(data.bindingPeriodMonths ?? 0)} onChange={(bindingPeriodMonths) => onChange({ ...data, bindingPeriodMonths: Number(bindingPeriodMonths) })} />
        <TextField label="Månadskostnad" type="number" value={String(data.monthlyCost ?? 0)} onChange={(monthlyCost) => onChange({ ...data, monthlyCost: Number(monthlyCost) })} />
        <TextField label="Startavgift" type="number" value={String(data.startFee ?? 0)} onChange={(startFee) => onChange({ ...data, startFee: Number(startFee) })} />
        <TextField label="Totalt affärsvärde" type="number" value={String(data.totalDealValue ?? 0)} onChange={(totalDealValue) => onChange({ ...data, totalDealValue: Number(totalDealValue) })} />
      </FormSection>

      <FormSection title="Underlag för kvalitetskontroll">
        <div className="field full">
          <FieldLabel label="Underlag" required />
          <div className="checks" role="radiogroup" aria-label="Underlag">
            <label className="check">
              <input
                type="radio"
                name="evidenceMethod"
                value="audio"
                checked={data.evidenceMethod === "audio"}
                onChange={() => onChange({ ...data, evidenceMethod: "audio" })}
              />
              Ljudfil från säljsamtalet
            </label>
            <label className="check">
              <input
                type="radio"
                name="evidenceMethod"
                value="signature"
                checked={data.evidenceMethod === "signature"}
                onChange={() => {
                  onAudioFileChange(null);
                  onChange({ ...data, evidenceMethod: "signature" });
                }}
              />
              Digital signering av avtal
            </label>
          </div>
          <span className="field-hint">
            En ljudfil ersätter digital signering. Godkännande och konvertering till affär görs i Pipedrive efter
            kvalitetskontroll — aldrig här.
          </span>
        </div>

        {data.evidenceMethod === "audio" && (
          <div className="field full">
            <FieldLabel label="Ljudfil" required htmlFor="prospect-audio" />
            <input
              id="prospect-audio"
              type="file"
              accept={AUDIO_ACCEPT}
              aria-required="true"
              onChange={(event) => onAudioFileChange(event.target.files?.[0] ?? null)}
            />
            <span className="field-hint">
              {audioFile
                ? `${audioFile.name} (${formatFileSize(audioFile.size)}) laddas upp till prospektet när det skapas.`
                : "mp3, m4a, wav eller ogg. Statusen Ljudfil uppladdad sätts först när uppladdningen är klar."}
            </span>
          </div>
        )}

        {data.evidenceMethod === "signature" && (
          <p className="hint">
            Prospektet får statusen Digital signering krävs. Avtalet skapas i steget Avtalsgenerering och skickas för
            signering från organisationen i Pipedrive.
          </p>
        )}
      </FormSection>
    </>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
