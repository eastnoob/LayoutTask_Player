export type AssetType = "svg" | "png" | "jpg" | "image";
export type Anchor = "center" | "top_left";

// Authoring-side types: close to JSON files in public/layout-task/.
// 研究者写 manifest / task / library 时，对应的就是这一层 shape。
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
}

export interface WorldConfig {
  viewBox: ViewBox;
  origin: Point;
  grid: GridConfig;
}

export interface ObjectAssetConfig {
  type: AssetType;
  src: string;
  default_width: number;
  default_height: number;
  anchor?: Anchor;
}

export interface BackgroundAssetConfig {
  type: "image" | "svg";
  src: string;
  intrinsic_unit?: "cad_unit" | "px" | "unknown";
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

export interface BehaviorConfig {
  movement: MovementBehavior;
  rotation?: RotationBehavior;
  free_drag: FreeDragBehavior;
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

export type EncodingMethod = "lz-uri" | "lz-base64" | "plain-json";
export type OutputDetail = "final-only" | "full";
export type FinalStateMode = "relative" | "absolute";

export interface OutputConfig {
  encoding?: EncodingMethod;
  detail?: OutputDetail;
  final_state?: FinalStateMode;
}

export interface FeedbackConfig {
  limit_messages?: Partial<Record<"move_left" | "move_right" | "move_up" | "move_down" | "rotate_cw" | "rotate_ccw", string>>;
}

export interface DisplayImageConfig {
  enabled?: boolean;
  src: string;
  alt?: string;
  record_metrics?: boolean;
}

export interface ManifestTaskEntry {
  qid: string;
  task_id: string;
  file: string;
}

export interface ManifestConfig {
  schema: "layouttask.manifest.v1";
  experiment_id: string;
  title?: string;
  config_version?: string;
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

export interface TaskObjectConfig {
  id: string;
  asset: string;
  x: number;
  y: number;
  rotation?: number;
  width?: number;
  height?: number;
  anchor?: Anchor;
  behavior: string;
}

export interface TaskBackgroundConfig {
  asset: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

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
  output?: OutputConfig;
  feedback?: FeedbackConfig;
  display_image?: DisplayImageConfig;
}
