import type { LayoutTaskEvent, ObjectOffsets, ObjectPose, OperationCounts } from "./events";
import type { ViewBox } from "./config";

// Result types describe what can be serialized and exported out of the task.
// 这一层既服务浏览器端编码，也服务后续 decoder / analysis 脚本。
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

export interface FinalObjectState extends ObjectPose {
  counts: OperationCounts;
  offsets?: ObjectOffsets;
}

export interface RelativeFinalObjectState {
  dx_steps: number;
  dy_steps: number;
  rotation_steps: number;
}

export type AbsoluteFinalState = Record<string, FinalObjectState>;
export type RelativeFinalState = Record<string, RelativeFinalObjectState>;
export type FinalState = AbsoluteFinalState | RelativeFinalState;

export interface ResultContextObject {
  origin: {
    x: number;
    y: number;
    r: number;
  };
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
  task_config_hash?: string;
  context?: ResultContext;
  events: LayoutTaskEvent[];
  final_state_mode?: "absolute" | "relative";
  final_state: FinalState;
  locked: true;
  copy_timestamp?: number;
  user_agent?: string;
}
