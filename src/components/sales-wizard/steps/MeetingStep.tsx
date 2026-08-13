import { FormSection, ReferenceSelect, TextArea, TextField, type StepProps } from "@/components/sales-wizard/fields";
import { LookupBox } from "@/components/sales-wizard/LookupBox";
import type { MeetingStepData } from "@/lib/crm/types";

export function MeetingStep({ data, onChange, reference }: StepProps<MeetingStepData>) {
  return (
    <>
      <LookupBox
        title="Koppla befintlig person"
        endpoint="/api/pipedrive/persons/search"
        selectedLabel={data.person.id ? `${data.person.name} (ID ${data.person.id})` : undefined}
        onClear={() => onChange({ ...data, person: { ...data.person, id: undefined, organizationId: undefined } })}
        onSelect={(hit) =>
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
          })
        }
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
        <TextField label="Namn" value={data.person.name} onChange={(name) => onChange({ ...data, person: { ...data.person, name } })} />
        <TextField label="Telefon" value={data.person.phone} onChange={(phone) => onChange({ ...data, person: { ...data.person, phone } })} />
        <TextField label="E-post" value={data.person.email} onChange={(email) => onChange({ ...data, person: { ...data.person, email } })} />
        <TextField
          label="Organisation"
          value={data.organization?.name}
          onChange={(name) => onChange({ ...data, organization: { ...data.organization, name } })}
        />
      </FormSection>

      <FormSection title="Möte">
        <TextField label="Mötestyp" value={data.meetingType} onChange={(meetingType) => onChange({ ...data, meetingType })} />
        <ReferenceSelect
          label="Säljare"
          value={data.sellerId}
          options={reference.users}
          loading={reference.loading}
          error={reference.error}
          onChange={(sellerId) => onChange({ ...data, sellerId })}
        />
        <ReferenceSelect
          label="IT-tekniker"
          value={data.technicianId}
          options={reference.users}
          loading={reference.loading}
          error={reference.error}
          placeholder="Välj eller lämna tomt"
          onChange={(technicianId) => {
            const technician = reference.users.find((user) => String(user.id) === technicianId);
            onChange({ ...data, technicianId, technicianName: technician?.name ?? data.technicianName });
          }}
        />
        {/* Kept as free text: technicians may be external contacts rather than
            Pipedrive users, so a name must be enterable without a user record. */}
        <TextField
          label="IT-tekniker namn (om extern)"
          value={data.technicianName}
          onChange={(technicianName) => onChange({ ...data, technicianName })}
        />
        <TextField label="Datum" type="date" value={data.date} onChange={(date) => onChange({ ...data, date })} />
        <TextField label="Tid" type="time" value={data.time} onChange={(time) => onChange({ ...data, time })} />
        <TextField
          label="Längd minuter"
          type="number"
          value={String(data.durationMinutes)}
          onChange={(durationMinutes) => onChange({ ...data, durationMinutes: Number(durationMinutes) })}
        />
        <TextField label="Plats eller länk" value={data.locationOrLink} onChange={(locationOrLink) => onChange({ ...data, locationOrLink })} />
        <TextArea className="full" label="Agenda" value={data.agenda} onChange={(agenda) => onChange({ ...data, agenda })} />
        <TextArea
          className="full"
          label="Anteckningar till IT-tekniker"
          value={data.technicianNotes}
          onChange={(technicianNotes) => onChange({ ...data, technicianNotes })}
        />
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
