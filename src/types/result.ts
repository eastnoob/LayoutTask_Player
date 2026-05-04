import type { LayoutTaskEvent, ObjectOffsets, ObjectPose, OperationCounts } from "./events";

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
  events: LayoutTaskEvent[];
  final_state_mode?: "absolute" | "relative";
  final_state: FinalState;
  locked: true;
  copy_timestamp?: number;
  user_agent?: string;
}
