import { useMemo } from "react";
import { CheckLabel, FormSection, ReferenceSelect, SelectField, TextArea, TextField, type StepProps } from "@/components/sales-wizard/fields";
import { DateField } from "@/components/sales-wizard/DateField";
import { LookupBox } from "@/components/sales-wizard/LookupBox";
import type { DealStepData } from "@/lib/crm/types";

export function DealStep({ data, onChange, reference }: StepProps<DealStepData>) {
  const isIndividual = data.organization.customerType === "individual";

  // Stages are fetched for every pipeline; narrow them to the selected one.
  const stagesForPipeline = useMemo(() => {
    const pipelineId = data.deal.pipelineId;
    if (!pipelineId) return [];

    return reference.stages.filter((stage) => String(stage.pipelineId) === String(pipelineId));
  }, [data.deal.pipelineId, reference.stages]);

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
            }
          })
        }
      />
      <LookupBox
        title="Koppla befintlig organisation"
        endpoint="/api/pipedrive/organizations/search"
        selectedLabel={data.organization.id ? `${data.organization.name} (ID ${data.organization.id})` : undefined}
        onClear={() => onChange({ ...data, organization: { ...data.organization, id: undefined } })}
        onSelect={(hit) =>
          onChange({
            ...data,
            organization: {
              ...data.organization,
              id: hit.id,
              name: hit.name,
              address: hit.address ?? data.organization.address
            }
          })
        }
      />

      <p className="hint">
        Utan vald post skapas en ny person och organisation i Pipedrive, och affären kopplas till dem.
      </p>

      <FormSection title="Kontakt och organisation">
        <TextField required label="Kontaktperson" value={data.person.name} onChange={(name) => onChange({ ...data, person: { ...data.person, name } })} />
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
            onChange({ ...data, person: { ...data.person, phoneType: phoneType as DealStepData["person"]["phoneType"] } })
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
            onChange({ ...data, person: { ...data.person, emailType: emailType as DealStepData["person"]["emailType"] } })
          }
        />
        <TextField
          required
          label={isIndividual ? "Kundnamn" : "Organisation"}
          value={data.organization.name}
          onChange={(name) => onChange({ ...data, organization: { ...data.organization, name } })}
        />
        <TextField
          required
          label="Webbplats"
          value={data.organization.website}
          onChange={(website) => onChange({ ...data, organization: { ...data.organization, website } })}
        />
        <div className="field full">
          <CheckLabel
            label="Privatperson eller enskild firma (personnummer används som organisationsnummer)"
            checked={isIndividual}
            onChange={(checked) =>
              onChange({
                ...data,
                organization: { ...data.organization, customerType: checked ? "individual" : "company" }
              })
            }
          />
        </div>
        <TextField
          required
          label={isIndividual ? "Personnummer" : "Organisationsnummer"}
          value={data.organization.organizationNumber}
          onChange={(organizationNumber) => onChange({ ...data, organization: { ...data.organization, organizationNumber } })}
        />
        <TextField
          required
          className="full"
          label="Adress"
          value={data.organization.address}
          onChange={(address) => onChange({ ...data, organization: { ...data.organization, address } })}
        />
      </FormSection>

      <FormSection title="Affär">
        <TextField required label="Affärstitel" value={data.deal.title} onChange={(title) => onChange({ ...data, deal: { ...data.deal, title } })} />
        <TextField label="Värde" type="number" value={String(data.deal.value ?? 0)} onChange={(value) => onChange({ ...data, deal: { ...data.deal, value: Number(value) } })} />
        <SelectField
          label="Valuta"
          value={data.deal.currency ?? "SEK"}
          options={["SEK", "EUR", "USD"]}
          onChange={(currency) => onChange({ ...data, deal: { ...data.deal, currency: currency as DealStepData["deal"]["currency"] } })}
        />
        <ReferenceSelect
          required
          label="Pipeline"
          value={data.deal.pipelineId}
          options={reference.pipelines}
          loading={reference.loading}
          error={reference.error}
          onChange={(pipelineId) =>
            // Changing pipeline invalidates the stage: stages belong to one
            // pipeline, so keeping the old one would send a mismatched pair.
            onChange({ ...data, deal: { ...data.deal, pipelineId, stageId: "" } })
          }
        />
        <ReferenceSelect
          label="Steg"
          value={data.deal.stageId}
          options={stagesForPipeline}
          loading={reference.loading}
          error={reference.error}
          disabledHint={data.deal.pipelineId ? undefined : "Välj pipeline först"}
          placeholder="Första steget i pipelinen"
          onChange={(stageId) => onChange({ ...data, deal: { ...data.deal, stageId } })}
        />
        <ReferenceSelect
          required
          label="Säljare"
          value={data.sellerId}
          options={reference.sellers}
          loading={reference.loading}
          error={reference.error}
          onChange={(sellerId) => onChange({ ...data, sellerId })}
        />
        <TextArea required className="full" label="Viktigast för kunden" value={data.viktigastForKunden} onChange={(viktigastForKunden) => onChange({ ...data, viktigastForKunden })} />
        <DateField required label="Faktura start" value={data.fakturaStart} onChange={(fakturaStart) => onChange({ ...data, fakturaStart })} />
        <TextField required label="Fakturagrupp" value={data.fakturagrupp} onChange={(fakturagrupp) => onChange({ ...data, fakturagrupp })} />
        <TextField label="Avtalslängd månader" type="number" value={String(data.contractLengthMonths ?? "")} onChange={(contractLengthMonths) => onChange({ ...data, contractLengthMonths: Number(contractLengthMonths) })} />
        <DateField label="Avtalsstart" value={data.contractStartDate} onChange={(contractStartDate) => onChange({ ...data, contractStartDate })} />
        <TextField label="Månadskostnad" type="number" value={String(data.monthlyCost ?? 0)} onChange={(monthlyCost) => onChange({ ...data, monthlyCost: Number(monthlyCost) })} />
        <TextField label="Startavgift" type="number" value={String(data.startFee ?? 0)} onChange={(startFee) => onChange({ ...data, startFee: Number(startFee) })} />
        <TextField label="Totalt affärsvärde" type="number" value={String(data.totalDealValue ?? 0)} onChange={(totalDealValue) => onChange({ ...data, totalDealValue: Number(totalDealValue) })} />
        <TextField label="Bindningstid månader" type="number" value={String(data.bindingPeriodMonths ?? 0)} onChange={(bindingPeriodMonths) => onChange({ ...data, bindingPeriodMonths: Number(bindingPeriodMonths) })} />
        <TextField label="Uppsägningstid månader" type="number" value={String(data.cancellationPeriodMonths ?? 0)} onChange={(cancellationPeriodMonths) => onChange({ ...data, cancellationPeriodMonths: Number(cancellationPeriodMonths) })} />
      </FormSection>
    </>
  );
}
