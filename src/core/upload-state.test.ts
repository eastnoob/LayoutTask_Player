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
});
