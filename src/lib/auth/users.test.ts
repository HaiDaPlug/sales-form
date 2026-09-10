import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCache } from "@/lib/config/env";
import { findPortalUser, getPortalUsers, resetPortalUsersCache } from "@/lib/auth/users";

function setUsers(value: unknown) {
  process.env.APP_USERS = typeof value === "string" ? value : JSON.stringify(value);
  resetEnvCache();
  resetPortalUsersCache();
}

const filippa = { username: "filippa", name: "Filippa", sellerOptionId: 72, passwordHash: "scrypt$00$11" };
const robin = { username: "Robin", name: "Robin", sellerOptionId: "73", passwordHash: "scrypt$00$22" };

beforeEach(() => setUsers([filippa, robin]));

afterEach(() => {
  delete process.env.APP_USERS;
  resetEnvCache();
  resetPortalUsersCache();
});

describe("portal users", () => {
  it("reads the accounts with their seller option ids", () => {
    expect(getPortalUsers()).toEqual([filippa, robin]);
  });

  it("finds a user regardless of case and surrounding whitespace", () => {
    expect(findPortalUser("  ROBIN ")?.sellerOptionId).toBe("73");
  });

  it("returns no user for an unknown name", () => {
    expect(findPortalUser("adam")).toBeUndefined();
  });

  it("has no users when APP_USERS is unset", () => {
    delete process.env.APP_USERS;
    resetEnvCache();
    resetPortalUsersCache();

    expect(getPortalUsers()).toEqual([]);
  });

  it("fails loudly on unreadable JSON rather than locking everyone out silently", () => {
    setUsers("{not json");

    expect(() => getPortalUsers()).toThrow(/JSON/);
  });

  it("rejects an account with no seller option id", () => {
    setUsers([{ username: "x", name: "X", passwordHash: "scrypt$00$11" }]);

    expect(() => getPortalUsers()).toThrow(/sellerOptionId/);
  });

  it("rejects two accounts sharing a username", () => {
    setUsers([filippa, { ...robin, username: "FILIPPA" }]);

    expect(() => getPortalUsers()).toThrow(/mer än en gång/);
  });
});
