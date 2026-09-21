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
import { ResetDialog } from "@/components/sales-wizard/ResetDialog";
import {
  hydrateContract,
  hydrateMediacleaning,
  hydrateMeetingFromProspect,
  hydrateProspectFromMeeting
} from "@/components/sales-wizard/hydration";
import {
  initialContract,
  initialMediacleaning,
  initialMeeting,
  initialProspect
} from "@/components/sales-wizard/initialState";
import { useReferenceData } from "@/components/sales-wizard/useReferenceData";
import { uploadProspectAudio } from "@/components/sales-wizard/uploadAudio";
import { downloadBlob, formatZodErrors, readRecordId } from "@/components/sales-wizard/utils";

/**
 * The four workflows, in order. `action` is the label of the button that runs
 * one. The prospect comes first: the client's workflow is to register the
 * customer and then book the meeting, so the booking inherits the customer.
 */
type StepKind = keyof WizardData;

const STEPS: { kind: StepKind; label: string; action: string }[] = [
  { kind: "prospect", label: "Skapa prospekt", action: "Skapa prospekt" },
  { kind: "meeting", label: "Mötesbokning", action: "Boka möte" },
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
  const [audioUploaded, setAudioUploaded] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });
  const [stepResults, setStepResults] = useState<Partial<Record<StepKind, StepResult>>>({});
  const [historyToken, setHistoryToken] = useState(0);
  /** Non-empty while the overlap dialog is waiting on the seller's decision. */
  const [pendingOverlaps, setPendingOverlaps] = useState<MeetingOverlap[]>([]);
  const [checkingOverlaps, setCheckingOverlaps] = useState(false);
  /** Bumped when a booking is refused, so the picker re-reads the calendars. */
  const [slotRefreshToken, setSlotRefreshToken] = useState(0);
  /**
   * Bumped on every reset and used as the key of the step area, so the step
   * components remount and drop the state they keep for themselves: a typed
   * search term, unresolved contact conflicts, a loaded contact list.
   */
  const [sessionKey, setSessionKey] = useState(0);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const reference = useReferenceData();

  const active = STEPS[activeStep];
  const activeResult = stepResults[active.kind];
  /** The prospect exists but its recording did not reach Pipedrive. */
  const awaitingAudioRetry =
    active.kind === "prospect" && Boolean(createdLeadId) && Boolean(audioFile) && !audioUploaded;

  const summary = useMemo(
    () => ({
      customer:
        prospect.organization.name ||
        meeting.organization?.name ||
        mediacleaning.companyName ||
        contract.companyName ||
        "Ej valt",
      // The linked Pipedrive record, shown beside the name: the name alone is
      // what read "Falafel AB" while the id underneath still pointed at
      // another customer.
      customerId: prospect.organization.id ?? meeting.organization?.id,
      person: prospect.person.name || meeting.person.name || contract.signerName || "Ej valt",
      personId: prospect.person.id ?? meeting.person.id,
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
    hydrateStep(STEPS[index].kind);
    setActiveStep(index);
  }

  /**
   * Carries customer data forward into the step being opened. Keyed on the
   * step rather than its position, so the order of the steps can change
   * without the carry-over silently pointing at the wrong neighbour. The
   * functions only fill blanks; see `hydration.ts`.
   */
  function hydrateStep(kind: StepKind) {
    if (kind === "prospect") setProspect((current) => hydrateProspectFromMeeting(current, meeting));
    if (kind === "meeting") setMeeting((current) => hydrateMeetingFromProspect(current, prospect));

    if (kind === "mediacleaning") {
      setMediacleaning((current) => hydrateMediacleaning(current, { prospect, meeting, createdLeadId }));
    }

    if (kind === "contract") {
      setContract((current) => hydrateContract(current, { prospect, meeting, mediacleaning, createdLeadId }));
    }
  }

  /**
   * Starts over for a new customer.
   *
   * Everything the previous customer left behind goes: the four steps, the
   * recording, the prospect this session created, the resolved Pipedrive ids
   * and the "done" marks. Without this the ids survived a retyped name, and a
   * prospect entered as one company was attached to the previous one.
   */
  function resetSession() {
    setConfirmingReset(false);
    setMeeting(initialMeeting);
    setProspect(initialProspect);
    setMediacleaning(initialMediacleaning);
    setContract(initialContract);
    setAudioFile(null);
    setCreatedLeadId(undefined);
    setAudioUploaded(false);
    setWizardData({});
    setStepResults({});
    setPendingOverlaps([]);
    setActiveStep(0);
    resetFeedback();
    setSessionKey((key) => key + 1);
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

    // The prospect already exists and only its recording failed: retry the
    // upload rather than creating a second prospect for the same customer.
    if (createdLeadId && audioFile && !audioUploaded) {
      await retryAudioUpload(createdLeadId, audioFile);
      return;
    }

    await validateAndSubmit(prospectStepSchema, prospect, "/api/pipedrive/prospects", "prospect");
  }

  async function retryAudioUpload(leadId: string, file: File) {
    setSubmitState({ status: "loading", message: "Laddar upp ljudfilen..." });

    try {
      const { warning } = await uploadProspectAudio(leadId, file);
      const message =
        warning ?? "Ljudfilen är uppladdad och prospektet har status Ljudfil uppladdad i Pipedrive.";

      setAudioUploaded(true);
      setStepResults((current) => ({
        ...current,
        prospect: { completedAt: new Date().toISOString(), message }
      }));
      setSubmitState({ status: "success", message });
      setHistoryToken((token) => token + 1);
    } catch (error) {
      setSubmitState({
        status: "error",
        message: error instanceof Error ? error.message : "Ljudfilen kunde inte laddas upp."
      });
    }
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

      // The slot went while the seller was filling the form in. Re-read the
      // list so the times on screen are the ones still free.
      if (response.status === 409 && key === "meeting") {
        setMeeting((current) => ({ ...current, time: "" }));
        setSlotRefreshToken((token) => token + 1);
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

      // Names what was booked, so the seller can check it against the customer
      // without opening Pipedrive.
      const when = `${formatBookingDate(meeting.date)} kl. ${meeting.time}`;
      const withWhom = meeting.organization?.name
        ? `${meeting.person.name} (${meeting.organization.name})`
        : meeting.person.name;

      return `Mötet är bokat: ${when} med ${withWhom}.${recordId ? ` Aktivitet ${recordId} i Pipedrive.` : ""}`;
    }

    if (key === "prospect" && typeof recordId === "string") {
      if (parties) applyResolvedParties(parties);
      setCreatedLeadId(recordId);

      const warnings = [(result.data as { _warning?: string })?._warning];
      const title = prospectTitle(prospect.organization.name);

      // The recording follows the prospect, because a file needs the lead id
      // to attach to. The prospect exists from here on, so a failed upload is
      // reported against it rather than presented as a failed creation — the
      // seller retries the upload alone.
      if (prospect.evidenceMethod === "audio" && audioFile) {
        try {
          const { warning } = await uploadProspectAudio(recordId, audioFile);
          warnings.push(warning ?? "Ljudfilen är uppladdad och prospektet har status Ljudfil uppladdad.");
          setAudioUploaded(true);
        } catch (error) {
          warnings.push(
            `${title} är skapat, men ljudfilen kunde inte laddas upp: ${
              error instanceof Error ? error.message : String(error)
            } Prospektet ligger kvar — ladda upp filen igen utan att skapa prospektet på nytt.`
          );
        }
      }

      return [
        `${title} är skapat i Pipedrive och kopplat till kontakt och organisation.`,
        ...warnings.filter(Boolean)
      ].join(" ");
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
    const warnings = [response.headers.get("X-Attachment-Warning"), response.headers.get("X-Signature-Task-Warning")]
      .filter((value): value is string => Boolean(value))
      .map(decodeURIComponent);

    if (warnings.length > 0) {
      return `Dokumentet är skapat och nedladdat: ${fileName}. ${warnings.join(" ")}`;
    }

    // No draft mark: the seller reviews the document before it goes to the
    // customer, which is what the reminder here is for.
    return `Dokumentet är skapat och nedladdat: ${fileName} (${describeAttachment(
      response.headers.get("X-Attachment-Target")
    )}). Granska det innan det skickas till kunden.`;
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
          <a className="link-button" href="/status">
            Status
          </a>
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
          <div className="toolbar-actions">
            <button className="btn" type="button" onClick={() => setConfirmingReset(true)}>
              Ny kund
            </button>
          </div>
        </div>

        <div className="workspace" key={sessionKey}>
          <section className="panel">
            {active.kind === "meeting" && (
              <MeetingStep
                data={meeting}
                onChange={setMeeting}
                reference={reference}
                sellerName={currentUser}
                slotRefreshToken={slotRefreshToken}
              />
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
                        ? submitState.message ?? "Skickar..."
                        : awaitingAudioRetry
                          ? "Ladda upp ljudfilen igen"
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
                <dd>
                  {summary.customer}
                  {summary.customerId !== undefined && (
                    <span className="field-hint"> · kopplad, Pipedrive-ID {summary.customerId}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Kontakt</dt>
                <dd>
                  {summary.person}
                  {summary.personId !== undefined && (
                    <span className="field-hint"> · kopplad, Pipedrive-ID {summary.personId}</span>
                  )}
                </dd>
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

      {confirmingReset && <ResetDialog onCancel={() => setConfirmingReset(false)} onConfirm={resetSession} />}

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
  return target === "organization" ? "uppladdat till organisationen" : "endast nedladdat";
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });
}

/** `2026-09-14` → `måndag 14 september 2026`, for the booking confirmation. */
function formatBookingDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}
