import { FormSection, TextArea, TextField, type StepProps } from "@/components/sales-wizard/fields";
import { LookupBox } from "@/components/sales-wizard/LookupBox";
import type { MeetingStepData } from "@/lib/crm/types";

export function MeetingStep({ data, onChange }: StepProps<MeetingStepData>) {
  return (
    <>
      <LookupBox title="Sök befintlig person" endpoint="/api/pipedrive/persons/search" />
      <LookupBox title="Sök befintlig organisation" endpoint="/api/pipedrive/organizations/search" />

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
        <TextField label="Säljare ID" value={String(data.sellerId ?? "")} onChange={(sellerId) => onChange({ ...data, sellerId })} />
        <TextField label="IT-tekniker ID" value={String(data.technicianId ?? "")} onChange={(technicianId) => onChange({ ...data, technicianId })} />
        <TextField label="IT-tekniker namn" value={data.technicianName} onChange={(technicianName) => onChange({ ...data, technicianName })} />
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
