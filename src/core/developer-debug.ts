import type { ExperimentConfig, ExperimentDataSaveConfig } from "../types/experiment";

const DEBUG_EXPERIMENT_ID = "run_12_core_23_debug";
const DEBUG_FILENAME_PREFIX = "run-12-core-23-debug";

export function getDeveloperProlificId(): string {
  return "DEBUG_9999";
}

export function createDeveloperDebugConfig(config: ExperimentConfig): ExperimentConfig {
  if (config.dataSave.mode === "copy") {
    return {
      ...config,
      experimentId: DEBUG_EXPERIMENT_ID,
      dataSave: { mode: "copy", filenamePrefix: DEBUG_FILENAME_PREFIX },
    };
  }

  return {
    ...config,
    experimentId: DEBUG_EXPERIMENT_ID,
    dataSave: createIsolatedDataSave(config.dataSave),
  };
}

function createIsolatedDataSave(dataSave: Exclude<ExperimentDataSaveConfig, { mode: "copy" }>): Exclude<ExperimentDataSaveConfig, { mode: "copy" }> {
  return {
    ...dataSave,
    experimentId: DEBUG_EXPERIMENT_ID,
    filenamePrefix: DEBUG_FILENAME_PREFIX,
  };
}
