import type {
  CompletionConfig,
  DataSaveConfig,
  DisplayImageConfig,
  FlowConfig,
  ManifestConfig,
  MessagesConfig,
  OutputConfig,
  RecordingConfig,
  RequirementsConfig,
  StageConfig,
  TaskBackgroundConfig,
  TaskCollisionConfig,
  TaskConfig,
  TaskObjectConfig,
  WorldConfig,
} from "./config";
import type { ObjectRole } from "../protocol/constants";

export type BatchMetadataValue = string | number | boolean | null;
export type BatchMetadata = Record<string, BatchMetadataValue>;

export interface BatchConfig {
  schema: "layouttask.batch.v1";
  experiment_id: string;
  title?: string;
  config_version?: string;
  output_dir?: string;
  shared: BatchSharedConfig;
  trials: BatchTrialConfig[];
}

export interface BatchSharedConfig {
  asset_library: string;
  background_library: string;
  behavior_library: string;
  world?: WorldConfig;
  stage?: StageConfig;
  completion?: CompletionConfig;
  recording?: RecordingConfig;
  output?: OutputConfig;
  data_save?: DataSaveConfig;
  flow?: FlowConfig;
  messages?: MessagesConfig;
  requirements?: RequirementsConfig;
}

export interface BatchTrialConfig {
  qid: string;
  task_id: string;
  title?: string;
  display_image?: DisplayImageConfig;
  world?: WorldConfig;
  background: TaskBackgroundConfig;
  objects: BatchObjectConfig[];
  completion?: CompletionConfig;
  recording?: RecordingConfig;
  output?: OutputConfig;
  data_save?: DataSaveConfig;
  flow?: FlowConfig;
  stage?: StageConfig;
  messages?: MessagesConfig;
  requirements?: RequirementsConfig;
  scoring?: ScoringConfig;
  collision?: TaskCollisionConfig;
  metadata?: BatchMetadata;
}

export interface BatchObjectConfig extends TaskObjectConfig {
  role?: ObjectRole;
  group_id?: string;
  initial_state_label?: string;
  target?: ObjectTargetState;
  scoring?: ObjectScoringConfig;
}

export interface ScoringConfig {
  enabled?: boolean;
  include_objects?: string[];
  default_tolerance?: ScoringTolerance;
  objects?: Record<string, ObjectScoringConfig>;
}

export type ObjectTargetState =
  | { relative: RelativeTargetState; absolute?: AbsoluteTargetState }
  | { relative?: RelativeTargetState; absolute: AbsoluteTargetState };

export interface RelativeTargetState {
  dx_steps: number;
  dy_steps: number;
  rotation_steps: number;
}

export interface AbsoluteTargetState {
  x: number;
  y: number;
  rotation_deg: number;
}

export interface ObjectScoringConfig {
  enabled?: boolean;
  target?: ObjectTargetState;
  tolerance?: ScoringTolerance;
  labels?: Record<string, string>;
}

export interface ScoringTolerance {
  dx_steps?: number;
  dy_steps?: number;
  rotation_steps?: number;
  distance_world?: number;
  x_world?: number;
  y_world?: number;
  rotation_deg?: number;
}

export interface ScoringReferenceConfig {
  schema: "layouttask.scoring-reference.v1";
  experiment_id: string;
  tasks: Record<string, ScoringReferenceTask>;
}

export interface ScoringReferenceTask {
  qid: string;
  metadata?: BatchMetadata;
  objects: Record<string, ScoringReferenceObject>;
}

export interface ScoringReferenceObject {
  role?: ObjectRole;
  group_id?: string;
  target?: ObjectTargetState;
  tolerance?: ScoringTolerance;
  labels?: Record<string, string>;
}

export interface CompiledBatch {
  manifest: ManifestConfig;
  tasks: CompiledBatchTask[];
  scoringReference: ScoringReferenceConfig;
  report: BatchGenerationReport;
}

export interface CompiledBatchTask {
  file: string;
  config: TaskConfig;
}

export interface BatchGenerationReport {
  schema: "layouttask.generation-report.v1";
  experiment_id: string;
  task_count: number;
  generated_files: string[];
  warnings: string[];
}
