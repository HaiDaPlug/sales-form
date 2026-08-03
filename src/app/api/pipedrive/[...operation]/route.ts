import { NextRequest, NextResponse } from "next/server";
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
  searchDeals,
  searchOrganizations,
  searchPersons,
  updateOrganization,
  updatePerson,
  uploadFile
} from "@/lib/pipedrive/service";
import { dealStepSchema, meetingStepSchema } from "@/lib/crm/schemas";

type RouteContext = {
  params: Promise<{
    operation: string[];
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const operation = (await context.params).operation.join("/");
    const searchParams = request.nextUrl.searchParams;

    if (operation === "persons/search") {
      return jsonOk(await searchPersons(requiredQuery(searchParams, "term")));
    }

    if (operation === "organizations/search") {
      return jsonOk(await searchOrganizations(requiredQuery(searchParams, "term")));
    }

    if (operation === "deals/search") {
      return jsonOk(
        await searchDeals(
          requiredQuery(searchParams, "term"),
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
    const operation = (await context.params).operation.join("/");
    const body = await request.json();

    if (operation === "persons") return jsonOk(await createPerson(body));
    if (operation === "persons/update") return jsonOk(await updatePerson(body.id, body.payload));
    if (operation === "organizations") return jsonOk(await createOrganization(body));
    if (operation === "organizations/update") return jsonOk(await updateOrganization(body.id, body.payload));
    if (operation === "persons/link-organization") {
      return jsonOk(await linkPersonToOrganization(body.personId, body.organizationId));
    }

    if (operation === "activities/meeting") {
      const parsed = meetingStepSchema.parse(body);
      return jsonOk(await createActivity(buildMeetingActivityPayload(parsed)));
    }

    if (operation === "deals") {
      const parsed = dealStepSchema.parse(body);
      return jsonOk(await createDeal(buildDealPayload(parsed)));
    }

    if (operation === "activities") return jsonOk(await createActivity(body));
    if (operation === "notes") return jsonOk(await createNote(body));
    if (operation === "files") return jsonOk(await uploadFile(body));

    return jsonError(`Unknown Pipedrive POST operation: ${operation}`, 404);
  } catch (error) {
    return jsonError(error);
  }
}

function requiredQuery(searchParams: URLSearchParams, name: string) {
  const value = searchParams.get(name);

  if (!value) {
    throw new Error(`Missing query parameter: ${name}`);
  }

  return value;
}

function jsonOk(data: unknown) {
  return NextResponse.json({ ok: true, data });
}

function jsonError(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ ok: false, error: message }, { status });
}
