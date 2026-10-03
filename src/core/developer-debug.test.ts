import { describe, expect, it } from "vitest";
import type { ExperimentConfig } from "../types/experiment";
import { createDeveloperDebugConfig, getDeveloperProlificId } from "./developer-debug";

function config(): ExperimentConfig {
  return {
    schema: "layouttask.experiment.v1",
    experimentId: "production",
    baseUrl: "/release/",
    locale: "en-US",
    completionCodeGate: { enabled: false, minDisplayMs: 15_000 },
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

function copyConfig(): ExperimentConfig {
  return { ...config(), dataSave: { mode: "copy", filenamePrefix: "production" } };
}

describe("createDeveloperDebugConfig", () => {
  it("uses a stable non-participant Prolific marker", () => {
    expect(getDeveloperProlificId()).toBe("DEBUG_9999");
  });

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

  it("allows a local copy-mode developer page without an upload endpoint", () => {
    const debug = createDeveloperDebugConfig(copyConfig());

    expect(debug.experimentId).toBe("run_12_core_23_debug");
    expect(debug.dataSave).toEqual({ mode: "copy", filenamePrefix: "run-12-core-23-debug" });
  });
});
