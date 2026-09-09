import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/config/env";

vi.mock("@/lib/pipedrive/service", () => ({
  getLead: vi.fn(),
  uploadFile: vi.fn(),
  setLeadUnderlag: vi.fn(),
  createNote: vi.fn()
}));

const service = await import("@/lib/pipedrive/service");
const { attachAudioToProspect, AudioStatusError, ProspectAccessError } = await import("@/lib/prospects/audio");
const { ConfigurationError } = await import("@/lib/config/pipedrive");

const SELLER_KEY = "seller_key";
const seller = { optionId: 74, name: "Adam Westin" };
const file = new Blob(["ljud"], { type: "audio/mpeg" });

beforeEach(() => {
  process.env.PIPEDRIVE_FIELD_AFFARENS_SALJARE = SELLER_KEY;
  resetEnvCache();
  vi.mocked(service.getLead)
    .mockReset()
    .mockResolvedValue({ id: "lead-1", title: "Andersson AB Prospekt", organization_id: 7, [SELLER_KEY]: 74 });
  vi.mocked(service.uploadFile).mockReset().mockResolvedValue({ id: 800 });
  vi.mocked(service.setLeadUnderlag).mockReset().mockResolvedValue({});
  vi.mocked(service.createNote).mockReset().mockResolvedValue({ id: 900 });
});

afterEach(() => {
  delete process.env.PIPEDRIVE_FIELD_AFFARENS_SALJARE;
  resetEnvCache();
});

describe("attachAudioToProspect", () => {
  it("uploads to the prospect and its organization, then sets the status", async () => {
    const result = await attachAudioToProspect({ leadId: "lead-1", file, fileName: "samtal.mp3", seller });

    expect(service.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: "lead-1", organizationId: 7, fileName: "samtal.mp3" })
    );
    expect(service.setLeadUnderlag).toHaveBeenCalledWith("lead-1", "audioUploaded");
    expect(result).toMatchObject({ fileId: 800, organizationId: 7, leadTitle: "Andersson AB Prospekt" });
    expect(result.warning).toBeUndefined();
  });

  /**
   * "Ljudfil uppladdad" is the portal's claim that evidence exists. It must
   * follow the upload, never precede or survive a failed one.
   */
  it("writes the status only after Pipedrive has accepted the file", async () => {
    const order: string[] = [];
    vi.mocked(service.uploadFile).mockImplementation(async () => {
      order.push("upload");
      return { id: 800 };
    });
    vi.mocked(service.setLeadUnderlag).mockImplementation(async () => {
      order.push("status");
      return {};
    });

    await attachAudioToProspect({ leadId: "lead-1", file, fileName: "samtal.mp3", seller });

    expect(order).toEqual(["upload", "status"]);
  });

  it("leaves the status untouched when the upload fails", async () => {
    vi.mocked(service.uploadFile).mockRejectedValue(new Error("413 för stor"));

    await expect(attachAudioToProspect({ leadId: "lead-1", file, fileName: "samtal.mp3", seller })).rejects.toThrow(
      "413"
    );
    expect(service.setLeadUnderlag).not.toHaveBeenCalled();
  });

  it("refuses a prospect assigned to another seller before uploading anything", async () => {
    vi.mocked(service.getLead).mockResolvedValue({ id: "lead-1", organization_id: 7, [SELLER_KEY]: 72 });

    await expect(attachAudioToProspect({ leadId: "lead-1", file, fileName: "samtal.mp3", seller })).rejects.toBeInstanceOf(
      ProspectAccessError
    );
    expect(service.uploadFile).not.toHaveBeenCalled();
  });

  it("refuses a prospect with no seller at all", async () => {
    vi.mocked(service.getLead).mockResolvedValue({ id: "lead-1", organization_id: 7 });

    await expect(attachAudioToProspect({ leadId: "lead-1", file, fileName: "samtal.mp3", seller })).rejects.toBeInstanceOf(
      ProspectAccessError
    );
  });

  it("treats an unmapped seller field as a configuration problem", async () => {
    delete process.env.PIPEDRIVE_FIELD_AFFARENS_SALJARE;
    resetEnvCache();

    await expect(attachAudioToProspect({ leadId: "lead-1", file, fileName: "samtal.mp3", seller })).rejects.toBeInstanceOf(
      ConfigurationError
    );
    expect(service.getLead).not.toHaveBeenCalled();
  });

  it("reports a failed note as a warning on a completed upload", async () => {
    vi.mocked(service.createNote).mockRejectedValue(new Error("note nere"));

    const result = await attachAudioToProspect({ leadId: "lead-1", file, fileName: "samtal.mp3", seller });

    expect(result.fileId).toBe(800);
    expect(result.warning).toContain("anteckningen");
  });

  /** Retrying blind would attach a second copy, so this outcome is named. */
  it("names the uploaded file when the status could not follow", async () => {
    vi.mocked(service.setLeadUnderlag).mockRejectedValue(new Error("fält saknas"));

    const error = await attachAudioToProspect({ leadId: "lead-1", file, fileName: "samtal.mp3", seller }).catch(
      (thrown) => thrown
    );

    expect(error).toBeInstanceOf(AudioStatusError);
    expect(error.fileId).toBe(800);
    expect(error.message).toContain("Ladda inte upp filen igen");
    expect(service.createNote).not.toHaveBeenCalled();
  });
});
