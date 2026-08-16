import { assertPipedriveToken, getPipedriveConfig } from "@/lib/config/pipedrive";
import type { PipedriveResponse } from "@/lib/pipedrive/types";

type RequestOptions = {
  // Intentionally creation/read-only: this app must not update or delete
  // existing CRM records. Adding PUT/PATCH/DELETE requires an explicit policy change.
  method?: "GET" | "POST";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  formData?: FormData;
};

/**
 * Upstream failure. Carries Pipedrive's status so the route layer can map it to
 * a sensible response instead of flattening everything to 400.
 */
export class PipedriveApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PipedriveApiError";
    this.status = status;
  }
}

export async function pipedriveRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const config = getPipedriveConfig();
  const token = assertPipedriveToken(config);
  const url = new URL(`${config.apiBaseUrl}${path}`);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  // Token travels in a header rather than the query string, so it cannot leak
  // into proxy logs, browser history, or Referer headers.
  const headers: HeadersInit = { "x-api-token": token };
  let body: BodyInit | undefined;

  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body,
      cache: "no-store"
    });
  } catch (error) {
    throw new PipedriveApiError(
      `Kunde inte nå Pipedrive: ${error instanceof Error ? error.message : String(error)}`,
      502
    );
  }

  const payload = (await response.json().catch(() => null)) as PipedriveResponse<T> | null;

  if (!response.ok || payload?.success === false) {
    const message = payload?.error ?? `Pipedrive request failed: ${response.status}`;
    throw new PipedriveApiError(message, response.status || 502);
  }

  return payload?.data as T;
}
