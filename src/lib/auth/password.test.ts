import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { hashPassword as hashPasswordScript } from "../../../scripts/password-hash.mjs";

describe("password hashing", () => {
  it("verifies the password it hashed", () => {
    const stored = hashPassword("hemligt lösenord");

    expect(verifyPassword("hemligt lösenord", stored)).toBe(true);
  });

  it("rejects a different password", () => {
    const stored = hashPassword("hemligt lösenord");

    expect(verifyPassword("hemligt losenord", stored)).toBe(false);
  });

  it("salts, so the same password hashes differently twice", () => {
    expect(hashPassword("samma")).not.toBe(hashPassword("samma"));
  });

  it.each(["", "plain-text", "scrypt.abc", "bcrypt.00.11", "scrypt.zz.11"])(
    "rejects the malformed stored value %j instead of throwing",
    (stored) => {
      expect(verifyPassword("x", stored)).toBe(false);
    }
  );

  /**
   * These hashes live inside APP_USERS in an env file, where `$name` is read as
   * a variable reference and expanded away. A `$`-separated hash reached the
   * server as the bare string "scrypt" and every login failed with the correct
   * password — silently, because the accounts still parsed.
   */
  it("uses no character an env loader would expand", () => {
    const stored = hashPassword("hemligt");

    expect(stored).not.toContain("$");
    expect(stored.split(".")).toHaveLength(3);
  });

  it("survives a round trip through an env-style variable expansion", () => {
    const stored = hashPassword("hemligt");
    // What a loader does to a value: replace $NAME with its (absent) value.
    const expanded = stored.replace(/\$[A-Za-z_][A-Za-z0-9_]*/g, "");

    expect(expanded).toBe(stored);
    expect(verifyPassword("hemligt", expanded)).toBe(true);
  });

  /**
   * The CLI that produces hashes for APP_USERS is plain JavaScript and cannot
   * import the TypeScript module. This is what keeps the two from drifting.
   */
  it("verifies a hash produced by the hash-password script", () => {
    const stored = hashPasswordScript("från skriptet") as string;

    expect(verifyPassword("från skriptet", stored)).toBe(true);
    expect(verifyPassword("annat", stored)).toBe(false);
  });
});
