import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import type { SessionPayload } from "@/lib/auth/session";
import { requireSession, sellerFromSession, UnauthorizedError } from "@/lib/auth/server";
import { assertCustomFieldMappings, ConfigurationError } from "@/lib/config/pipedrive";
import { PipedriveApiError } from "@/lib/pipedrive/client";
import {
  buildLeadPayload,
  buildMeetingActivityPayload,
  buildProspectNote,
  createActivity,
  createLead,
  createNote,
  createOrganization,
  createPerson,
  DealOwnershipError,
  findMeetingOverlaps,
  ExistingRecordProtectionError,
  PartialResolutionError,
  getCustomFieldMappings,
  getDealFields,
  getOrganizationFields,
  getPersonFields,
  getSellers,
  getUsers,
  MIN_SEARCH_TERM_LENGTH,
  resolveMeetingParties,
  resolveProspectParties,
  searchDeals,
  searchLeads,
  searchOrganizations,
  searchPersons,
  type PartialParties,
  type ResolvedMeetingParties,
  type ResolvedProspectParties
} from "@/lib/pipedrive/service";
import {
  createActivitySchema,
  createNoteSchema,
  createOrganizationSchema,
  createPersonSchema,
  meetingStepSchema,
  prospectStepSchema
} from "@/lib/crm/schemas";
import { prospectTitle } from "@/lib/crm/prospect";
import { recordHistory, recordHistorySafely } from "@/lib/history/store";

/**
 * The Pipedrive operations the portal offers.
 *
 * Deliberately absent, and to stay absent: creating a deal, converting a lead,
 * changing a lead's owner or seller. Those are the back-office's acts in
 * Pipedrive; a direct call to this backend cannot perform them because no code
 * for them exists.
 */
type RouteContext = {
  params: Promise<{
    operation: string[];
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireSession();

    const operation = (await context.params).operation.join("/");
    const searchParams = request.nextUrl.searchParams;

    if (operation === "persons/search") {
      return jsonOk(await searchPersons(requiredSearchTerm(searchParams)));
    }

    if (operation === "organizations/search") {
      return jsonOk(await searchOrganizations(requiredSearchTerm(searchParams)));
    }

    if (operation === "deals/search") {
      return jsonOk(
        await searchDeals(
          requiredSearchTerm(searchParams),
          searchParams.get("personId") ?? undefined,
          searchParams.get("organizationId") ?? undefined
        )
      );
    }

    if (operation === "leads/search") {
      return jsonOk(await searchLeads(requiredSearchTerm(searchParams), searchParams.get("organizationId") ?? undefined));
    }

    if (operation === "users") return jsonOk(await getUsers());
    if (operation === "sellers") return jsonOk(await getSellers());

    if (operation === "activities/overlaps") {
      const durationMinutes = Number(searchParams.get("durationMinutes"));

      return jsonOk(
        await findMeetingOverlaps({
          date: requiredQuery(searchParams, "date"),
          time: requiredQuery(searchParams, "time"),
          // A missing or unparseable duration would make every booking
          // zero-length and silently match nothing.
          durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 60,
          personId: searchParams.get("personId") ?? undefined,
          organizationId: searchParams.get("organizationId") ?? undefined
        })
      );
    }

    if (operation === "custom-field-mappings") return jsonOk(getCustomFieldMappings());
    if (operation === "deal-fields") return jsonOk(await getDealFields());
    if (operation === "person-fields") return jsonOk(await getPersonFields());
    if (operation === "organization-fields") return jsonOk(await getOrganizationFields());

    return jsonError(`Unknown Pipedrive GET operation: ${operation}`, 404);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();

    const operation = (await context.params).operation.join("/");
    const body = await request.json().catch(() => {
      throw new BadRequestError("Ogiltig JSON i anropet.");
    });

    if (operation === "persons") {
      return jsonOk(await createPerson(createPersonSchema.parse(body)));
    }

    if (operation === "organizations") {
      return jsonOk(await createOrganization(createOrganizationSchema.parse(body)));
    }

    if (operation === "activities/meeting") {
      const parsed = meetingStepSchema.parse(body);
      const seller = sellerFromSession(session);
      const customerName = parsed.organization?.name ?? parsed.person.name;

      let meetingParties: ResolvedMeetingParties | undefined;

      try {
        // The contact (and organization, when named) must exist before the
        // activity can be attached to anything.
        meetingParties = await resolveMeetingParties(parsed);

        const activity = await createActivity(buildMeetingActivityPayload(parsed, meetingParties, seller));

        // The activity exists from here on. History is a local convenience, so
        // its failure must never turn a completed booking into an error the
        // seller would retry — that is how duplicate activities are created.
        await recordHistorySafely({
          kind: "meeting",
          status: "success",
          createdBy: session.subject,
          sellerOptionId: session.sellerOptionId,
          customerName,
          summary: `${parsed.meetingType} ${parsed.date} ${parsed.time} med ${parsed.person.name}`,
          pipedriveActivityId: readRecordId(activity),
          pipedrivePersonId: meetingParties.personId,
          pipedriveOrganizationId: meetingParties.organizationId,
          payload: parsed
        });

        // The resolved IDs travel back so the wizard can reuse them instead of
        // re-creating the same records on a later step or a re-run.
        return jsonOk({ ...(activity as Record<string, unknown>), _parties: meetingParties });
      } catch (error) {
        if (error instanceof ExistingRecordProtectionError) throw error;

        // Resolution may have created records before it failed; recover them so
        // they are logged and returned rather than orphaned.
        const partial = meetingParties ?? partialPartiesOf(error);

        await recordFailure(
          "meeting",
          session,
          customerName,
          `Mötesbokning för ${parsed.person.name}`,
          error,
          partial
        );

        // A contact may already exist even though the activity failed. Deleting
        // it is not an option, so the IDs are returned and the wizard fills them
        // in — a retry reuses the record rather than creating a duplicate.
        throw new PartialRecordFailure(
          error instanceof Error ? error.message : String(error),
          errorStatus(error),
          partial
        );
      }
    }

    if (operation === "prospects") {
      const parsed = prospectStepSchema.parse(body);
      const seller = sellerFromSession(session);
      const title = prospectTitle(parsed.organization.name);

      // Config is checked before anything is created: a later failure would
      // otherwise leave orphaned person/organization records behind.
      assertCustomFieldMappings();

      let parties: ResolvedProspectParties | undefined;

      try {
        parties = await resolveProspectParties(parsed);

        const lead = await createLead(await buildLeadPayload(parsed, parties, seller));
        const leadId = readLeadId(lead);

        // The commercial terms have no field of their own. The note is a
        // convenience for QC, so its failure is reported, never fatal: the
        // prospect exists and must not be created twice by a retry.
        let noteWarning: string | undefined;

        if (leadId) {
          try {
            await createNote({ content: buildProspectNote(parsed, seller), lead_id: leadId });
          } catch (error) {
            noteWarning = `Anteckningen med avtalsvillkoren kunde inte sparas på prospektet: ${describe(error)}`;
            console.error("Prospect note failed:", error);
          }
        }

        // The prospect exists from here on; a history failure must not present
        // it as a failed run the seller would retry into a duplicate.
        await recordHistorySafely({
          kind: "prospect",
          status: noteWarning ? "warning" : "success",
          createdBy: session.subject,
          sellerOptionId: session.sellerOptionId,
          customerName: parsed.organization.name,
          summary: `${title} — ${parsed.evidenceMethod === "audio" ? "ljudfil" : "digital signering"}`,
          pipedriveLeadId: leadId,
          pipedrivePersonId: parties.personId,
          pipedriveOrganizationId: parties.organizationId,
          errorMessage: noteWarning,
          payload: parsed
        });

        return jsonOk({ ...(lead as Record<string, unknown>), _parties: parties, _warning: noteWarning });
      } catch (error) {
        if (error instanceof ExistingRecordProtectionError) throw error;

        // Resolution may have created an organization before failing on the
        // person; recover it rather than losing the ID.
        const partial = parties ?? partialPartiesOf(error);

        await recordFailure("prospect", session, parsed.organization.name, title, error, partial);

        // Person/organization may already exist in Pipedrive even though the
        // lead failed. Deleting them is not an option (removing real CRM
        // records is worse than keeping them), so the IDs are returned — the
        // wizard fills them in so a retry reuses the records.
        throw new PartialRecordFailure(
          error instanceof Error ? error.message : String(error),
          errorStatus(error),
          partial
        );
      }
    }

    if (operation === "activities") {
      return jsonOk(await createActivity(createActivitySchema.parse(body)));
    }

    if (operation === "notes") {
      return jsonOk(await createNote(createNoteSchema.parse(body)));
    }

    return jsonError(`Unknown Pipedrive POST operation: ${operation}`, 404);
  } catch (error) {
    return jsonError(error);
  }
}

/** Pipedrive returns the created record with a numeric `id`. */
function readRecordId(record: unknown): string | number | undefined {
  if (typeof record !== "object" || record === null) return undefined;

  const id = (record as { id?: unknown }).id;
  return typeof id === "string" || typeof id === "number" ? id : undefined;
}

/** Lead ids are UUID strings; anything else is not a lead. */
function readLeadId(record: unknown): string | undefined {
  const id = readRecordId(record);
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

async function recordFailure(
  kind: "meeting" | "prospect",
  session: SessionPayload,
  customerName: string | undefined,
  summary: string,
  error: unknown,
  // Only the IDs are logged, so the widest shape that carries them is enough.
  parties?: PartialParties
) {
  // History must never mask the original failure.
  try {
    await recordHistory({
      kind,
      status: "error",
      createdBy: session.subject,
      sellerOptionId: session.sellerOptionId,
      customerName,
      summary,
      // Records created before the failure are logged so they are traceable
      // rather than silently orphaned in the CRM.
      pipedrivePersonId: parties?.personId,
      pipedriveOrganizationId: parties?.organizationId,
      errorMessage: describe(error)
    });
  } catch {
    /* ignored */
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class BadRequestError extends Error {
  readonly status = 400;
}

/**
 * Any workflow that failed after it had already created CRM records. Carries
 * those IDs so the client can reuse them on retry instead of duplicating.
 */
class PartialRecordFailure extends Error {
  readonly status: number;
  readonly parties?: PartialParties;

  constructor(message: string, status: number, parties?: PartialParties) {
    super(message);
    this.name = "PartialRecordFailure";
    this.status = status;
    this.parties = parties;
  }
}

/** Pipedrive failures keep their own status; anything else is a server fault. */
function errorStatus(error: unknown): number {
  if (error instanceof PartialResolutionError) return error.status;
  if (error instanceof ConfigurationError) return error.status;

  return error instanceof PipedriveApiError ? error.status : 500;
}

/** Names the records that already exist, so the message cannot overstate them. */
function describeCreatedRecords(parties?: PartialParties): string | undefined {
  const created = [
    parties?.personId !== undefined ? "Kontakten" : undefined,
    parties?.organizationId !== undefined ? "organisationen" : undefined
  ].filter(Boolean);

  if (created.length === 0) return undefined;

  const names = created.join(" och ");
  return created.length > 1
    ? `${names} är redan skapade i Pipedrive och`
    : `${names} är redan skapad i Pipedrive och`;
}

/** Recovers records created before a resolution threw partway through. */
function partialPartiesOf(error: unknown): PartialParties | undefined {
  return error instanceof PartialResolutionError ? error.parties : undefined;
}

function requiredQuery(searchParams: URLSearchParams, name: string) {
  const value = searchParams.get(name);

  if (!value) {
    throw new BadRequestError(`Missing query parameter: ${name}`);
  }

  return value;
}

/** Rejected locally so the user gets a readable message, not Pipedrive's 400. */
function requiredSearchTerm(searchParams: URLSearchParams) {
  const term = requiredQuery(searchParams, "term").trim();

  if (term.length < MIN_SEARCH_TERM_LENGTH) {
    throw new BadRequestError(`Söktermen måste vara minst ${MIN_SEARCH_TERM_LENGTH} tecken.`);
  }

  return term;
}

function jsonOk(data: unknown) {
  return NextResponse.json({ ok: true, data });
}

/**
 * Maps failures to honest status codes. Config problems are the server's fault
 * and must not surface internals to the client, so they are logged and reported
 * as a generic 500.
 */
function jsonError(error: unknown, status?: number) {
  if (typeof status === "number") {
    return NextResponse.json({ ok: false, error: String(error) }, { status });
  }

  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 401 });
  }

  if (error instanceof BadRequestError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  if (error instanceof PartialRecordFailure) {
    const created = describeCreatedRecords(error.parties);

    return NextResponse.json(
      {
        ok: false,
        // Names only what was actually created — claiming both records exist
        // when only the organization does would send the seller looking for a
        // contact that is not there.
        error: created ? `${error.message} ${created} återanvänds vid nytt försök.` : error.message,
        parties: error.parties
      },
      { status: error.status }
    );
  }

  if (error instanceof ZodError) {
    const message = error.issues.map((issue) => `${issue.path.join(".") || "form"}: ${issue.message}`).join("; ");
    return NextResponse.json({ ok: false, error: message }, { status: 422 });
  }

  // A deal/organization pairing the seller has to correct, not a server fault.
  if (error instanceof DealOwnershipError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }

  if (error instanceof ExistingRecordProtectionError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }

  // Setup problems are actionable, so the message is surfaced rather than hidden
  // behind a generic 500. It names env var keys, never their values.
  if (error instanceof ConfigurationError) {
    console.error("Configuration error:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }

  if (error instanceof PipedriveApiError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }

  console.error("Unhandled Pipedrive route error:", error);
  return NextResponse.json({ ok: false, error: "Ett internt fel uppstod." }, { status: 500 });
}
