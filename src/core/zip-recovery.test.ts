import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { createCompleteRecoveryZip } from "./zip-recovery";

describe("createCompleteRecoveryZip", () => {
  it("includes every authoritative file and a manifest, not only failed files", async () => {
    const archive = await createCompleteRecoveryZip(
      [
        { filename: "session.csv", contentType: "text/csv", data: "session\n" },
        { filename: "results.csv", contentType: "text/csv", data: "formal\n" },
        { filename: "raw_results.csv", contentType: "text/csv", data: "25 rows\n" },
        { filename: "tutorial_result.json", contentType: "application/json", data: "{}" },
      ],
      {
        participantId: "P1",
        prolificId: " 5f2a-original ",
        sessionId: "S1",
        experimentId: "E1",
        completionCode: "  CODE-17  ",
        failedFilenames: ["results.csv"],
        assignment: {
          assignment_id: "assign-1",
          participant_number: 2,
          sequence_id: "sequence-02",
          schedule_version: "run12-williams-v1",
          assignment_mode: "replacement",
          requested_sequence_id: "sequence-02",
          replacement_attempt: 1,
          rotation_index: null,
        },
        pauseSummary: { pause_used: true, pause_count: 1, pause_duration_ms: 5_000, pause_events: [] },
      },
    );

    const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual([
      "manifest.json",
      "raw_results.csv",
      "results.csv",
      "session.csv",
      "tutorial_result.json",
    ]);
    expect(JSON.parse(new TextDecoder().decode(files["manifest.json"]))).toMatchObject({
      participant_id: "P1",
      prolific_id: " 5f2a-original ",
      assignment_id: "assign-1",
      participant_number: 2,
      sequence_id: "sequence-02",
      schedule_version: "run12-williams-v1",
      assignment_mode: "replacement",
      requested_sequence_id: "sequence-02",
      replacement_attempt: 1,
      rotation_index: null,
      failed_filenames: ["results.csv"],
      pause: { pause_used: true, pause_count: 1 },
      completion_code: "  CODE-17  ",
    });
  });
});
