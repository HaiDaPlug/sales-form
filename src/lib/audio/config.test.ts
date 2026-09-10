import { afterEach, describe, expect, it } from "vitest";
import { resetEnvCache } from "@/lib/config/env";
import { audioTransport, blobPathnameFor, isAcceptedAudio, isBlobPathnameForLead, sanitizeFileName } from "@/lib/audio/config";

afterEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  resetEnvCache();
});

describe("isAcceptedAudio", () => {
  it.each(["samtal.mp3", "Samtal 2026-09-09.M4A", "inspelning.wav", "möte.ogg", "call.webm"])("accepts %s", (name) => {
    expect(isAcceptedAudio(name)).toBe(true);
  });

  it.each(["avtal.pdf", "bild.png", "script.exe", "noext"])("rejects %s", (name) => {
    expect(isAcceptedAudio(name, "application/octet-stream")).toBe(false);
  });

  it("falls back to the content type when the name has no known extension", () => {
    expect(isAcceptedAudio("recording", "audio/mp4")).toBe(true);
  });
});

describe("blob pathnames", () => {
  it("stages a recording under the prospect's own folder", () => {
    expect(blobPathnameFor("lead-1", "samtal.mp3")).toBe("prospects/lead-1/samtal.mp3");
  });

  it("accepts a path in that folder and nothing else", () => {
    expect(isBlobPathnameForLead("prospects/lead-1/samtal.mp3", "lead-1")).toBe(true);
    expect(isBlobPathnameForLead("prospects/lead-1/samtal-abc123.mp3", "lead-1")).toBe(true);
    expect(isBlobPathnameForLead("prospects/lead-2/samtal.mp3", "lead-1")).toBe(false);
    expect(isBlobPathnameForLead("prospects/lead-1/", "lead-1")).toBe(false);
    expect(isBlobPathnameForLead("prospects/lead-1/../lead-2/x.mp3", "lead-1")).toBe(false);
    expect(isBlobPathnameForLead("other/lead-1/samtal.mp3", "lead-1")).toBe(false);
  });

  it("strips path separators from a file name but keeps it readable", () => {
    expect(sanitizeFileName("../etc/passwd.mp3")).toBe(".._etc_passwd.mp3");
    expect(sanitizeFileName("Samtal   med  Anna.m4a")).toBe("Samtal med Anna.m4a");
    expect(sanitizeFileName("   ")).toBe("ljudfil");
  });
});

describe("audioTransport", () => {
  it("uses Blob when a token is configured, otherwise the direct route", () => {
    expect(audioTransport()).toBe("direct");

    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    resetEnvCache();

    expect(audioTransport()).toBe("blob");
  });
});
