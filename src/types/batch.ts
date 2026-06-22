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

/**
 * Authoring-level batch document.
 *
 * `shared` defines the experiment-wide defaults; each entry in `trials` may
 * override only the fields it needs. Compilers/readers should therefore treat
 * the effective task config as `shared` plus per-trial replacement at the same
 * semantic layer, not as an unrelated second schema.
 */
export interface BatchConfig {
  schema: "layouttask.batch.v1";
  experiment_id: string;
  title?: string;
  config_version?: string;
  output_dir?: string;
  shared: BatchSharedConfig;
  trials: BatchTrialConfig[];
}

/** Shared defaults inherited by every trial unless that trial provides its own value. */
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

/**
 * Per-trial override layer.
 *
 * Trial fields reuse the same semantic shapes as `shared`, but win for that
 * trial only. In practice this is where a protocol pins the background,
 * starting objects, scoring targets, and any trial-specific flow/collision
 * adjustments.
 */
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
  /** Optional authoring label for the reconstruction initial pose stored in x/y/rotation. */
  initial_state_label?: string;
  /** Correct answer for analysis. The canonical authored answer is relative action steps. */
  target?: ObjectTargetState;
  scoring?: ObjectScoringConfig;
}

export interface ScoringConfig {
  enabled?: boolean;
  include_objects?: string[];
  default_tolerance?: ScoringTolerance;
  objects?: Record<string, ObjectScoringConfig>;
}

/**
 * Canonical answer state for one object.
 *
 * `relative` is the authored/scored truth: signed action steps from the
 * reconstruction initial pose stored on the object config. `absolute` is an
 * optional derived pose kept for analysis/export convenience.
 */
export interface ObjectTargetState {
  /** Canonical correct answer: signed action steps from reconstruction initial pose. */
  relative: RelativeTargetState;
  /** Optional derived analysis pose in world coordinates. Not required for authored answers. */
  absolute?: AbsoluteTargetState;
}

export interface RelativeTargetState {
  /** Signed movement steps along x from the reconstruction initial pose to the correct answer. */
  dx_steps: number;
  /** Signed movement steps along y from the reconstruction initial pose to the correct answer. */
  dy_steps: number;
  /** Signed rotation steps from the reconstruction initial pose to the correct answer. */
  rotation_steps: number;
}

/** Derived target pose in world space, useful for QA/export but not the canonical authored answer. */
export interface AbsoluteTargetState {
  /** Derived target anchor x in world units. */
  x: number;
  /** Derived target anchor y in world units. */
  y: number;
  /** Derived target clockwise rotation in degrees. */
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

/**
 * Compiled scoring-side lookup exported from a batch.
 *
 * This is keyed by `task_id` and carries only the fields analysis/scoring need,
 * so downstream tools do not have to reopen the full authored batch. Targets
 * still follow the same rule as authored configs: relative steps are primary,
 * absolute poses are optional derived helpers.
 */
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
