import { describe, expect, it } from "vitest";
import { UploadState } from "./upload-state";

describe("UploadState", () => {
  it("keeps a stable backup id and records bounded retry outcomes", () => {
    const state = new UploadState({ maxAttempts: 2 });

    const first = state.recordAttempt("results.csv", "failed", "503");
    const second = state.recordAttempt("results.csv", "timeout", "timeout");

    expect(first.backupId).toBe(second.backupId);
    expect(state.pendingRetries()).toEqual([]);
    expect(state.getManifest().files[0]).toMatchObject({
      filename: "results.csv",
      attempts: 2,
      uploadStatus: "timeout",
    });
  });

  it("keeps failed files pending and marks a final upload separately", () => {
    const state = new UploadState();

    state.recordAttempt("session.csv", "success");
    state.recordAttempt("events.csv", "failed", "network");

    expect(state.pendingRetries().map((file) => file.filename)).toEqual(["events.csv"]);
    state.markFinalUpload("recovery.zip");
    expect(state.getManifest().finalUpload).toMatchObject({ filename: "recovery.zip", uploadStatus: "success" });
  });

  it("carries the pause summary into retry metadata", () => {
    const state = new UploadState({ pauseSummary: { pause_used: true, pause_count: 1, pause_duration_ms: 5000, pause_events: [] } });
    state.recordAttempt("results.csv", "failed", "network");

    expect(state.getManifest().pause).toMatchObject({ pause_used: true, pause_count: 1 });
  });
});
