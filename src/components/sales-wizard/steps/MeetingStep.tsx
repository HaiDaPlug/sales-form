import { useState } from "react";
import { FormSection, ReadOnlyField, TextArea, TextField, type StepProps } from "@/components/sales-wizard/fields";
import { DateField } from "@/components/sales-wizard/DateField";
import { SlotPicker } from "@/components/sales-wizard/SlotPicker";
import { LookupBox, type ConflictChoice, type FieldConflict } from "@/components/sales-wizard/LookupBox";
import { SuggestionBox } from "@/components/sales-wizard/SuggestionBox";
import { describeOrganizationMatch, describePersonMatch, searchTerms } from "@/components/sales-wizard/matching";
import { fetchOrganizationProfile } from "@/components/sales-wizard/profiles";
import { findPersonConflicts } from "@/components/sales-wizard/utils";
import type { CrmRecordId, MeetingStepData } from "@/lib/crm/types";
import type { SearchHit } from "@/lib/pipedrive/types";

/** Shown under a name that belongs to a linked Pipedrive record. */
const LINKED_HINT = "Hämtat från Pipedrive. Koppla loss posten ovan för att ange en annan.";

export function MeetingStep({
  data,
  onChange,
  sellerName,
  slotRefreshToken
}: StepProps<MeetingStepData> & {
  /** Bumped when a booking is refused, so the picker re-reads the calendars. */
  slotRefreshToken: number;
}) {
  // Differences between the typed contact details and the linked record. Held
  // in the step rather than the wizard: they are resolved here and never submitted.
  const [conflicts, setConflicts] = useState<FieldConflict[]>([]);

  const personLinked = data.person.id !== undefined;
  const organizationLinked = data.organization?.id !== undefined;

  /**
   * A new organization is being registered as part of this booking. Its website
   * is required then, and only then — an existing record already has one, and a
   * meeting booked from contact details alone has no organization at all.
   */
  const registersNewOrganization = Boolean(data.organization?.name?.trim()) && !data.organization?.id;

  function resolveConflict(conflict: FieldConflict, choice: ConflictChoice) {
    // "Keep existing" already matches what the lookup wrote into the field, so
    // only "use entered" changes anything.
    if (choice === "useEntered") {
      onChange({ ...data, person: { ...data.person, [conflict.field]: conflict.enteredValue } });
    }

    setConflicts((current) => current.filter((item) => item.field !== conflict.field));
  }

  /**
   * Links an organization and fills the form from its record, so nothing
   * Pipedrive already knows — the organisationsnummer above all — is retyped.
   * The link shows at once; the details follow when the profile arrives.
   */
  async function linkOrganization(organizationId: CrmRecordId, name: string, base: MeetingStepData = data) {
    const linked: MeetingStepData = { ...base, organization: { ...base.organization, id: organizationId, name } };
    onChange(linked);

    const profile = await fetchOrganizationProfile(organizationId);
    if (!profile) return;

    onChange({
      ...linked,
      organization: {
        ...linked.organization,
        name: profile.name || name,
        organizationNumber: profile.organizationNumber ?? linked.organization?.organizationNumber,
        website: profile.website ?? linked.organization?.website,
        address: profile.address ?? linked.organization?.address,
        city: profile.city ?? linked.organization?.city
      }
    });
  }

  function linkPerson(hit: SearchHit) {
    // Recorded before the record's values overwrite the typed ones, so the
    // seller can still choose to keep what they entered.
    setConflicts(findPersonConflicts(data.person, hit));

    const withPerson: MeetingStepData = {
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

    // A contact that belongs to an organization brings it along, details and all.
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
        conflicts={conflicts}
        onResolveConflict={resolveConflict}
        onClear={() => {
          setConflicts([]);
          onChange({ ...data, person: { ...data.person, id: undefined, organizationId: undefined } });
        }}
        onSelect={linkPerson}
      />
      <LookupBox
        title="Koppla befintlig organisation"
        endpoint="/api/pipedrive/organizations/search"
        selectedLabel={organizationLinked ? `${data.organization?.name} (ID ${data.organization?.id})` : undefined}
        onClear={() => onChange({ ...data, organization: { ...data.organization, id: undefined } })}
        onSelect={(hit) => void linkOrganization(hit.id, hit.name)}
      />

      <FormSection title="Kontakt">
        {/* A linked record's name is its own; it stops being editable so the
            label on screen cannot drift from the id underneath. */}
        {personLinked ? (
          <ReadOnlyField label="Namn" value={data.person.name} hint={LINKED_HINT} />
        ) : (
          <TextField required label="Namn" value={data.person.name} onChange={(name) => onChange({ ...data, person: { ...data.person, name } })} />
        )}
        <TextField label="Telefon" value={data.person.phone} onChange={(phone) => onChange({ ...data, person: { ...data.person, phone } })} />
        <TextField label="E-post" value={data.person.email} onChange={(email) => onChange({ ...data, person: { ...data.person, email } })} />

        {/* A contact who has been saved before is offered as their details are
            typed, together with their organization. */}
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
          <ReadOnlyField label="Organisation" value={data.organization?.name ?? ""} hint={LINKED_HINT} />
        ) : (
          <TextField
            label="Organisation"
            value={data.organization?.name}
            onChange={(name) => onChange({ ...data, organization: { ...data.organization, name } })}
          />
        )}
        {/* Shown only while a new organization is being registered: the client
            requires a website for one, and an existing record already has its own. */}
        {registersNewOrganization && (
          <TextField
            required
            label="Webbadress"
            value={data.organization?.website}
            onChange={(website) => onChange({ ...data, organization: { ...data.organization, website } })}
          />
        )}
        <TextField
          label="Organisationsnummer/personnummer"
          value={data.organization?.organizationNumber}
          onChange={(organizationNumber) =>
            onChange({ ...data, organization: { ...data.organization, organizationNumber } })
          }
        />
        <TextField
          label="Adress"
          value={data.organization?.address}
          onChange={(address) => onChange({ ...data, organization: { ...data.organization, address } })}
        />

        {!organizationLinked && (
          <SuggestionBox
            title="Liknande organisationer finns i Pipedrive"
            endpoint="/api/pipedrive/organizations/search"
            terms={searchTerms(data.organization?.name, data.organization?.organizationNumber)}
            describe={(hit) => describeOrganizationMatch(data.organization ?? {}, hit)}
            onSelect={(hit) => void linkOrganization(hit.id, hit.name)}
          />
        )}
      </FormSection>

      <FormSection title="Möte">
        {/* Editable, with the standard agenda prefilled. */}
        <TextField label="Mötestyp" value={data.meetingType} onChange={(meetingType) => onChange({ ...data, meetingType })} />
        {/* The booking is made in the logged-in seller's name; the server
            attaches it, so there is nothing here to choose or edit. */}
        <ReadOnlyField label="Säljare" value={`Inloggad som: ${sellerName}`} />
        <DateField
          required
          label="Datum"
          value={data.date}
          disablePast
          onChange={(date) => onChange({ ...data, date, time: "" })}
        />
        <SlotPicker
          date={data.date}
          value={data.time}
          refreshToken={slotRefreshToken}
          onChange={(time) => onChange({ ...data, time })}
        />
        <TextField label="Plats eller länk" value={data.locationOrLink} onChange={(locationOrLink) => onChange({ ...data, locationOrLink })} />
        <TextArea
          className="full"
          label="Intern kommentar"
          value={data.internalComment}
          onChange={(internalComment) => onChange({ ...data, internalComment })}
        />
      </FormSection>
    </>
  );
}
