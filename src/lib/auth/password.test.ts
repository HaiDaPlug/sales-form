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

  it.each(["", "plain-text", "scrypt$abc", "bcrypt$00$11", "scrypt$zz$11"])(
    "rejects the malformed stored value %j instead of throwing",
    (stored) => {
      expect(verifyPassword("x", stored)).toBe(false);
    }
  );

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
