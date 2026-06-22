export type AssetType = "svg" | "png" | "jpg" | "image";
export type Anchor = "center" | "top_left";
export type WorldUnit = "mm" | "cm" | "m" | "px" | "cad_unit" | "unknown";

/**
 * Authoring-side protocol types used by manifest, task, and library JSON files.
 * These describe the authored wire format before runtime resolution, defaults,
 * and derived state are applied.
 * 研究者写 manifest / task / library 时，对应的就是这一层 shape，不是最终运行态 config。
 */
export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface GridConfig {
  size: number;
  visible: boolean;
  snap: boolean;
  origin?: Point;
}

/**
 * Authored world-space definition shared by background, task objects, and stage fit.
 * Coordinates in task files are interpreted against this space.
 */
export interface WorldConfig {
  unit?: WorldUnit;
  viewBox: ViewBox;
  origin: Point;
  grid: GridConfig;
}

/**
 * Authoring record for a reusable object asset before any task-specific sizing
 * or behavior is attached.
 */
export interface ObjectAssetConfig {
  type: AssetType;
  src: string;
  /** Schema/asset metadata describing the source artwork's native unit, if known. */
  intrinsic_unit?: WorldUnit;
  default_width?: number;
  default_height?: number;
  /** Multiplier used when scaling SVG viewBox numbers into authored task/world space. */
  viewbox_scale?: number;
  anchor?: Anchor;
}

export interface BackgroundAssetConfig {
  type: "image" | "svg";
  src: string;
  intrinsic_unit?: WorldUnit;
  viewbox_scale?: number;
}

export interface MovementBehavior {
  mode: "none" | "button" | "drag";
  step?: number;
  max_left?: number;
  max_right?: number;
  max_up?: number;
  max_down?: number;
}

export interface RotationBehavior {
  step?: number;
  max_cw?: number;
  max_ccw?: number;
}

export interface FreeDragBehavior {
  enabled: boolean;
  snap?: boolean;
}

/**
 * Reusable authored interaction envelope for an object: discrete movement,
 * optional rotation, and free-drag affordances.
 */
export interface BehaviorConfig {
  movement: MovementBehavior;
  rotation?: RotationBehavior;
  free_drag: FreeDragBehavior;
}

export interface PartialBehaviorConfig {
  movement?: Partial<MovementBehavior>;
  rotation?: Partial<RotationBehavior>;
  free_drag?: Partial<FreeDragBehavior>;
}

export interface TaskObjectBehaviorConfig {
  template?: string;
  config?: PartialBehaviorConfig;
}

export interface CompletionConfig {
  double_confirm?: boolean;
  lock_after_confirm?: boolean;
  allow_copy_again?: boolean;
}

export interface RecordingConfig {
  record_events?: boolean;
  record_final_state?: boolean;
  record_display_info?: boolean;
  record_display_changes?: boolean;
  record_page_timing?: boolean;
  record_user_agent?: boolean;
  record_blocked_events?: boolean;
}

export interface AutosaveConfig {
  enabled?: boolean;
  storage?: "localStorage";
  restore_prompt?: boolean;
  save_on?: "state_change";
}

export type EncodingMethod = "lz-uri" | "lz-base64" | "plain-json";
export type OutputDetail = "final-only" | "full";
export type FinalStateMode = "relative" | "absolute";

export interface OutputConfig {
  encoding?: EncodingMethod;
  detail?: OutputDetail;
  /** Whether final export uses step offsets (`dx_steps`/`dy_steps`/`rotation_steps`) or an absolute pose. */
  final_state?: FinalStateMode;
}

export interface CopyDataSaveConfig {
  mode: "copy";
}

export type DataPipePayloadFormat = "json-envelope" | "encoded-only" | "csv-row";

export interface DataPipeSaveConfig {
  mode: "datapipe";
  experiment_id: string;
  endpoint?: string;
  filename_prefix?: string;
  payload_format?: DataPipePayloadFormat;
  save_encoded?: boolean;
  save_result?: boolean;
}

export type DataSaveConfig = CopyDataSaveConfig | DataPipeSaveConfig;

export interface FeedbackConfig {
  limit_messages?: Partial<Record<"move_left" | "move_right" | "move_up" | "move_down" | "rotate_cw" | "rotate_ccw", string>>;
}

export interface DisplayImageConfig {
  enabled?: boolean;
  src: string;
  alt?: string;
  record_metrics?: boolean;
}

export type FlowMode = "direct_reconstruction" | "preview_then_reconstruct";
export type PreviewStageMode = "hidden" | "locked";

export interface PreviewThenReconstructFlowConfig {
  preview_duration_sec?: number;
  /** If true, require an explicit participant acknowledgment before preview starts. */
  require_preview_ack?: boolean;
  /** Intro copy shown on the pre-preview acknowledgment step when that gate is used. */
  intro_message?: string;
  intro_confirm_label?: string;
  stage_during_preview?: PreviewStageMode;
  show_countdown?: boolean;
  message_before?: string;
  message_after?: string;
}

export interface DirectReconstructionFlowConfig {
  mode: "direct_reconstruction";
}

export interface PreviewThenReconstructFlow {
  mode: "preview_then_reconstruct";
  config?: PreviewThenReconstructFlowConfig;
}

export type FlowConfig = DirectReconstructionFlowConfig | PreviewThenReconstructFlow;

export interface LayoutTaskMessages {
  confirm_lock_1: string;
  confirm_lock_2: string;
  confirm_no_edit: string;
  status_ready: string;
  status_copy_again_ok: string;
  status_copy_again_fail: string;
  instruction_edit_mode: string;
  reconstruction_hint_title: string;
  reconstruction_hint_drag: string;
  reconstruction_hint_button: string;
  reconstruction_hint_rotation: string;
  reconstruction_hint_select: string;
}

export type MessagesConfig = Partial<LayoutTaskMessages>;

export interface MinViewportRequirement {
  width: number;
  height: number;
  mode?: "warn";
  message?: string;
}

export interface RequirementsConfig {
  min_viewport?: MinViewportRequirement;
}

export interface StageConfig {
  fit?: "contain";
  max_height_ratio?: number;
  padding?: number;
}

export type CollisionAreaType = "contain" | "block";
export type CollisionShape = "rect" | "polygon";

export interface CollisionPoint {
  x: number;
  y: number;
}

export interface CollisionRectArea {
  id: string;
  type: CollisionAreaType;
  shape: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CollisionPolygonArea {
  id: string;
  type: CollisionAreaType;
  shape: "polygon";
  points: CollisionPoint[];
}

export type CollisionAreaConfig = CollisionRectArea | CollisionPolygonArea;

export interface CollisionSourceConfig {
  type: "svg";
  src: string;
}

/**
 * Authored task-level collision environment, either inline areas or an SVG-derived map.
 */
export interface TaskCollisionConfig {
  enabled?: boolean;
  mode?: "discrete";
  areas?: CollisionAreaConfig[];
  source?: CollisionSourceConfig;
}

export interface ObjectCollisionPolygon {
  id?: string;
  points: CollisionPoint[];
}

export interface ObjectCollisionSourceConfig {
  type: "svg";
  src: string;
}

export interface BoxObjectCollisionConfig {
  enabled?: boolean;
  shape?: "box";
  padding?: number;
}

export interface PolygonObjectCollisionConfig {
  enabled?: boolean;
  shape: "polygons";
  polygons: ObjectCollisionPolygon[];
  padding?: number;
}

export interface AssetOutlineObjectCollisionConfig {
  enabled?: boolean;
  shape: "asset_outline";
  source: ObjectCollisionSourceConfig;
  padding?: number;
}

/**
 * Authored per-object collision envelope used during reconstruction interaction.
 */
export type ObjectCollisionConfig =
  | BoxObjectCollisionConfig
  | PolygonObjectCollisionConfig
  | AssetOutlineObjectCollisionConfig;

export interface ManifestTaskEntry {
  qid: string;
  task_id: string;
  file: string;
}

/**
 * Experiment manifest that binds authored libraries and task files into one protocol bundle.
 */
export interface ManifestConfig {
  schema: "layouttask.manifest.v1";
  experiment_id: string;
  title?: string;
  config_version?: string;
  asset_base_url?: string;
  asset_library: string;
  background_library: string;
  behavior_library: string;
  tasks: ManifestTaskEntry[];
}

export interface ObjectLibraryConfig {
  schema: "layouttask.assets.objects.v1";
  objects: Record<string, ObjectAssetConfig>;
}

export interface BackgroundLibraryConfig {
  schema: "layouttask.assets.backgrounds.v1";
  backgrounds: Record<string, BackgroundAssetConfig>;
}

export interface BehaviorLibraryConfig {
  schema: "layouttask.behaviors.v1";
  behaviors: Record<string, BehaviorConfig>;
}

/**
 * Authored placement and interaction contract for one reconstructable task object.
 */
export interface TaskObjectConfig {
  id: string;
  asset: string;
  /** Reconstruction initial anchor x in world units. */
  x: number;
  /** Reconstruction initial anchor y in world units. */
  y: number;
  /** Reconstruction initial clockwise rotation in degrees. */
  rotation?: number;
  width?: number;
  height?: number;
  anchor?: Anchor;
  behavior: TaskObjectBehaviorConfig;
  collision?: ObjectCollisionConfig;
}

export interface TaskBackgroundConfig {
  asset: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

/**
 * Full authored task payload referenced by the manifest.
 * This is the experiment/protocol definition, not the resolved player state.
 */
export interface TaskConfig {
  schema: "layouttask.task.v1";
  task_id: string;
  qid: string;
  title?: string;
  world: WorldConfig;
  background: TaskBackgroundConfig;
  objects: TaskObjectConfig[];
  completion?: CompletionConfig;
  recording?: RecordingConfig;
  autosave?: AutosaveConfig;
  output?: OutputConfig;
  data_save?: DataSaveConfig;
  feedback?: FeedbackConfig;
  display_image?: DisplayImageConfig;
  flow?: FlowConfig;
  messages?: MessagesConfig;
  requirements?: RequirementsConfig;
  stage?: StageConfig;
  collision?: TaskCollisionConfig;
}
