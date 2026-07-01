"use client";

import { useMemo, useState } from "react";
import { ZodError, ZodSchema } from "zod";
import {
  contractStepSchema,
  dealStepSchema,
  mediacleaningStepSchema,
  meetingStepSchema
} from "@/lib/crm/schemas";
import type {
  ContractStepData,
  DealStepData,
  MediacleaningStepData,
  MeetingStepData,
  SubmitState,
  SupplierSelection,
  WizardData
} from "@/lib/crm/types";

const steps = ["Mötesbokning", "Skapa affär", "Mediacleaning", "Avtalsgenerering"];

const initialMeeting: MeetingStepData = {
  person: { name: "", phone: "", phoneType: "mobile", email: "", emailType: "work" },
  organization: { name: "", website: "", address: "", city: "", organizationNumber: "" },
  meetingType: "IT-genomgång",
  agenda: "",
  technicianNotes: "",
  internalComment: "",
  sellerId: "",
  technicianId: "",
  technicianName: "",
  date: "",
  time: "",
  durationMinutes: 60,
  locationOrLink: ""
};

const initialDeal: DealStepData = {
  person: { name: "", phone: "", phoneType: "mobile", email: "", emailType: "work" },
  organization: { name: "", website: "", address: "", city: "", organizationNumber: "" },
  deal: { title: "", value: 0, currency: "SEK", pipelineId: "", stageId: "" },
  sellerId: "",
  viktigastForKunden: "",
  fakturaStart: "",
  fakturagrupp: "",
  contractLengthMonths: 12,
  contractStartDate: "",
  monthlyCost: 0,
  startFee: 0,
  totalDealValue: 0,
  bindingPeriodMonths: 12,
  cancellationPeriodMonths: 3
};

const initialMediacleaning: MediacleaningStepData = {
  companyName: "",
  organizationNumber: "",
  address: "",
  city: "",
  documentTypes: [],
  suppliers: [],
  internalComment: "",
  organizationId: "",
  dealId: ""
};

const initialContract: ContractStepData = {
  companyName: "",
  organizationNumber: "",
  signerName: "",
  address: "",
  sellerId: "",
  sellerName: "",
  price: 0,
  paymentInterval: "monthly",
  bindingPeriodMonths: 12,
  includedServices: ["Digital Kontakt"],
  organizationId: "",
  dealId: ""
};

export function SalesWizard() {
  const [activeStep, setActiveStep] = useState(0);
  const [wizardData, setWizardData] = useState<WizardData>({});
  const [meeting, setMeeting] = useState(initialMeeting);
  const [deal, setDeal] = useState(initialDeal);
  const [mediacleaning, setMediacleaning] = useState(initialMediacleaning);
  const [contract, setContract] = useState(initialContract);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });

  const summary = useMemo(
    () => ({
      customer:
        deal.organization.name ||
        meeting.organization?.name ||
        mediacleaning.companyName ||
        contract.companyName ||
        "Ej valt",
      person: deal.person.name || meeting.person.name || contract.signerName || "Ej valt",
      deal: deal.deal.title || "Ingen affär skapad",
      target: mediacleaning.dealId || contract.dealId ? "Affär" : "Organisation först"
    }),
    [contract.companyName, contract.dealId, contract.signerName, deal, mediacleaning.companyName, mediacleaning.dealId, meeting]
  );

  function resetFeedback() {
    setErrors([]);
    setSubmitState({ status: "idle" });
  }

  function goToStep(index: number) {
    resetFeedback();
    hydrateStepFromPrevious(index);
    setActiveStep(index);
  }

  function hydrateStepFromPrevious(index: number) {
    if (index === 1) {
      setDeal((current) => ({
        ...current,
        person: { ...current.person, ...meeting.person },
        organization: { ...current.organization, ...meeting.organization },
        sellerId: current.sellerId || meeting.sellerId,
        viktigastForKunden: current.viktigastForKunden || meeting.internalComment,
        deal: {
          ...current.deal,
          title: current.deal.title || `${meeting.organization?.name || meeting.person.name} - Digital Kontakt`
        }
      }));
    }

    if (index === 2) {
      setMediacleaning((current) => ({
        ...current,
        companyName: current.companyName || deal.organization.name || meeting.organization?.name || "",
        organizationNumber: current.organizationNumber || deal.organization.organizationNumber || "",
        address: current.address || deal.organization.address || meeting.organization?.address || "",
        city: current.city || deal.organization.city || meeting.organization?.city || "",
        organizationId: current.organizationId || String(deal.organization.id ?? meeting.organization?.id ?? ""),
        dealId: current.dealId || String(deal.deal.id ?? "")
      }));
    }

    if (index === 3) {
      setContract((current) => ({
        ...current,
        companyName: current.companyName || deal.organization.name || mediacleaning.companyName,
        organizationNumber: current.organizationNumber || deal.organization.organizationNumber || mediacleaning.organizationNumber,
        signerName: current.signerName || deal.person.name || meeting.person.name,
        address: current.address || deal.organization.address || mediacleaning.address,
        sellerId: current.sellerId || String(deal.sellerId ?? meeting.sellerId ?? ""),
        price: current.price || deal.monthlyCost || deal.deal.value || 0,
        bindingPeriodMonths: current.bindingPeriodMonths || deal.bindingPeriodMonths || 12,
        organizationId: current.organizationId || String(deal.organization.id ?? mediacleaning.organizationId ?? ""),
        dealId: current.dealId || String(deal.deal.id ?? mediacleaning.dealId ?? "")
      }));
    }
  }

  async function submitCurrentStep() {
    resetFeedback();

    if (activeStep === 0) {
      await validateAndSubmit(meetingStepSchema, meeting, "/api/pipedrive/activities/meeting", "meeting");
    }

    if (activeStep === 1) {
      await validateAndSubmit(dealStepSchema, deal, "/api/pipedrive/deals", "deal");
    }

    if (activeStep === 2) {
      await validateAndSubmit(mediacleaningStepSchema, mediacleaning, "/api/pdf/mediacleaning", "mediacleaning");
    }

    if (activeStep === 3) {
      await validateAndSubmit(contractStepSchema, contract, "/api/pdf/contract", "contract");
    }
  }

  async function validateAndSubmit(schema: ZodSchema, value: unknown, endpoint: string, key: keyof WizardData) {
    const parsed = schema.safeParse(value);

    if (!parsed.success) {
      setErrors(formatZodErrors(parsed.error));
      return;
    }

    setWizardData((current) => ({ ...current, [key]: parsed.data as WizardData[typeof key] }));
    setSubmitState({ status: "loading", message: "Skickar..." });

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data)
      });
      const result = (await response.json()) as { ok: boolean; error?: string; message?: string };

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? "Något gick fel");
      }

      setSubmitState({
        status: "success",
        message: result.message ?? "Steget är validerat och skickat."
      });
    } catch (error) {
      setSubmitState({
        status: "error",
        message: error instanceof Error ? error.message : "Något gick fel"
      });
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>Digital Kontakt</strong>
          <span>Sales Portal</span>
        </div>
        <nav className="steps" aria-label="Arbetsflöde">
          {steps.map((step, index) => (
            <button
              key={step}
              className="step-button"
              data-active={activeStep === index}
              type="button"
              onClick={() => goToStep(index)}
            >
              <span className="step-number">{index + 1}</span>
              <span>{step}</span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="main">
        <div className="toolbar">
          <div>
            <p className="eyebrow">Steg {activeStep + 1} av 4</p>
            <h1>{steps[activeStep]}</h1>
            <p className="hint">
              Varje steg kan återanvända kunddata, men bara steget Skapa affär får skapa en Pipedrive-affär.
            </p>
          </div>
          <div className="status-pill">Scaffoldläge</div>
        </div>

        <div className="workspace">
          <section className="panel">
            {activeStep === 0 && <MeetingStep data={meeting} onChange={setMeeting} />}
            {activeStep === 1 && <DealStep data={deal} onChange={setDeal} />}
            {activeStep === 2 && <MediacleaningStep data={mediacleaning} onChange={setMediacleaning} />}
            {activeStep === 3 && <ContractStep data={contract} onChange={setContract} />}

            {errors.length > 0 && (
              <div className="errors" role="alert">
                {errors.map((error) => (
                  <div className="error-line" key={error}>
                    {error}
                  </div>
                ))}
              </div>
            )}

            {submitState.status === "success" && <div className="notice success">{submitState.message}</div>}
            {submitState.status === "error" && <div className="notice error">{submitState.message}</div>}

            <div className="actions">
              <button className="btn" type="button" disabled={activeStep === 0} onClick={() => goToStep(activeStep - 1)}>
                Tillbaka
              </button>
              <div className="button-group">
                <button className="btn primary" type="button" disabled={submitState.status === "loading"} onClick={submitCurrentStep}>
                  {submitState.status === "loading" ? "Skickar..." : "Validera och skicka"}
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={activeStep === steps.length - 1}
                  onClick={() => goToStep(activeStep + 1)}
                >
                  Nästa
                </button>
              </div>
            </div>
          </section>

          <aside className="side-panel">
            <h2 className="section-title">Aktuell kunddata</h2>
            <dl className="summary-list">
              <div>
                <dt>Kund/bolag</dt>
                <dd>{summary.customer}</dd>
              </div>
              <div>
                <dt>Kontakt</dt>
                <dd>{summary.person}</dd>
              </div>
              <div>
                <dt>Affär</dt>
                <dd>{summary.deal}</dd>
              </div>
              <div>
                <dt>Dokumentuppladdning</dt>
                <dd>{summary.target}</dd>
              </div>
            </dl>
            <div className="notice warning">
              Inga Pipedrive-ID:n eller custom fields gissas. Lägg riktiga värden i miljö/config innan produktion.
            </div>
            {Object.keys(wizardData).length > 0 && <div className="notice success">Sparad state: {Object.keys(wizardData).join(", ")}</div>}
          </aside>
        </div>
      </section>
    </main>
  );
}

function MeetingStep({ data, onChange }: StepProps<MeetingStepData>) {
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

function DealStep({ data, onChange }: StepProps<DealStepData>) {
  return (
    <>
      <LookupBox title="Sök möjlig dubblett: person" endpoint="/api/pipedrive/persons/search" />
      <LookupBox title="Sök möjlig dubblett: organisation" endpoint="/api/pipedrive/organizations/search" />

      <FormSection title="Kontakt och organisation">
        <TextField label="Kontaktperson" value={data.person.name} onChange={(name) => onChange({ ...data, person: { ...data.person, name } })} />
        <TextField label="Telefon" value={data.person.phone} onChange={(phone) => onChange({ ...data, person: { ...data.person, phone } })} />
        <TextField label="E-post" value={data.person.email} onChange={(email) => onChange({ ...data, person: { ...data.person, email } })} />
        <TextField label="Organisation" value={data.organization.name} onChange={(name) => onChange({ ...data, organization: { ...data.organization, name } })} />
        <TextField
          label="Webbplats"
          value={data.organization.website}
          onChange={(website) => onChange({ ...data, organization: { ...data.organization, website } })}
        />
        <TextField
          label="Organisationsnummer"
          value={data.organization.organizationNumber}
          onChange={(organizationNumber) => onChange({ ...data, organization: { ...data.organization, organizationNumber } })}
        />
        <TextField
          className="full"
          label="Adress"
          value={data.organization.address}
          onChange={(address) => onChange({ ...data, organization: { ...data.organization, address } })}
        />
      </FormSection>

      <FormSection title="Affär">
        <TextField label="Affärstitel" value={data.deal.title} onChange={(title) => onChange({ ...data, deal: { ...data.deal, title } })} />
        <TextField label="Värde" type="number" value={String(data.deal.value ?? 0)} onChange={(value) => onChange({ ...data, deal: { ...data.deal, value: Number(value) } })} />
        <SelectField
          label="Valuta"
          value={data.deal.currency ?? "SEK"}
          options={["SEK", "EUR", "USD"]}
          onChange={(currency) => onChange({ ...data, deal: { ...data.deal, currency: currency as DealStepData["deal"]["currency"] } })}
        />
        <TextField label="Pipeline ID" value={String(data.deal.pipelineId ?? "")} onChange={(pipelineId) => onChange({ ...data, deal: { ...data.deal, pipelineId } })} />
        <TextField label="Stage ID" value={String(data.deal.stageId ?? "")} onChange={(stageId) => onChange({ ...data, deal: { ...data.deal, stageId } })} />
        <TextField label="Säljare ID" value={String(data.sellerId ?? "")} onChange={(sellerId) => onChange({ ...data, sellerId })} />
        <TextArea className="full" label="Viktigast för kunden" value={data.viktigastForKunden} onChange={(viktigastForKunden) => onChange({ ...data, viktigastForKunden })} />
        <TextField label="Faktura start" type="date" value={data.fakturaStart} onChange={(fakturaStart) => onChange({ ...data, fakturaStart })} />
        <TextField label="Fakturagrupp" value={data.fakturagrupp} onChange={(fakturagrupp) => onChange({ ...data, fakturagrupp })} />
        <TextField label="Avtalslängd månader" type="number" value={String(data.contractLengthMonths ?? "")} onChange={(contractLengthMonths) => onChange({ ...data, contractLengthMonths: Number(contractLengthMonths) })} />
        <TextField label="Avtalsstart" type="date" value={data.contractStartDate} onChange={(contractStartDate) => onChange({ ...data, contractStartDate })} />
        <TextField label="Månadskostnad" type="number" value={String(data.monthlyCost ?? 0)} onChange={(monthlyCost) => onChange({ ...data, monthlyCost: Number(monthlyCost) })} />
        <TextField label="Startavgift" type="number" value={String(data.startFee ?? 0)} onChange={(startFee) => onChange({ ...data, startFee: Number(startFee) })} />
        <TextField label="Totalt affärsvärde" type="number" value={String(data.totalDealValue ?? 0)} onChange={(totalDealValue) => onChange({ ...data, totalDealValue: Number(totalDealValue) })} />
        <TextField label="Bindningstid månader" type="number" value={String(data.bindingPeriodMonths ?? 0)} onChange={(bindingPeriodMonths) => onChange({ ...data, bindingPeriodMonths: Number(bindingPeriodMonths) })} />
        <TextField label="Uppsägningstid månader" type="number" value={String(data.cancellationPeriodMonths ?? 0)} onChange={(cancellationPeriodMonths) => onChange({ ...data, cancellationPeriodMonths: Number(cancellationPeriodMonths) })} />
      </FormSection>
    </>
  );
}

function MediacleaningStep({ data, onChange }: StepProps<MediacleaningStepData>) {
  return (
    <>
      <LookupBox title="Sök befintlig affär för uppladdning" endpoint="/api/pipedrive/deals/search" />
      <FormSection title="Kund och dokument">
        <TextField label="Företagsnamn" value={data.companyName} onChange={(companyName) => onChange({ ...data, companyName })} />
        <TextField label="Organisationsnummer" value={data.organizationNumber} onChange={(organizationNumber) => onChange({ ...data, organizationNumber })} />
        <TextField label="Adress" value={data.address} onChange={(address) => onChange({ ...data, address })} />
        <TextField label="Ort" value={data.city} onChange={(city) => onChange({ ...data, city })} />
        <TextField label="Pipedrive organisation ID" value={String(data.organizationId ?? "")} onChange={(organizationId) => onChange({ ...data, organizationId })} />
        <TextField label="Pipedrive affär ID" value={String(data.dealId ?? "")} onChange={(dealId) => onChange({ ...data, dealId })} />
        <div className="field full">
          <label>Dokument</label>
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

      <SupplierEditor suppliers={data.suppliers} onChange={(suppliers) => onChange({ ...data, suppliers })} />
      <FormSection title="Intern kommentar">
        <TextArea className="full" label="Kommentar" value={data.internalComment} onChange={(internalComment) => onChange({ ...data, internalComment })} />
      </FormSection>
    </>
  );
}

function ContractStep({ data, onChange }: StepProps<ContractStepData>) {
  return (
    <>
      <FormSection title="Avtal">
        <TextField label="Företagsnamn" value={data.companyName} onChange={(companyName) => onChange({ ...data, companyName })} />
        <TextField label="Organisationsnummer" value={data.organizationNumber} onChange={(organizationNumber) => onChange({ ...data, organizationNumber })} />
        <TextField label="Firmatecknare/kontaktperson" value={data.signerName} onChange={(signerName) => onChange({ ...data, signerName })} />
        <TextField label="Adress" value={data.address} onChange={(address) => onChange({ ...data, address })} />
        <TextField label="Säljare ID" value={String(data.sellerId ?? "")} onChange={(sellerId) => onChange({ ...data, sellerId })} />
        <TextField label="Säljare namn" value={data.sellerName} onChange={(sellerName) => onChange({ ...data, sellerName })} />
        <TextField label="Pris/kostnad" type="number" value={String(data.price)} onChange={(price) => onChange({ ...data, price: Number(price) })} />
        <SelectField
          label="Betalningsintervall"
          value={data.paymentInterval}
          options={["monthly", "quarterly", "yearly"]}
          onChange={(paymentInterval) => onChange({ ...data, paymentInterval: paymentInterval as ContractStepData["paymentInterval"] })}
        />
        <TextField label="Bindningstid månader" type="number" value={String(data.bindingPeriodMonths)} onChange={(bindingPeriodMonths) => onChange({ ...data, bindingPeriodMonths: Number(bindingPeriodMonths) })} />
        <TextField label="Pipedrive organisation ID" value={String(data.organizationId ?? "")} onChange={(organizationId) => onChange({ ...data, organizationId })} />
        <TextField label="Pipedrive affär ID" value={String(data.dealId ?? "")} onChange={(dealId) => onChange({ ...data, dealId })} />
        <TextArea
          className="full"
          label="Inkluderade tjänster, en per rad"
          value={data.includedServices.join("\n")}
          onChange={(value) => onChange({ ...data, includedServices: value.split("\n").map((item) => item.trim()).filter(Boolean) })}
        />
      </FormSection>
    </>
  );
}

type StepProps<T> = {
  data: T;
  onChange: (value: T) => void;
};

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <h2 className="section-title">{title}</h2>
      <div className="grid">{children}</div>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  className
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <div className={`field ${className ?? ""}`}>
      <label>{label}</label>
      <input type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  className
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={`field ${className ?? ""}`}>
      <label>{label}</label>
      <textarea value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function CheckLabel({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function LookupBox({ title, endpoint }: { title: string; endpoint: string }) {
  const [term, setTerm] = useState("");
  const [state, setState] = useState<SubmitState>({ status: "idle" });
  const [results, setResults] = useState<Array<Record<string, unknown>>>([]);

  async function search() {
    if (!term.trim()) return;

    setState({ status: "loading", message: "Söker..." });

    try {
      const response = await fetch(`${endpoint}?term=${encodeURIComponent(term)}`);
      const payload = (await response.json()) as { ok: boolean; data?: Array<Record<string, unknown>>; error?: string };

      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Sökningen misslyckades");

      setResults(payload.data ?? []);
      setState({ status: "success", message: `${payload.data?.length ?? 0} träffar` });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Sökningen misslyckades" });
      setResults([]);
    }
  }

  return (
    <div className="lookup">
      <label>{title}</label>
      <div className="lookup-row">
        <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Sök på namn, e-post, telefon eller org.nr" />
        <button className="btn" type="button" onClick={search} disabled={state.status === "loading"}>
          Sök
        </button>
      </div>
      {state.status === "success" && results.length > 0 && <div className="notice warning">Möjliga befintliga CRM-poster hittades. Välj/återanvänd innan ny post skapas.</div>}
      {state.status === "error" && <div className="notice error">{state.message}</div>}
      {results.length > 0 && (
        <div className="results">
          {results.slice(0, 5).map((result, index) => (
            <pre className="result-item" key={index}>
              {JSON.stringify(result, null, 2)}
            </pre>
          ))}
        </div>
      )}
    </div>
  );
}

function SupplierEditor({
  suppliers,
  onChange
}: {
  suppliers: SupplierSelection[];
  onChange: (suppliers: SupplierSelection[]) => void;
}) {
  function updateSupplier(index: number, patch: Partial<SupplierSelection>) {
    onChange(suppliers.map((supplier, supplierIndex) => (supplierIndex === index ? { ...supplier, ...patch } : supplier)));
  }

  return (
    <section className="section">
      <h2 className="section-title">Leverantörer att säga upp</h2>
      {suppliers.map((supplier, index) => (
        <div className="grid" key={index}>
          <TextField label="Leverantör" value={supplier.name} onChange={(name) => updateSupplier(index, { name })} />
          <TextField label="Kundnummer" value={supplier.customerNumber} onChange={(customerNumber) => updateSupplier(index, { customerNumber })} />
          <TextField className="full" label="Uppsägning skickas till" value={supplier.noticeAddress} onChange={(noticeAddress) => updateSupplier(index, { noticeAddress })} />
        </div>
      ))}
      <div className="button-group">
        <button className="btn" type="button" onClick={() => onChange([...suppliers, { name: "", customerNumber: "", noticeAddress: "" }])}>
          Lägg till leverantör
        </button>
        <button className="btn" type="button" disabled={suppliers.length === 0} onClick={() => onChange(suppliers.slice(0, -1))}>
          Ta bort sista
        </button>
      </div>
    </section>
  );
}

function toggleDocumentType(
  data: MediacleaningStepData,
  onChange: (value: MediacleaningStepData) => void,
  documentType: MediacleaningStepData["documentTypes"][number],
  checked: boolean
) {
  const documentTypes = checked
    ? [...data.documentTypes, documentType]
    : data.documentTypes.filter((current) => current !== documentType);

  onChange({ ...data, documentTypes });
}

function formatZodErrors(error: ZodError) {
  return error.issues.map((issue) => `${issue.path.join(".") || "form"}: ${issue.message}`);
}
