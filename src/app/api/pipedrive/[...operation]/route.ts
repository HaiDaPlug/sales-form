import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireSession, UnauthorizedError } from "@/lib/auth/server";
import { assertCustomFieldMappings, ConfigurationError } from "@/lib/config/pipedrive";
import { PipedriveApiError } from "@/lib/pipedrive/client";
import {
  buildDealPayload,
  buildMeetingActivityPayload,
  createActivity,
  createDeal,
  createNote,
  createOrganization,
  createPerson,
  getCustomFieldMappings,
  getDealFields,
  getOrganizationFields,
  getPersonFields,
  getPipelines,
  getStages,
  getUsers,
  linkPersonToOrganization,
  MIN_SEARCH_TERM_LENGTH,
  resolveDealParties,
  searchDeals,
  searchOrganizations,
  searchPersons,
  updateOrganization,
  updatePerson,
  type ResolvedDealParties
} from "@/lib/pipedrive/service";
import {
  createActivitySchema,
  createNoteSchema,
  createOrganizationSchema,
  createPersonSchema,
  dealStepSchema,
  linkPersonOrganizationSchema,
  meetingStepSchema,
  updateOrganizationSchema,
  updatePersonSchema
} from "@/lib/crm/schemas";
import { recordHistory } from "@/lib/history/store";

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
    if (operation === "pipelines") return jsonOk(await getPipelines());
    if (operation === "stages") return jsonOk(await getStages(searchParams.get("pipelineId") ?? undefined));
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

    if (operation === "persons/update") {
      const parsed = updatePersonSchema.parse(body);
      return jsonOk(await updatePerson(parsed.id, parsed.payload));
    }

    if (operation === "organizations") {
      return jsonOk(await createOrganization(createOrganizationSchema.parse(body)));
    }

    if (operation === "organizations/update") {
      const parsed = updateOrganizationSchema.parse(body);
      return jsonOk(await updateOrganization(parsed.id, parsed.payload));
    }

    if (operation === "persons/link-organization") {
      const parsed = linkPersonOrganizationSchema.parse(body);
      return jsonOk(await linkPersonToOrganization(parsed.personId, parsed.organizationId));
    }

    if (operation === "activities/meeting") {
      const parsed = meetingStepSchema.parse(body);
      const customerName = parsed.organization?.name ?? parsed.person.name;

      try {
        const activity = await createActivity(buildMeetingActivityPayload(parsed));

        await recordHistory({
          kind: "meeting",
          status: "success",
          createdBy: session.subject,
          customerName,
          summary: `${parsed.meetingType} ${parsed.date} ${parsed.time} med ${parsed.person.name}`,
          pipedriveActivityId: readRecordId(activity),
          pipedrivePersonId: parsed.person.id,
          pipedriveOrganizationId: parsed.organization?.id,
          payload: parsed
        });

        return jsonOk(activity);
      } catch (error) {
        await recordFailure("meeting", session.subject, customerName, `Mötesbokning för ${parsed.person.name}`, error);
        throw error;
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

        const deal = await createDeal(buildDealPayload(parsed, parties));

        await recordHistory({
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
        await recordFailure("deal", session.subject, parsed.organization.name, parsed.deal.title, error, parties);

        // Person/organization may already exist in Pipedrive even though the
        // deal failed. Deleting them is not an option (the token may lack
        // permission, and removing real CRM records is worse than keeping
        // them), so the IDs are returned instead — the wizard fills them in so
        // a retry reuses the records rather than creating duplicates.
        throw new PartialDealFailure(
          error instanceof Error ? error.message : String(error),
          error instanceof PipedriveApiError ? error.status : 500,
          parties
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
  parties?: ResolvedDealParties
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
 * A deal that failed after its person/organization were already created.
 * Carries those IDs so the client can reuse them on retry.
 */
class PartialDealFailure extends Error {
  readonly status: number;
  readonly parties?: ResolvedDealParties;

  constructor(message: string, status: number, parties?: ResolvedDealParties) {
    super(message);
    this.name = "PartialDealFailure";
    this.status = status;
    this.parties = parties;
  }
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

  if (error instanceof PartialDealFailure) {
    return NextResponse.json(
      {
        ok: false,
        error: error.parties
          ? `${error.message} Kontakt och organisation är redan skapade och återanvänds vid nytt försök.`
          : error.message,
        parties: error.parties
      },
      { status: error.status }
    );
  }

  if (error instanceof ZodError) {
    const message = error.issues.map((issue) => `${issue.path.join(".") || "form"}: ${issue.message}`).join("; ");
    return NextResponse.json({ ok: false, error: message }, { status: 422 });
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
