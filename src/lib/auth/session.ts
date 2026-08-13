import { getEnv } from "@/lib/config/env";

export const SESSION_COOKIE_NAME = "dk_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

/**
 * Shared-password gate for internal use.
 *
 * Deliberately narrow: `verifyCredentials` is the only place that decides who
 * gets in, and `getSessionSubject` is the only place that names them. Swapping
 * this for SSO/OAuth later means replacing those two functions and the login
 * form — the proxy, cookie handling, and every route stay as they are.
 */
export type SessionPayload = {
  subject: string;
  issuedAt: number;
  expiresAt: number;
};

export function isAuthConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.APP_ACCESS_PASSWORD && env.APP_SESSION_SECRET);
}

export function assertAuthConfigured() {
  const env = getEnv();

  if (!env.APP_ACCESS_PASSWORD) {
    throw new Error("Missing APP_ACCESS_PASSWORD. Add it to .env.local.");
  }

  if (!env.APP_SESSION_SECRET) {
    throw new Error("Missing APP_SESSION_SECRET. Add a random string of at least 16 characters to .env.local.");
  }
}

/** The single decision point for "is this person allowed in". */
export function verifyCredentials(input: { name: string; password: string }): boolean {
  const env = getEnv();

  if (!env.APP_ACCESS_PASSWORD) return false;

  return timingSafeEqual(input.password, env.APP_ACCESS_PASSWORD);
}

/** The single decision point for "who is this person" — used to attribute history. */
export function getSessionSubject(input: { name: string }): string {
  return input.name.trim() || "Okänd användare";
}

export async function createSessionToken(subject: string): Promise<string> {
  assertAuthConfigured();

  const issuedAt = Date.now();
  const payload: SessionPayload = {
    subject,
    issuedAt,
    expiresAt: issuedAt + SESSION_MAX_AGE_SECONDS * 1000
  };

  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = await sign(body);

  return `${body}.${signature}`;
}

export async function verifySessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;

  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = await sign(body);
  if (!timingSafeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(body)) as SessionPayload;
    if (typeof payload.expiresAt !== "number" || payload.expiresAt < Date.now()) return null;
    if (typeof payload.subject !== "string" || payload.subject.length === 0) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * HMAC-SHA256 via WebCrypto rather than node:crypto — the proxy runs on the
 * Edge runtime, where node built-ins are unavailable.
 */
async function sign(body: string): Promise<string> {
  const env = getEnv();
  const secret = env.APP_SESSION_SECRET;

  if (!secret) throw new Error("Missing APP_SESSION_SECRET.");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));

  return base64UrlFromBytes(new Uint8Array(signature));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return mismatch === 0;
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEncode(value: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(value));
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}
