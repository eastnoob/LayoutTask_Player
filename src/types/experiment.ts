import type { ReferenceMode } from "./config";
import type { ExperimentSchedule } from "./schedule";

export interface ExperimentTrialRef {
  taskId: string;
  qid?: string;
}

export interface ExperimentTutorialReferenceBoardItem {
  id: string;
  name: string;
  allSvg: string;
  variableSvg: string;
  allAnimation: string;
  variableAnimation: string;
}

export interface ExperimentTutorialReferenceBoardConfig {
  enabled: boolean;
  continueLabel?: string;
  items: ExperimentTutorialReferenceBoardItem[];
}

export interface ExperimentTutorialConfig {
  enabled: boolean;
  baseUrl?: string;
  taskId?: string;
  qid?: string;
  packageVersion?: string;
  referenceBoard?: ExperimentTutorialReferenceBoardConfig;
}

export interface ExperimentConfidenceConfig {
  required: boolean;
  scale: number[];
  labels: Record<string, string>;
}

export interface ExperimentCopyDataSaveConfig {
  mode: "copy";
  filenamePrefix: string;
}

export interface ExperimentDataPipeSaveConfig {
  mode: "datapipe";
  experimentId: string;
  endpoint: string;
  filenamePrefix: string;
}

export interface ExperimentReceiverSaveConfig {
  mode: "receiver";
  experimentId: string;
  endpoint: string;
  filenamePrefix: string;
  submitToken?: string;
}

export type ExperimentDataSaveConfig =
  | ExperimentCopyDataSaveConfig
  | ExperimentDataPipeSaveConfig
  | ExperimentReceiverSaveConfig;

export interface ExperimentConfig {
  schema: "layouttask.experiment.v1";
  experimentId: string;
  baseUrl: string;
  referenceMode: ReferenceMode;
  order: "fixed";
  tutorial: ExperimentTutorialConfig;
  confidence: ExperimentConfidenceConfig;
  dataSave: ExperimentDataSaveConfig;
  trials: ExperimentTrialRef[];
  schedule?: ExperimentSchedule;
  schedulePath?: string;
}
