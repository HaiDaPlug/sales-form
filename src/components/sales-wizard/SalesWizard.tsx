"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import type { ZodSchema } from "zod";
import {
  contractDocumentRequestSchema,
  mediacleaningStepSchema,
  meetingStepSchema,
  prospectStepSchema
} from "@/lib/crm/schemas";
import { prospectTitle } from "@/lib/crm/prospect";
import type { CrmRecordId, SubmitState, WizardData } from "@/lib/crm/types";
import type { MeetingOverlap } from "@/lib/pipedrive/types";
import { ContractStep } from "@/components/sales-wizard/steps/ContractStep";
import { MediacleaningStep } from "@/components/sales-wizard/steps/MediacleaningStep";
import { MeetingStep } from "@/components/sales-wizard/steps/MeetingStep";
import { ProspectStep } from "@/components/sales-wizard/steps/ProspectStep";
import { HistoryPanel } from "@/components/sales-wizard/HistoryPanel";
import { OverlapDialog } from "@/components/sales-wizard/OverlapDialog";
import {
  initialContract,
  initialMediacleaning,
  initialMeeting,
  initialProspect
} from "@/components/sales-wizard/initialState";
import { useReferenceData } from "@/components/sales-wizard/useReferenceData";
import { downloadBlob, formatZodErrors, readRecordId } from "@/components/sales-wizard/utils";

/** The four workflows, in order. `action` is the label of the button that runs one. */
type StepKind = keyof WizardData;

const STEPS: { kind: StepKind; label: string; action: string }[] = [
  { kind: "meeting", label: "Mötesbokning", action: "Boka möte" },
  { kind: "prospect", label: "Skapa prospekt", action: "Skapa prospekt" },
  { kind: "mediacleaning", label: "Mediacleaning", action: "Skapa dokument" },
  { kind: "contract", label: "Avtalsgenerering", action: "Skapa avtal" }
];

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
  const [prospect, setProspect] = useState(initialProspect);
  const [mediacleaning, setMediacleaning] = useState(initialMediacleaning);
  const [contract, setContract] = useState(initialContract);
  /** The recording chosen as evidence; not part of the JSON step data. */
  const [audioFile, setAudioFile] = useState<File | null>(null);
  /** The Pipedrive lead this session created, once it exists. */
  const [createdLeadId, setCreatedLeadId] = useState<string | undefined>(undefined);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });
  const [stepResults, setStepResults] = useState<Partial<Record<StepKind, StepResult>>>({});
  const [historyToken, setHistoryToken] = useState(0);
  /** Non-empty while the overlap dialog is waiting on the seller's decision. */
  const [pendingOverlaps, setPendingOverlaps] = useState<MeetingOverlap[]>([]);
  const [checkingOverlaps, setCheckingOverlaps] = useState(false);
  const reference = useReferenceData();

  const active = STEPS[activeStep];
  const activeResult = stepResults[active.kind];

  const summary = useMemo(
    () => ({
      customer:
        prospect.organization.name ||
        meeting.organization?.name ||
        mediacleaning.companyName ||
        contract.companyName ||
        "Ej valt",
      person: prospect.person.name || meeting.person.name || contract.signerName || "Ej valt",
      prospect: createdLeadId
        ? `${prospectTitle(prospect.organization.name)} (skapat)`
        : prospect.organization.name
          ? prospectTitle(prospect.organization.name)
          : "Inget prospekt skapat",
      target: mediacleaning.dealId || contract.dealId ? "Befintlig affär" : "Organisation"
    }),
    [contract.companyName, contract.dealId, contract.signerName, createdLeadId, mediacleaning.companyName, mediacleaning.dealId, meeting, prospect]
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
      setProspect((current) => ({
        ...current,
        person: {
          ...current.person,
          id: current.person.id ?? meeting.person.id,
          name: current.person.name || meeting.person.name,
          // Meeting fields are optional but the prospect step requires them, so
          // a missing value carries forward as an empty field for the seller to
          // fill in — never as `undefined`, which the prospect schema rejects.
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
          website: current.organization.website || meeting.organization?.website || "",
          address: current.organization.address || meeting.organization?.address || "",
          city: current.organization.city || meeting.organization?.city || "",
          organizationNumber:
            current.organization.organizationNumber || meeting.organization?.organizationNumber || ""
        },
        viktigastForKunden: current.viktigastForKunden || meeting.internalComment || ""
      }));
    }

    if (index === 2) {
      setMediacleaning((current) => ({
        ...current,
        companyName: current.companyName || prospect.organization.name || meeting.organization?.name || "",
        organizationNumber: current.organizationNumber || prospect.organization.organizationNumber || "",
        address: current.address || prospect.organization.address || meeting.organization?.address || "",
        city: current.city || prospect.organization.city || meeting.organization?.city || "",
        organizationId: current.organizationId || String(prospect.organization.id ?? meeting.organization?.id ?? "")
      }));
    }

    if (index === 3) {
      setContract((current) => ({
        ...current,
        companyName: current.companyName || prospect.organization.name || mediacleaning.companyName,
        organizationNumber:
          current.organizationNumber || prospect.organization.organizationNumber || mediacleaning.organizationNumber,
        signerName: current.signerName || prospect.person.name || meeting.person.name,
        address: current.address || prospect.organization.address || mediacleaning.address,
        price: current.price || prospect.monthlyCost || prospect.value || 0,
        bindingPeriodMonths: current.bindingPeriodMonths || prospect.bindingPeriodMonths || 12,
        organizationId: current.organizationId || String(prospect.organization.id ?? mediacleaning.organizationId ?? ""),
        dealId: current.dealId || String(mediacleaning.dealId ?? "")
      }));
    }
  }

  /**
   * Books the meeting, pausing on a clash with existing activities.
   *
   * The check runs before `validateAndSubmit` so nothing is created while the
   * seller decides — an overlap is usually a re-submitted booking, and the
   * activity would already exist by the time a warning after the fact appeared.
   *
   * A failed check never blocks the booking: an overlap warning is an aid, and
   * losing Pipedrive's activity list is not a reason to stop a seller working.
   */
  async function submitMeeting() {
    if (stepResults.meeting || submitState.status === "loading" || checkingOverlaps) return;

    const parsed = meetingStepSchema.safeParse(meeting);

    // Let the normal path report validation errors rather than checking
    // overlaps for a time that is not valid yet.
    if (parsed.success) {
      // Tracked separately from `submitState` so the button can report the
      // check without `validateAndSubmit` mistaking it for a submit already in
      // flight and refusing to run.
      setCheckingOverlaps(true);

      try {
        const overlaps = await findOverlaps(parsed.data);

        if (overlaps.length > 0) {
          setPendingOverlaps(overlaps);
          return;
        }
      } finally {
        setCheckingOverlaps(false);
      }
    }

    await validateAndSubmit(meetingStepSchema, meeting, "/api/pipedrive/activities/meeting", "meeting");
  }

  async function findOverlaps(data: { date: string; time: string; durationMinutes: number }) {
    const query = new URLSearchParams({
      date: data.date,
      time: data.time,
      durationMinutes: String(data.durationMinutes)
    });

    const personId = meeting.person.id ?? wizardData.meeting?.person?.id;
    const organizationId = meeting.organization?.id ?? wizardData.meeting?.organization?.id;

    if (personId !== undefined) query.set("personId", String(personId));
    if (organizationId !== undefined) query.set("organizationId", String(organizationId));

    try {
      const response = await fetch(`/api/pipedrive/activities/overlaps?${query}`);
      const payload = (await response.json()) as { ok: boolean; data?: MeetingOverlap[] };

      if (!response.ok || !payload.ok) return [];

      return payload.data ?? [];
    } catch {
      return [];
    }
  }

  async function submitProspect() {
    // The file is validated here because it lives outside the schema. Without
    // it an audio prospect would be created with no evidence and no way to
    // reach "Ljudfil uppladdad".
    if (prospect.evidenceMethod === "audio" && !audioFile) {
      setErrors(["Välj ljudfilen från säljsamtalet, eller välj digital signering som underlag."]);
      return;
    }

    await validateAndSubmit(prospectStepSchema, prospect, "/api/pipedrive/prospects", "prospect");
  }

  async function submitCurrentStep() {
    resetFeedback();

    if (active.kind === "meeting") await submitMeeting();
    if (active.kind === "prospect") await submitProspect();

    if (active.kind === "mediacleaning") {
      await validateAndSubmit(mediacleaningStepSchema, mediacleaning, "/api/pdf/mediacleaning", "mediacleaning");
    }

    if (active.kind === "contract") {
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
    key: StepKind,
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
  async function handleJsonResponse(response: Response, key: StepKind): Promise<string> {
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
      // A prospect or meeting can fail after its person/organization were
      // created. Keep those IDs so retrying reuses the records instead of
      // duplicating them.
      if (result.parties) {
        applyResolvedParties(result.parties);
        if (key === "meeting") applyMeetingParties(result.parties);
      }

      throw new Error(result.error ?? "Något gick fel");
    }

    const recordId = readRecordId(result.data);
    const parties = (result.data as {
      _parties?: { personId?: CrmRecordId; organizationId?: CrmRecordId; personLinkedToOrganization?: boolean };
      _warning?: string;
    })?._parties;

    if (key === "meeting") {
      // The server resolved (and possibly created) the contact and, when named,
      // the organization. Storing their IDs means the prospect step reuses
      // those records instead of creating a second copy of the same customer.
      if (parties) {
        applyResolvedParties(parties);
        applyMeetingParties(parties);
      }

      return recordId ? `Mötet är bokat i Pipedrive (aktivitet ${recordId}).` : "Mötet är bokat i Pipedrive.";
    }

    if (key === "prospect" && typeof recordId === "string") {
      if (parties) applyResolvedParties(parties);
      setCreatedLeadId(recordId);

      const warning = (result.data as { _warning?: string })?._warning;
      const title = prospectTitle(prospect.organization.name);

      return `${title} är skapat i Pipedrive och kopplat till kontakt och organisation.${warning ? ` ${warning}` : ""}`;
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
    setProspect((current) => ({
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
      delete next[active.kind];
      return next;
    });
    resetFeedback();
  }, [active.kind]);

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
          {STEPS.map((step, index) => (
            <button
              key={step.kind}
              className="step-button"
              data-active={activeStep === index}
              data-done={Boolean(stepResults[step.kind])}
              type="button"
              aria-label={`Steg ${index + 1}: ${step.label}`}
              aria-current={activeStep === index ? "step" : undefined}
              onClick={() => goToStep(index)}
            >
              <span className="step-number">{stepResults[step.kind] ? "✓" : index + 1}</span>
              <span>{step.label}</span>
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
            <p className="eyebrow">Steg {activeStep + 1} av {STEPS.length}</p>
            <h1>{active.label}</h1>
            <p className="hint">
              Formuläret skapar prospekt, aldrig affärer. Godkännande och konvertering till affär görs av
              kvalitetskontrollen direkt i Pipedrive.
            </p>
            <p className="hint required-legend">
              Fält märkta med <span className="required-mark">*</span> måste fyllas i innan steget kan köras.
            </p>
          </div>
          <div className="status-pill">Utkastläge</div>
        </div>

        <div className="workspace">
          <section className="panel">
            {active.kind === "meeting" && (
              <MeetingStep data={meeting} onChange={setMeeting} reference={reference} sellerName={currentUser} />
            )}
            {active.kind === "prospect" && (
              <ProspectStep
                data={prospect}
                onChange={setProspect}
                reference={reference}
                sellerName={currentUser}
                audioFile={audioFile}
                onAudioFileChange={setAudioFile}
              />
            )}
            {active.kind === "mediacleaning" && (
              <MediacleaningStep
                data={mediacleaning}
                onChange={setMediacleaning}
                reference={reference}
                sellerName={currentUser}
              />
            )}
            {active.kind === "contract" && (
              <ContractStep
                data={contract}
                onChange={setContract}
                reference={reference}
                sellerName={currentUser}
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
                    disabled={submitState.status === "loading" || checkingOverlaps}
                    onClick={submitCurrentStep}
                  >
                    {checkingOverlaps
                      ? "Kontrollerar tiden..."
                      : submitState.status === "loading"
                        ? "Skickar..."
                        : active.action}
                  </button>
                )}
                <button
                  className="btn"
                  type="button"
                  disabled={activeStep === STEPS.length - 1}
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
                <dt>Prospekt</dt>
                <dd>{summary.prospect}</dd>
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

      {pendingOverlaps.length > 0 && (
        <OverlapDialog
          overlaps={pendingOverlaps}
          onCancel={() => setPendingOverlaps([])}
          onConfirm={() => {
            // Cleared first so the dialog cannot be double-confirmed while the
            // booking request is in flight.
            setPendingOverlaps([]);
            void validateAndSubmit(
              meetingStepSchema,
              meeting,
              "/api/pipedrive/activities/meeting",
              "meeting"
            );
          }}
        />
      )}
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
