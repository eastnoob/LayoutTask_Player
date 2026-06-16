import type { LayoutTaskEvent, ObjectPose } from "../types/events";
import type { ResultFlowInfo } from "../types/result";

export interface AutosaveKeyParts {
  experimentId: string;
  taskId: string;
  qid: string;
  session: string;
}

export interface LayoutTaskDraft {
  schema: "layouttask.draft.v1";
  saved_at: number;
  restore_count: number;
  state: Record<string, ObjectPose>;
  events: LayoutTaskEvent[];
  flow?: ResultFlowInfo;
}

export interface AutosaveService {
  save(key: string, draft: LayoutTaskDraft): void;
  load(key: string): LayoutTaskDraft | null;
  clear(key: string): void;
}

const layoutActions = new Set<LayoutTaskEvent["action"]>([
  "move_left",
  "move_right",
  "move_up",
  "move_down",
  "rotate_cw",
  "rotate_ccw",
  "drag_start",
  "drag_move",
  "drag_end",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isObjectPose(value: unknown): value is ObjectPose {
  return (
    isRecord(value) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.r)
  );
}

function isOperationCounts(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.left) &&
    isFiniteNumber(value.right) &&
    isFiniteNumber(value.up) &&
    isFiniteNumber(value.down) &&
    isFiniteNumber(value.cw) &&
    isFiniteNumber(value.ccw)
  );
}

function isObjectOffsets(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.xSteps) &&
    isFiniteNumber(value.ySteps) &&
    isFiniteNumber(value.rotationSteps)
  );
}

function isPointer(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.clientX) &&
    isFiniteNumber(value.clientY) &&
    (value.worldX === undefined || isFiniteNumber(value.worldX)) &&
    (value.worldY === undefined || isFiniteNumber(value.worldY))
  );
}

function isLayoutTaskEvent(value: unknown): value is LayoutTaskEvent {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.i) &&
    isFiniteNumber(value.t) &&
    typeof value.object === "string" &&
    value.object.length > 0 &&
    typeof value.action === "string" &&
    layoutActions.has(value.action as LayoutTaskEvent["action"]) &&
    typeof value.valid === "boolean" &&
    (value.blocked_reason === undefined ||
      value.blocked_reason === "locked" ||
      value.blocked_reason === "limit_reached" ||
      value.blocked_reason === "movement_disabled" ||
      value.blocked_reason === "rotation_disabled" ||
      value.blocked_reason === "collision") &&
    (value.before === undefined || isObjectPose(value.before)) &&
    (value.after === undefined || isObjectPose(value.after)) &&
    (value.counts === undefined || isOperationCounts(value.counts)) &&
    (value.offsets === undefined || isObjectOffsets(value.offsets)) &&
    (value.pointer === undefined || isPointer(value.pointer))
  );
}

function isResultFlowInfo(value: unknown): value is ResultFlowInfo {
  return (
    isRecord(value) &&
    (value.mode === "direct_reconstruction" || value.mode === "preview_then_reconstruct") &&
    (value.preview_ack_at === undefined || isFiniteNumber(value.preview_ack_at)) &&
    (value.preview_started_at === undefined || isFiniteNumber(value.preview_started_at)) &&
    (value.preview_ended_at === undefined || isFiniteNumber(value.preview_ended_at)) &&
    (value.preview_duration_ms === undefined || isFiniteNumber(value.preview_duration_ms)) &&
    (value.reconstruction_started_at === undefined ||
      isFiniteNumber(value.reconstruction_started_at))
  );
}

function isLayoutTaskDraft(value: unknown): value is LayoutTaskDraft {
  return (
    isRecord(value) &&
    value.schema === "layouttask.draft.v1" &&
    isFiniteNumber(value.saved_at) &&
    isNonNegativeInteger(value.restore_count) &&
    isRecord(value.state) &&
    Object.values(value.state).every(isObjectPose) &&
    Array.isArray(value.events) &&
    value.events.every(isLayoutTaskEvent) &&
    (value.flow === undefined || isResultFlowInfo(value.flow))
  );
}

export function createAutosaveKey(parts: AutosaveKeyParts): string {
  return [
    "layouttask",
    "draft",
    encodeURIComponent(parts.experimentId),
    encodeURIComponent(parts.taskId),
    encodeURIComponent(parts.qid),
    encodeURIComponent(parts.session),
  ].join(":");
}

export function createAutosaveService(storage: Storage): AutosaveService {
  return {
    save(key, draft) {
      storage.setItem(key, JSON.stringify(draft));
    },
    load(key) {
      const raw = storage.getItem(key);
      if (!raw) {
        return null;
      }

      try {
        const parsed: unknown = JSON.parse(raw);
        if (!isLayoutTaskDraft(parsed)) {
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    },
    clear(key) {
      storage.removeItem(key);
    },
  };
}
