import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import { createSessionToken, isAuthConfigured, verifyCredentials, verifySessionToken } from "@/lib/auth/session";
import { resetPortalUsersCache } from "@/lib/auth/users";
import { resetEnvCache } from "@/lib/config/env";

const users = [
  { username: "filippa", name: "Filippa", sellerOptionId: 72, passwordHash: hashPassword("filippas lösenord") },
  { username: "robin", name: "Robin", sellerOptionId: 73, passwordHash: hashPassword("robins lösenord") }
];

beforeEach(() => {
  process.env.APP_SESSION_SECRET = "en-hemlighet-som-är-lång-nog";
  process.env.APP_USERS = JSON.stringify(users);
  resetEnvCache();
  resetPortalUsersCache();
});

afterEach(() => {
  delete process.env.APP_SESSION_SECRET;
  delete process.env.APP_USERS;
  resetEnvCache();
  resetPortalUsersCache();
});

describe("verifyCredentials", () => {
  it("returns the account for a correct username and password", () => {
    expect(verifyCredentials({ username: "filippa", password: "filippas lösenord" })?.sellerOptionId).toBe(72);
  });

  it("rejects the right password on the wrong account", () => {
    // Two sellers must never be able to log in as each other.
    expect(verifyCredentials({ username: "robin", password: "filippas lösenord" })).toBeNull();
  });

  it("rejects an unknown username", () => {
    expect(verifyCredentials({ username: "adam", password: "filippas lösenord" })).toBeNull();
  });
});

describe("session token", () => {
  it("carries the seller identity through a round trip", async () => {
    const token = await createSessionToken({ subject: "Filippa", username: "filippa", sellerOptionId: 72 });

    await expect(verifySessionToken(token)).resolves.toMatchObject({
      subject: "Filippa",
      username: "filippa",
      sellerOptionId: 72
    });
  });

  it("rejects a token whose body was altered", async () => {
    const token = await createSessionToken({ subject: "Filippa", username: "filippa", sellerOptionId: 72 });
    const [, signature] = token.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ subject: "Filippa", username: "filippa", sellerOptionId: 73, issuedAt: 1, expiresAt: Date.now() + 1e6 })
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await expect(verifySessionToken(`${forgedBody}.${signature}`)).resolves.toBeNull();
  });

  /**
   * Cookies issued before seller accounts existed carry only a name. They can
   * scope nothing, so they must read as expired rather than as a nameless seller.
   */
  it("rejects a token without a seller option id", async () => {
    const legacyBody = Buffer.from(JSON.stringify({ subject: "Roble", issuedAt: 1, expiresAt: Date.now() + 1e6 }))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    // Signed correctly for this secret, so only the shape check can reject it.
    const signedLegacy = await signLike(legacyBody);

    await expect(verifySessionToken(signedLegacy)).resolves.toBeNull();
  });
});

describe("isAuthConfigured", () => {
  it("is true with a secret and at least one account", () => {
    expect(isAuthConfigured()).toBe(true);
  });

  it("is false without accounts", () => {
    delete process.env.APP_USERS;
    resetEnvCache();
    resetPortalUsersCache();

    expect(isAuthConfigured()).toBe(false);
  });

  it("is false when the account list is unreadable", () => {
    process.env.APP_USERS = "not json";
    resetEnvCache();
    resetPortalUsersCache();

    expect(isAuthConfigured()).toBe(false);
  });
});

/** Produces `body.signature` for an arbitrary body using the module's own signer. */
async function signLike(body: string): Promise<string> {
  // Sign a real token, then reuse its signature algorithm by re-signing the
  // legacy body: the signature is HMAC over the body alone.
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(process.env.APP_SESSION_SECRET as string),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  let binary = "";
  for (const byte of signature) binary += String.fromCharCode(byte);

  return `${body}.${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}
