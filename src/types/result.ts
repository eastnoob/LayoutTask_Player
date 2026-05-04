import type { LayoutTaskEvent, ObjectOffsets, ObjectPose, OperationCounts } from "./events";
import type { ViewBox } from "./config";

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
