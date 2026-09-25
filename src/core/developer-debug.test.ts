import { describe, expect, it } from "vitest";
import type { ExperimentConfig } from "../types/experiment";
import { createDeveloperDebugConfig } from "./developer-debug";

function config(): ExperimentConfig {
  return {
    schema: "layouttask.experiment.v1",
    experimentId: "production",
    baseUrl: "/release/",
    referenceMode: "persistent",
    order: "fixed",
    tutorial: { enabled: false },
    confidence: { required: true, scale: [1, 2, 3, 4, 5], labels: {} },
    dataSave: {
      mode: "datapipe",
      experimentId: "production",
      endpoint: "https://data.example.test/submit",
      filenamePrefix: "production",
    },
    trials: [],
  };
}

describe("createDeveloperDebugConfig", () => {
  it("keeps DataPipe enabled while isolating developer data", () => {
    const debug = createDeveloperDebugConfig(config());

    expect(debug.experimentId).toBe("run_12_core_23_debug");
    expect(debug.dataSave).toEqual({
      mode: "datapipe",
      experimentId: "run_12_core_23_debug",
      endpoint: "https://data.example.test/submit",
      filenamePrefix: "run-12-core-23-debug",
    });
  });
});
