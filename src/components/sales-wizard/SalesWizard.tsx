"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import type { ZodSchema } from "zod";
import {
  contractDocumentRequestSchema,
  dealStepSchema,
  mediacleaningStepSchema,
  meetingStepSchema
} from "@/lib/crm/schemas";
import type { CrmRecordId, SubmitState, WizardData } from "@/lib/crm/types";
import type { WorkflowKind } from "@/lib/history/types";
import { ContractStep } from "@/components/sales-wizard/steps/ContractStep";
import { DealStep } from "@/components/sales-wizard/steps/DealStep";
import { MediacleaningStep } from "@/components/sales-wizard/steps/MediacleaningStep";
import { MeetingStep } from "@/components/sales-wizard/steps/MeetingStep";
import { HistoryPanel } from "@/components/sales-wizard/HistoryPanel";
import {
  initialContract,
  initialDeal,
  initialMediacleaning,
  initialMeeting
} from "@/components/sales-wizard/initialState";
import { useReferenceData } from "@/components/sales-wizard/useReferenceData";
import { downloadBlob, formatZodErrors, readRecordId } from "@/components/sales-wizard/utils";

const steps = ["Mötesbokning", "Skapa affär", "Mediacleaning", "Avtalsgenerering"];
const stepKinds: WorkflowKind[] = ["meeting", "deal", "mediacleaning", "contract"];

/** Per-step submit results, so a completed step cannot be run twice by accident. */
type StepResult = {
  completedAt: string;
  message: string;
};

export function SalesWizard({ currentUser }: { currentUser: string }) {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState(0);
  const [wizardData, setWizardData] = useState<WizardData>({});
  const [meeting, setMeeting] = useState(initialMeeting);
  const [deal, setDeal] = useState(initialDeal);
  const [mediacleaning, setMediacleaning] = useState(initialMediacleaning);
  const [contract, setContract] = useState(initialContract);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });
  const [stepResults, setStepResults] = useState<Partial<Record<WorkflowKind, StepResult>>>({});
  const [historyToken, setHistoryToken] = useState(0);
  // Fetched once and shared: three of the four steps need the same lists.
  const reference = useReferenceData();

  const activeKind = stepKinds[activeStep];
  const activeResult = stepResults[activeKind];

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

  /**
   * Carries customer data forward between steps.
   *
   * Only fills blanks — a value the seller has already typed into the target
   * step is never overwritten.
   */
  function hydrateStepFromPrevious(index: number) {
    if (index === 1) {
      setDeal((current) => ({
        ...current,
        person: {
          ...current.person,
          id: current.person.id ?? meeting.person.id,
          name: current.person.name || meeting.person.name,
          // Meeting fields are optional but the deal step requires them, so a
          // missing value carries forward as an empty field for the seller to
          // fill in — never as `undefined`, which the deal schema rejects.
          phone: current.person.phone || meeting.person.phone || "",
          phoneType: current.person.phoneType || meeting.person.phoneType,
          email: current.person.email || meeting.person.email || "",
          emailType: current.person.emailType || meeting.person.emailType,
          organizationId: current.person.organizationId ?? meeting.person.organizationId
        },
        organization: {
          ...current.organization,
          id: current.organization.id ?? meeting.organization?.id,
          name: current.organization.name || meeting.organization?.name || "",
          customerType: current.organization.customerType || meeting.organization?.customerType,
          website: current.organization.website || meeting.organization?.website || "",
          address: current.organization.address || meeting.organization?.address || "",
          city: current.organization.city || meeting.organization?.city || "",
          organizationNumber:
            current.organization.organizationNumber || meeting.organization?.organizationNumber || ""
        },
        sellerId: current.sellerId || meeting.sellerId || "",
        viktigastForKunden:
          current.viktigastForKunden ||
          [meeting.technicianNotes, meeting.internalComment].filter(Boolean).join("\n\n"),
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
      const sellerId = String(deal.sellerId ?? meeting.sellerId ?? "");
      const sellerName = reference.users.find((user) => String(user.id) === sellerId)?.name;

      setContract((current) => ({
        ...current,
        companyName: current.companyName || deal.organization.name || mediacleaning.companyName,
        organizationNumber: current.organizationNumber || deal.organization.organizationNumber || mediacleaning.organizationNumber,
        signerName: current.signerName || deal.person.name || meeting.person.name,
        address: current.address || deal.organization.address || mediacleaning.address,
        sellerId: current.sellerId || sellerId,
        sellerName: current.sellerName || sellerName || "",
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
      await validateAndSubmit(
        contractDocumentRequestSchema,
        {
          contract,
          mediacleaning: contract.includeMediacleaningDocuments ? mediacleaning : undefined
        },
        "/api/pdf/contract",
        "contract",
        contract
      );
    }
  }

  async function validateAndSubmit(
    schema: ZodSchema,
    value: unknown,
    endpoint: string,
    key: WorkflowKind,
    storedValue?: unknown
  ) {
    // Guard against a second run creating a duplicate CRM record.
    if (stepResults[key] || submitState.status === "loading") return;

    const parsed = schema.safeParse(value);

    if (!parsed.success) {
      setErrors(formatZodErrors(parsed.error));
      return;
    }

    setWizardData((current) => ({
      ...current,
      [key]: (storedValue ?? parsed.data) as WizardData[typeof key]
    }));
    setSubmitState({ status: "loading", message: "Skickar..." });

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data)
      });

      // Session expired mid-session; send them back to log in.
      if (response.status === 401) {
        router.push("/login");
        return;
      }

      const message = response.headers.get("content-type")?.includes("application/json")
        ? await handleJsonResponse(response, key)
        : await handleDocumentResponse(response);

      setStepResults((current) => ({
        ...current,
        [key]: { completedAt: new Date().toISOString(), message }
      }));
      setSubmitState({ status: "success", message });
      setHistoryToken((token) => token + 1);
    } catch (error) {
      setSubmitState({
        status: "error",
        message: error instanceof Error ? error.message : "Något gick fel"
      });
    }
  }

  /**
   * Pipedrive steps. The created record's ID is written back into wizard state
   * so later steps can reference it instead of asking the seller to type it.
   */
  async function handleJsonResponse(response: Response, key: WorkflowKind): Promise<string> {
    const result = (await response.json()) as {
      ok: boolean;
      error?: string;
      data?: unknown;
      parties?: {
        personId?: CrmRecordId;
        organizationId?: CrmRecordId;
        personLinkedToOrganization?: boolean;
      };
    };

    if (!response.ok || !result.ok) {
      // A deal or meeting can fail after its person/organization were created.
      // Keep those IDs so retrying reuses the records instead of duplicating them.
      if (result.parties) {
        applyResolvedParties(result.parties);
        if (key === "meeting") applyMeetingParties(result.parties);
      }

      throw new Error(result.error ?? "Något gick fel");
    }

    const recordId = readRecordId(result.data);

    if (key === "meeting") {
      // The server resolved (and possibly created) the contact and, when named,
      // the organization. Storing their IDs means the deal step reuses those
      // records instead of creating a second copy of the same customer.
      const parties = (result.data as {
        _parties?: { personId?: CrmRecordId; organizationId?: CrmRecordId };
      })?._parties;

      if (parties) {
        applyResolvedParties(parties);
        applyMeetingParties(parties);
      }

      return recordId ? `Mötet är bokat i Pipedrive (aktivitet ${recordId}).` : "Mötet är bokat i Pipedrive.";
    }

    if (key === "deal" && recordId !== undefined) {
      // The server resolved (and possibly created) the person and organization.
      // Storing their IDs means a re-run reuses them instead of duplicating.
      const parties = (result.data as {
        _parties?: {
          personId?: CrmRecordId;
          organizationId?: CrmRecordId;
          personLinkedToOrganization?: boolean;
        };
      })?._parties;

      if (parties) applyResolvedParties(parties);

      setDeal((current) => ({ ...current, deal: { ...current.deal, id: recordId } }));
      setMediacleaning((current) => ({ ...current, dealId: current.dealId || String(recordId) }));
      setContract((current) => ({ ...current, dealId: current.dealId || String(recordId) }));

      return `Affären är skapad i Pipedrive (affär ${recordId}) och kopplad till kontakt och organisation.`;
    }

    return "Steget är skickat.";
  }

  /**
   * Writes server-resolved person/organization IDs into wizard state. Applied
   * on both success and failure, so a retry after a partial failure reuses the
   * records already created in Pipedrive.
   */
  function applyResolvedParties(parties: {
    personId?: CrmRecordId;
    organizationId?: CrmRecordId;
    personLinkedToOrganization?: boolean;
  }) {
    setDeal((current) => ({
      ...current,
      person: {
        ...current.person,
        id: parties.personId ?? current.person.id,
        organizationId: parties.personLinkedToOrganization
          ? parties.organizationId ?? current.person.organizationId
          : current.person.organizationId
      },
      organization: { ...current.organization, id: parties.organizationId ?? current.organization.id }
    }));

    if (parties.organizationId !== undefined) {
      const organizationId = String(parties.organizationId);
      setMediacleaning((current) => ({ ...current, organizationId: current.organizationId || organizationId }));
      setContract((current) => ({ ...current, organizationId: current.organizationId || organizationId }));
    }
  }

  /**
   * Writes the contact and organization the meeting step resolved back into
   * that step, so re-running it reuses those records rather than creating a
   * second copy of the same customer.
   */
  function applyMeetingParties(parties: { personId?: CrmRecordId; organizationId?: CrmRecordId }) {
    setMeeting((current) => ({
      ...current,
      person: {
        ...current.person,
        id: parties.personId ?? current.person.id,
        // A person created here carries the organization it was created with.
        organizationId: parties.organizationId ?? current.person.organizationId
      },
      organization: { ...current.organization, id: parties.organizationId ?? current.organization?.id }
    }));
  }

  /** Document steps stream the file back — hand it straight to the browser. */
  async function handleDocumentResponse(response: Response): Promise<string> {
    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(result?.error ?? "Kunde inte skapa dokumentet");
    }

    const fileName = response.headers.get("X-Document-File-Name") ?? "dokument.pdf";
    downloadBlob(await response.blob(), fileName);

    // An organization created during upload is reused by the remaining steps.
    const createdOrganizationId = response.headers.get("X-Attachment-Created-Organization-Id");

    if (createdOrganizationId) {
      applyResolvedParties({ organizationId: createdOrganizationId });
    }

    // The document exists either way; the attachment is reported separately so
    // a CRM failure does not read as a failure to produce the document.
    const warning = response.headers.get("X-Attachment-Warning");

    if (warning) {
      return `Utkast skapat och nedladdat: ${fileName}. ${decodeURIComponent(warning)}`;
    }

    return `Utkast skapat och nedladdat: ${fileName} (${describeAttachment(
      response.headers.get("X-Attachment-Target")
    )}). Godkänd avtalstext saknas fortfarande.`;
  }

  /** Lets a seller deliberately re-run a completed step. */
  const allowResubmit = useCallback(() => {
    setStepResults((current) => {
      const next = { ...current };
      delete next[activeKind];
      return next;
    });
    resetFeedback();
  }, [activeKind]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Image
            className="brand-logo"
            src="/brand/wordmark-white.png"
            alt="Digital Kontakt"
            width={1200}
            height={205}
            priority
          />
        </div>
        <nav className="steps" aria-label="Arbetsflöde">
          {steps.map((step, index) => (
            <button
              key={step}
              className="step-button"
              data-active={activeStep === index}
              data-done={Boolean(stepResults[stepKinds[index]])}
              type="button"
              aria-label={`Steg ${index + 1}: ${step}`}
              aria-current={activeStep === index ? "step" : undefined}
              onClick={() => goToStep(index)}
            >
              <span className="step-number">{stepResults[stepKinds[index]] ? "✓" : index + 1}</span>
              <span>{step}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="sidebar-user" title={currentUser}>
            {currentUser}
          </span>
          <button className="link-button" type="button" onClick={logout}>
            Logga ut
          </button>
        </div>
      </aside>

      <section className="main">
        <div className="toolbar">
          <div>
            <p className="eyebrow">Steg {activeStep + 1} av 4</p>
            <h1>{steps[activeStep]}</h1>
            <p className="hint">
              Varje steg kan återanvända kunddata, men bara steget Skapa affär får skapa en Pipedrive-affär.
            </p>
            <p className="hint required-legend">
              Fält märkta med <span className="required-mark">*</span> måste fyllas i innan steget kan köras.
            </p>
          </div>
          <div className="status-pill">Utkastläge</div>
        </div>

        <div className="workspace">
          <section className="panel">
            {activeStep === 0 && <MeetingStep data={meeting} onChange={setMeeting} reference={reference} />}
            {activeStep === 1 && <DealStep data={deal} onChange={setDeal} reference={reference} />}
            {activeStep === 2 && (
              <MediacleaningStep data={mediacleaning} onChange={setMediacleaning} reference={reference} />
            )}
            {activeStep === 3 && (
              <ContractStep
                data={contract}
                onChange={setContract}
                reference={reference}
                mediacleaningReady={mediacleaningStepSchema.safeParse(mediacleaning).success}
              />
            )}

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

            {activeResult && submitState.status !== "success" && (
              <div className="notice success">Steget kördes {formatTimestamp(activeResult.completedAt)}.</div>
            )}

            <div className="actions">
              <button className="btn" type="button" disabled={activeStep === 0} onClick={() => goToStep(activeStep - 1)}>
                Tillbaka
              </button>
              <div className="button-group">
                {activeResult ? (
                  <button className="btn" type="button" onClick={allowResubmit}>
                    Kör steget igen
                  </button>
                ) : (
                  <button
                    className="btn primary"
                    type="button"
                    disabled={submitState.status === "loading"}
                    onClick={submitCurrentStep}
                  >
                    {submitState.status === "loading" ? "Skickar..." : "Validera och skicka"}
                  </button>
                )}
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
            {Object.keys(wizardData).length > 0 && (
              <div className="notice success">Sparad state: {Object.keys(wizardData).join(", ")}</div>
            )}

            <HistoryPanel refreshToken={historyToken} />
          </aside>
        </div>
      </section>
    </main>
  );
}

function describeAttachment(target: string | null): string {
  if (target === "deal") return "kopplat till affären";
  if (target === "organization") return "kopplat till organisationen";

  return "endast nedladdat";
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });
}
