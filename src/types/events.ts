/** Serialized participant action names used by the event log and downstream decoders. */
export type LayoutAction =
  | "move_left"
  | "move_right"
  | "move_up"
  | "move_down"
  | "rotate_cw"
  | "rotate_ccw"
  | "drag_start"
  | "drag_move"
  | "drag_end";

// Event types are transport-friendly: compact enough for JSON,
// 但又保留足够语义，方便后续导出 long-table 和做时序分析。
/** Running accepted-operation totals for one object at a given moment in the trial. */
export interface OperationCounts {
  left: number;
  right: number;
  up: number;
  down: number;
  cw: number;
  ccw: number;
}

export interface ObjectPose {
  x: number;
  y: number;
  r: number;
}

/** Signed offsets from the object's reconstruction origin, expressed in action steps. */
export interface ObjectOffsets {
  xSteps: number;
  ySteps: number;
  rotationSteps: number;
}

/**
 * One transport event from the participant interaction stream.
 *
 * Invalid events are still recorded when the participant attempted an intended
 * action but the runtime rejected it. `blocked_reason` therefore describes the
 * rejection cause, not a passive state snapshot.
 */
export interface LayoutTaskEvent {
  i: number;
  t: number;
  object: string;
  action: LayoutAction;
  valid: boolean;
  blocked_reason?: "locked" | "limit_reached" | "movement_disabled" | "rotation_disabled" | "collision";
  before?: ObjectPose;
  after?: ObjectPose;
  counts?: OperationCounts;
  offsets?: ObjectOffsets;
  pointer?: {
    clientX: number;
    clientY: number;
    worldX?: number;
    worldY?: number;
  };
}
