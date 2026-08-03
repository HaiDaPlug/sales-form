"use client";

import { useMemo, useState } from "react";
import type { ZodSchema } from "zod";
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
  WizardData
} from "@/lib/crm/types";
import { ContractStep } from "@/components/sales-wizard/steps/ContractStep";
import { DealStep } from "@/components/sales-wizard/steps/DealStep";
import { MediacleaningStep } from "@/components/sales-wizard/steps/MediacleaningStep";
import { MeetingStep } from "@/components/sales-wizard/steps/MeetingStep";
import { formatZodErrors } from "@/components/sales-wizard/utils";

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
              aria-label={`Steg ${index + 1}: ${step}`}
              aria-current={activeStep === index ? "step" : undefined}
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
