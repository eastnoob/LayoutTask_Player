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
      { participantId: "P1", sessionId: "S1", experimentId: "E1", failedFilenames: ["results.csv"] },
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
      failed_filenames: ["results.csv"],
    });
  });
});
