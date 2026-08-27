import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireSession, UnauthorizedError } from "@/lib/auth/server";
import { assertCustomFieldMappings, ConfigurationError, getPipedriveConfig } from "@/lib/config/pipedrive";
import { PipedriveApiError } from "@/lib/pipedrive/client";
import {
  buildDealPayload,
  buildMeetingActivityPayload,
  createActivity,
  createDeal,
  createNote,
  createOrganization,
  createPerson,
  DealOwnershipError,
  ExistingRecordProtectionError,
  PartialResolutionError,
  getCustomFieldMappings,
  getDealFields,
  getOrganizationFields,
  getPersonFields,
  getPipelines,
  getSellers,
  getStages,
  getUsers,
  MIN_SEARCH_TERM_LENGTH,
  resolveDealParties,
  resolveMeetingParties,
  searchDeals,
  searchOrganizations,
  searchPersons,
  type PartialParties,
  type ResolvedDealParties,
  type ResolvedMeetingParties
} from "@/lib/pipedrive/service";
import {
  createActivitySchema,
  createNoteSchema,
  createOrganizationSchema,
  createPersonSchema,
  dealStepSchema,
  meetingStepSchema
} from "@/lib/crm/schemas";
import { recordHistory, recordHistorySafely } from "@/lib/history/store";

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

    if (operation === "users") return jsonOk(await getUsers());
    if (operation === "sellers") return jsonOk(await getSellers());
    if (operation === "pipelines") return jsonOk(await getPipelines());
    if (operation === "stages") return jsonOk(await getStages(searchParams.get("pipelineId") ?? undefined));
    if (operation === "custom-field-mappings") return jsonOk(getCustomFieldMappings());
    if (operation === "deal-fields") return jsonOk(await getDealFields());
    if (operation === "person-fields") return jsonOk(await getPersonFields());
    if (operation === "organization-fields") return jsonOk(await getOrganizationFields());
    if (operation === "scheduler-config") {
      return jsonOk({
        provider: "pipedrive",
        bookingUrl: getPipedriveConfig().schedulerUrl ?? null,
        createsActivityAfterBooking: true
      });
    }

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
      const customerName = parsed.organization?.name ?? parsed.person.name;

      let meetingParties: ResolvedMeetingParties | undefined;

      try {
        // The contact (and organization, when named) must exist before the
        // activity can be attached to anything.
        meetingParties = await resolveMeetingParties(parsed);

        const activity = await createActivity(buildMeetingActivityPayload(parsed, meetingParties));

        // The activity exists from here on. History is a local convenience, so
        // its failure must never turn a completed booking into an error the
        // seller would retry — that is how duplicate activities are created.
        await recordHistorySafely({
          kind: "meeting",
          status: "success",
          createdBy: session.subject,
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
          session.subject,
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

    if (operation === "deals") {
      const parsed = dealStepSchema.parse(body);

      // Config is checked before anything is created: a later failure would
      // otherwise leave orphaned person/organization records behind.
      assertCustomFieldMappings();

      let parties: ResolvedDealParties | undefined;

      try {
        parties = await resolveDealParties(parsed);

        const deal = await createDeal(await buildDealPayload(parsed, parties));

        // The deal exists from here on; a history failure must not present it
        // as a failed run the seller would retry into a duplicate deal.
        await recordHistorySafely({
          kind: "deal",
          status: "success",
          createdBy: session.subject,
          customerName: parsed.organization.name,
          summary: `${parsed.deal.title} — ${parsed.deal.value} ${parsed.deal.currency ?? "SEK"}`,
          pipedriveDealId: readRecordId(deal),
          pipedrivePersonId: parties.personId,
          pipedriveOrganizationId: parties.organizationId,
          payload: parsed
        });

        // The resolved IDs travel back so the wizard can reuse them instead of
        // re-creating the same records on a retry.
        return jsonOk({ ...(deal as Record<string, unknown>), _parties: parties });
      } catch (error) {
        if (error instanceof ExistingRecordProtectionError) throw error;

        // Resolution may have created an organization before failing on the
        // person; recover it rather than losing the ID.
        const partial = parties ?? partialPartiesOf(error);

        await recordFailure("deal", session.subject, parsed.organization.name, parsed.deal.title, error, partial);

        // Person/organization may already exist in Pipedrive even though the
        // deal failed. Deleting them is not an option (the token may lack
        // permission, and removing real CRM records is worse than keeping
        // them), so the IDs are returned instead — the wizard fills them in so
        // a retry reuses the records rather than creating duplicates.
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

async function recordFailure(
  kind: "meeting" | "deal",
  createdBy: string,
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
      createdBy,
      customerName,
      summary,
      // Records created before the failure are logged so they are traceable
      // rather than silently orphaned in the CRM.
      pipedrivePersonId: parties?.personId,
      pipedriveOrganizationId: parties?.organizationId,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  } catch {
    /* ignored */
  }
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
