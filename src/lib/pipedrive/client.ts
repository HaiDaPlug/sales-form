import { assertPipedriveToken, getPipedriveConfig } from "@/lib/config/pipedrive";
import type { PipedriveResponse } from "@/lib/pipedrive/types";

type RequestOptions = {
  method?: "GET" | "POST" | "PUT";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  formData?: FormData;
};

export async function pipedriveRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const config = getPipedriveConfig();
  const token = assertPipedriveToken(config);
  const url = new URL(`${config.apiBaseUrl}${path}`);

  url.searchParams.set("api_token", token);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: HeadersInit = {};
  let body: BodyInit | undefined;

  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body,
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => null)) as PipedriveResponse<T> | null;

  if (!response.ok || payload?.success === false) {
    const message = payload?.error ?? `Pipedrive request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload?.data as T;
}
