import { useState } from "react";
import { FormSection, ReadOnlyField, TextArea, TextField, type StepProps } from "@/components/sales-wizard/fields";
import { DateField } from "@/components/sales-wizard/DateField";
import { SlotPicker } from "@/components/sales-wizard/SlotPicker";
import { LookupBox, type ConflictChoice, type FieldConflict } from "@/components/sales-wizard/LookupBox";
import { findPersonConflicts } from "@/components/sales-wizard/utils";
import type { MeetingStepData } from "@/lib/crm/types";

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

  return (
    <>
      <LookupBox
        title="Koppla befintlig person"
        endpoint="/api/pipedrive/persons/search"
        selectedLabel={data.person.id ? `${data.person.name} (ID ${data.person.id})` : undefined}
        conflicts={conflicts}
        onResolveConflict={resolveConflict}
        onClear={() => {
          setConflicts([]);
          onChange({ ...data, person: { ...data.person, id: undefined, organizationId: undefined } });
        }}
        onSelect={(hit) => {
          // Recorded before the record's values overwrite the typed ones, so the
          // seller can still choose to keep what they entered.
          setConflicts(findPersonConflicts(data.person, hit));

          onChange({
            ...data,
            person: {
              ...data.person,
              id: hit.id,
              name: hit.name,
              email: hit.email ?? data.person.email,
              phone: hit.phone ?? data.person.phone,
              organizationId: hit.organizationId
            },
            organization: hit.organizationName
              ? { ...data.organization, id: hit.organizationId, name: hit.organizationName }
              : data.organization
          });
        }}
      />
      <LookupBox
        title="Koppla befintlig organisation"
        endpoint="/api/pipedrive/organizations/search"
        selectedLabel={data.organization?.id ? `${data.organization.name} (ID ${data.organization.id})` : undefined}
        onClear={() => onChange({ ...data, organization: { ...data.organization, id: undefined } })}
        onSelect={(hit) =>
          onChange({
            ...data,
            organization: { ...data.organization, id: hit.id, name: hit.name, address: hit.address }
          })
        }
      />

      <FormSection title="Kontakt">
        <TextField required label="Namn" value={data.person.name} onChange={(name) => onChange({ ...data, person: { ...data.person, name } })} />
        <TextField label="Telefon" value={data.person.phone} onChange={(phone) => onChange({ ...data, person: { ...data.person, phone } })} />
        <TextField label="E-post" value={data.person.email} onChange={(email) => onChange({ ...data, person: { ...data.person, email } })} />
        <TextField
          label="Organisation"
          value={data.organization?.name}
          onChange={(name) => onChange({ ...data, organization: { ...data.organization, name } })}
        />
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
