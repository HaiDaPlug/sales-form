import { getEnv } from "@/lib/config/env";
import { verifyPassword } from "@/lib/auth/password";
import { findPortalUser, getPortalUsers, type PortalUser } from "@/lib/auth/users";

export const SESSION_COOKIE_NAME = "dk_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

/**
 * Per-seller accounts, signed into a cookie.
 *
 * The payload is the seller's identity for every later request: `subject` is
 * the display name that labels history entries and contracts, and
 * `sellerOptionId` is the "Affärens säljare" option that scopes prospects,
 * meetings and the status page. Neither is ever read from a request body — a
 * route that needs the seller reads the session.
 *
 * `verifyCredentials` is the only place that decides who gets in. Swapping the
 * password check for SSO later means replacing that function and the login
 * form; the proxy, cookie handling and every route stay as they are.
 */
export type SessionPayload = {
  /** Display name. */
  subject: string;
  username: string;
  sellerOptionId: string | number;
  issuedAt: number;
  expiresAt: number;
};

export function isAuthConfigured(): boolean {
  const env = getEnv();

  if (!env.APP_SESSION_SECRET) return false;

  try {
    return getPortalUsers().length > 0;
  } catch {
    return false;
  }
}

export function assertAuthConfigured() {
  const env = getEnv();

  if (!env.APP_SESSION_SECRET) {
    throw new Error("Missing APP_SESSION_SECRET. Add a random string of at least 16 characters to .env.local.");
  }

  if (getPortalUsers().length === 0) {
    throw new Error("Missing APP_USERS. Add at least one seller account to .env.local.");
  }
}

/**
 * The single decision point for "is this person allowed in".
 *
 * An unknown username still runs one password verification, so the response
 * time does not reveal which usernames exist.
 */
export function verifyCredentials(input: { username: string; password: string }): PortalUser | null {
  const user = findPortalUser(input.username);

  if (!user) {
    verifyPassword(input.password, UNKNOWN_USER_HASH);
    return null;
  }

  return verifyPassword(input.password, user.passwordHash) ? user : null;
}

/** A well-formed hash no password matches; costs the same as a real check. */
const UNKNOWN_USER_HASH = `scrypt$${"00".repeat(16)}$${"00".repeat(64)}`;

export async function createSessionToken(user: {
  subject: string;
  username: string;
  sellerOptionId: string | number;
}): Promise<string> {
  assertAuthConfigured();

  const issuedAt = Date.now();
  const payload: SessionPayload = {
    subject: user.subject,
    username: user.username,
    sellerOptionId: user.sellerOptionId,
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
    const payload = JSON.parse(base64UrlDecode(body)) as Partial<SessionPayload>;

    if (typeof payload.expiresAt !== "number" || payload.expiresAt < Date.now()) return null;
    if (typeof payload.subject !== "string" || payload.subject.length === 0) return null;
    if (typeof payload.username !== "string" || payload.username.length === 0) return null;
    // A cookie from before seller accounts existed has no option id and cannot
    // scope anything; it is simply expired.
    if (!isRecordId(payload.sellerOptionId)) return null;
    if (typeof payload.issuedAt !== "number") return null;

    return payload as SessionPayload;
  } catch {
    return null;
  }
}

function isRecordId(value: unknown): value is string | number {
  return (typeof value === "string" && value.length > 0) || (typeof value === "number" && Number.isFinite(value));
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
