import type { LayoutTaskEvent, ObjectOffsets, ObjectPose, OperationCounts } from "./events";
import type { ViewBox, WorldUnit } from "./config";

// Result types are the serialized protocol surface shared by runtime, encoder,
// decoder, and downstream analysis scripts. 这一层是实验结果交换格式，不只是前端内部状态。
export interface RectInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PageTimingInfo {
  source: "performance.timeOrigin" | "performance.timing.navigationStart" | "collector_created";
  page_open_time: number;
  submit_time: number;
  total_elapsed_ms: number;
  player_start_time?: number;
  player_elapsed_ms?: number;
}

export interface DisplayInfo {
  viewport: {
    width: number;
    height: number;
  };
  screen: {
    width: number;
    height: number;
    availWidth: number;
    availHeight: number;
  };
  visualViewport?: {
    width: number;
    height: number;
    scale: number;
    offsetLeft: number;
    offsetTop: number;
    pageLeft: number;
    pageTop: number;
  };
  screenOrientation?: {
    type?: string;
    angle?: number;
  };
  screenColor?: {
    colorDepth?: number;
    pixelDepth?: number;
  };
  devicePixelRatio: number;
  stageRect?: RectInfo;
  stageScale?: {
    worldWidth: number;
    worldHeight: number;
    cssWidth: number;
    cssHeight: number;
    worldToCssScale: number;
    cssToWorldScale: number;
  };
  backgroundRect?: RectInfo;
  backgroundNatural?: {
    width: number;
    height: number;
  };
  backgroundWorld?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  displayImageFrameRect?: RectInfo;
  displayImageRect?: RectInfo;
  displayImageNatural?: {
    width: number;
    height: number;
  };
  displayImageRendered?: {
    cssWidth: number;
    cssHeight: number;
    devicePixelRatio: number;
    effectivePixelWidth: number;
    effectivePixelHeight: number;
  };
  changes?: {
    initial?: DisplayChangeSnapshot;
    final?: DisplayChangeSnapshot;
    events: DisplayChangeEvent[];
    resizeCount: number;
    visualViewportResizeCount: number;
    visualViewportScrollCount: number;
    orientationChangeCount: number;
  };
}

export interface DisplayChangeSnapshot {
  viewport: {
    width: number;
    height: number;
  };
  visualViewport?: {
    width: number;
    height: number;
    scale: number;
    offsetLeft: number;
    offsetTop: number;
    pageLeft: number;
    pageTop: number;
  };
  screenOrientation?: {
    type?: string;
    angle?: number;
  };
  displayImageRect?: {
    width: number;
    height: number;
  };
}

export interface DisplayChangeEvent {
  i: number;
  t: number;
  type: "window_resize" | "visual_viewport_resize" | "visual_viewport_scroll" | "orientation_change";
  snapshot: DisplayChangeSnapshot;
}

export interface ObjectRuntimeState extends ObjectPose {
  id: string;
  counts: OperationCounts;
}

/** Absolute per-object end state as stored in `final_state_mode: "absolute"` results. */
export interface FinalObjectState extends ObjectPose {
  counts: OperationCounts;
  /** Signed step offsets from the object's reconstruction origin, when available. */
  offsets?: ObjectOffsets;
}

/** Relative per-object end state stored as signed action-step offsets, not world coordinates. */
export interface RelativeFinalObjectState {
  dx_steps: number;
  dy_steps: number;
  rotation_steps: number;
}

export type AbsoluteFinalState = Record<string, FinalObjectState>;
export type RelativeFinalState = Record<string, RelativeFinalObjectState>;
export type FinalState = AbsoluteFinalState | RelativeFinalState;

export interface ResultContextObject {
  // Reconstruction origin: the authored initial pose that relative outputs are measured from.
  origin: {
    x: number;
    y: number;
    r: number;
  };
  // Per-step translation size used to interpret dx/dy step counts in relative results.
  movement_step: number;
  rotation_step: number;
  limits: {
    left?: number;
    right?: number;
    up?: number;
    down?: number;
    cw?: number;
    ccw?: number;
  };
}

export interface ResultContext {
  world: {
    unit?: WorldUnit;
    viewBox: ViewBox;
    origin: {
      x: number;
      y: number;
    };
    grid_size: number;
    grid_snap: boolean;
    grid_origin?: {
      x: number;
      y: number;
    };
  };
  objects: Record<string, ResultContextObject>;
}

export interface ResultFlowInfo {
  mode: "direct_reconstruction" | "preview_then_reconstruct";
  preview_ack_at?: number;
  // Timestamp when the preview image actually became available to the participant.
  preview_started_at?: number;
  preview_ended_at?: number;
  preview_duration_ms?: number;
  reconstruction_started_at?: number;
}

export interface ResultRestoreInfo {
  // True only when this run restored a previously saved draft into the active session.
  recovered: boolean;
  restore_count?: number;
  draft_saved_at?: number;
  restored_at?: number;
}

/**
 * Top-level exported task result.
 *
 * `events` is the action log, `final_state` is the locked submission snapshot,
 * and optional `context` provides the analysis/replay metadata needed to turn
 * relative step output back into absolute poses.
 */
export interface LayoutTaskResult {
  schema: "layouttask.result.v1";
  exp: string;
  qid: string;
  task_id: string;
  session: string;
  start_time: number;
  end_time: number;
  duration_ms: number;
  page_timing?: PageTimingInfo;
  display?: DisplayInfo;
  flow?: ResultFlowInfo;
  confidence?: Record<string, number>;
  restore?: ResultRestoreInfo;
  task_config_hash?: string;
  context?: ResultContext;
  events: LayoutTaskEvent[];
  final_state_mode?: "absolute" | "relative";
  final_state: FinalState;
  locked: true;
  copy_timestamp?: number;
  user_agent?: string;
}
