export interface ExperimentTrialRef {
  taskId: string;
  qid?: string;
}

export interface ExperimentTutorialConfig {
  enabled: boolean;
  taskId?: string;
  qid?: string;
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

export type ExperimentDataSaveConfig = ExperimentCopyDataSaveConfig | ExperimentDataPipeSaveConfig;

export interface ExperimentConfig {
  schema: "layouttask.experiment.v1";
  experimentId: string;
  baseUrl: string;
  order: "fixed";
  tutorial: ExperimentTutorialConfig;
  confidence: ExperimentConfidenceConfig;
  dataSave: ExperimentDataSaveConfig;
  trials: ExperimentTrialRef[];
}
