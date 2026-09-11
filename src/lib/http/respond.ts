import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "@/lib/auth/server";
import { ConfigurationError } from "@/lib/config/pipedrive";
import { PipedriveApiError } from "@/lib/pipedrive/client";

/** A request the caller has to correct. */
export class BadRequestError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

export function jsonOk(data: unknown, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

/**
 * Maps a failure to an honest status and a message a seller can act on.
 *
 * Anything carrying its own `status` — the domain errors above and in the
 * services — is passed through. Everything else is a server fault, logged in
 * full and reported without internals.
 */
export function jsonError(error: unknown, extra: Record<string, unknown> = {}) {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ ok: false, error: error.message, ...extra }, { status: 401 });
  }

  if (error instanceof ZodError) {
    const message = error.issues.map((issue) => `${issue.path.join(".") || "form"}: ${issue.message}`).join("; ");
    return NextResponse.json({ ok: false, error: message, ...extra }, { status: 422 });
  }

  if (error instanceof ConfigurationError) {
    console.error("Configuration error:", error.message);
    return NextResponse.json({ ok: false, error: error.message, ...extra }, { status: error.status });
  }

  if (error instanceof BadRequestError || error instanceof PipedriveApiError || hasStatus(error)) {
    return NextResponse.json({ ok: false, error: error.message, ...extra }, { status: error.status });
  }

  // The message may name a table, a column or a connection host, so it stays
  // out of the response. The reference does not: it ties what the user is
  // looking at to the line in the log that explains it, which is the only way
  // to diagnose a deployed failure without reproducing it first.
  const reference = Math.random().toString(36).slice(2, 8).toUpperCase();
  console.error(`Unhandled route error [${reference}]:`, error);

  return NextResponse.json(
    { ok: false, error: `Ett internt fel uppstod. Referens: ${reference}`, ...extra },
    { status: 500 }
  );
}

function hasStatus(error: unknown): error is Error & { status: number } {
  return error instanceof Error && typeof (error as { status?: unknown }).status === "number";
}
