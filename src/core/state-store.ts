import type { RuntimeTaskConfig } from "../types/runtime";
import type { FinalState, ObjectRuntimeState } from "../types/result";
import type { LayoutAction, ObjectOffsets, ObjectPose, OperationCounts } from "../types/events";
import { normalizeRotation, snapToGrid } from "../utils/geometry";

// StateStore is the rule engine for object state.
// 它管理当前位置、旋转、计数、offset，以及“这个动作现在能不能做”。
export interface StateTransition {
  objectId: string;
  action: LayoutAction;
  before: ObjectPose;
  after: ObjectPose;
  counts: OperationCounts;
  offsets: ObjectOffsets;
}

export interface CanApplyResult {
  ok: boolean;
  reason?: "locked" | "limit_reached" | "movement_disabled" | "rotation_disabled" | "unsupported_action";
}

interface ObjectInitialState {
  x: number;
  y: number;
  r: number;
}

export class StateStore {
  private readonly objectStates: Record<string, ObjectRuntimeState>;
  private readonly initialStates: Record<string, ObjectInitialState>;
  private readonly rotationOffsets: Record<string, number>;
  private readonly config: RuntimeTaskConfig;
  private locked = false;

  constructor(config: RuntimeTaskConfig) {
    this.config = config;
    this.initialStates = Object.fromEntries(
      config.objects.map((objectConfig) => [
        objectConfig.id,
        {
          x: objectConfig.x,
          y: objectConfig.y,
          r: normalizeRotation(objectConfig.rotation),
        },
      ]),
    );

    // rotationOffsets tracks signed step offset from the original angle.
    // 不能只看 0-359 的绝对角度，否则 cw / ccw 的边界会丢失实验语义。
    this.rotationOffsets = Object.fromEntries(config.objects.map((objectConfig) => [objectConfig.id, 0]));
    this.objectStates = Object.fromEntries(
      config.objects.map((objectConfig) => [
        objectConfig.id,
        {
          id: objectConfig.id,
          x: objectConfig.x,
          y: objectConfig.y,
          r: normalizeRotation(objectConfig.rotation),
          counts: {
            left: 0,
            right: 0,
            up: 0,
            down: 0,
            cw: 0,
            ccw: 0,
          },
        },
      ]),
    );
  }

  isLocked(): boolean {
    return this.locked;
  }

  lock(): void {
    this.locked = true;
  }

  getObjectState(objectId: string): ObjectRuntimeState {
    const state = this.objectStates[objectId];
    if (!state) {
      throw new Error(`Unknown object: ${objectId}`);
    }

    return {
      ...state,
      counts: { ...state.counts },
    };
  }

  canApplyAction(objectId: string, action: LayoutAction): CanApplyResult {
    const state = this.objectStates[objectId];
    if (!state) {
      throw new Error(`Unknown object: ${objectId}`);
    }

    if (this.locked) {
      return { ok: false, reason: "locked" };
    }

    const objectConfig = this.getObjectConfig(objectId);
    const offsets = this.getObjectOffsets(objectId);

    // Limits are evaluated against offset-from-origin, not lifetime click count.
    // 这正是实验语义：先左 2 格后，仍然可以一路向右回到另一侧边界。
    if (isMoveAction(action)) {
      if (objectConfig.behavior.movement.mode !== "button") {
        return { ok: false, reason: "movement_disabled" };
      }

      if (wouldExceedMovementLimit(offsets, objectConfig, action)) {
        return { ok: false, reason: "limit_reached" };
      }

      return { ok: true };
    }

    if (isRotateAction(action)) {
      if (!objectConfig.behavior.rotation?.step) {
        return { ok: false, reason: "rotation_disabled" };
      }

      if (wouldExceedRotationLimit(offsets, objectConfig, action)) {
        return { ok: false, reason: "limit_reached" };
      }

      return { ok: true };
    }

    return { ok: false, reason: "unsupported_action" };
  }

  applyAction(objectId: string, action: LayoutAction): StateTransition {
    const canApply = this.canApplyAction(objectId, action);
    if (!canApply.ok) {
      throw new Error(`Cannot apply ${action} to ${objectId}: ${canApply.reason}`);
    }

    const state = this.objectStates[objectId];
    if (!state) {
      throw new Error(`Unknown object: ${objectId}`);
    }

    const objectConfig = this.getObjectConfig(objectId);
    const before = toPose(state);

    // Apply in world coordinates first, then snap back to grid if enabled.
    // movement.step 可以显式配置；未配置时默认继承 grid size。
    switch (action) {
      case "move_left":
        state.x -= objectConfig.behavior.movement.step ?? this.config.world.grid.size;
        state.counts.left += 1;
        break;
      case "move_right":
        state.x += objectConfig.behavior.movement.step ?? this.config.world.grid.size;
        state.counts.right += 1;
        break;
      case "move_up":
        state.y -= objectConfig.behavior.movement.step ?? this.config.world.grid.size;
        state.counts.up += 1;
        break;
      case "move_down":
        state.y += objectConfig.behavior.movement.step ?? this.config.world.grid.size;
        state.counts.down += 1;
        break;
      case "rotate_cw":
        state.r = normalizeRotation(state.r + (objectConfig.behavior.rotation?.step ?? 45));
        this.rotationOffsets[objectId] += 1;
        state.counts.cw += 1;
        break;
      case "rotate_ccw":
        state.r = normalizeRotation(state.r - (objectConfig.behavior.rotation?.step ?? 45));
        this.rotationOffsets[objectId] -= 1;
        state.counts.ccw += 1;
        break;
      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    if (isMoveAction(action) && this.config.world.grid.snap) {
      state.x = snapToGrid(state.x, this.config.world.grid.size);
      state.y = snapToGrid(state.y, this.config.world.grid.size);
    }

    return {
      objectId,
      action,
      before,
      after: toPose(state),
      counts: { ...state.counts },
      offsets: this.getObjectOffsets(objectId),
    };
  }

  getObjectOffsets(objectId: string): ObjectOffsets {
    const state = this.objectStates[objectId];
    const initial = this.initialStates[objectId];
    if (!state || !initial) {
      throw new Error(`Unknown object: ${objectId}`);
    }

    const objectConfig = this.getObjectConfig(objectId);
    const step = getMovementStep(this.config, objectConfig);

    // Offsets are analysis-friendly: signed grid steps and signed rotation steps.
    return {
      xSteps: Math.round((state.x - initial.x) / step),
      ySteps: Math.round((state.y - initial.y) / step),
      rotationSteps: this.rotationOffsets[objectId] ?? 0,
    };
  }

  getFinalState(): FinalState {
    return Object.fromEntries(
      Object.entries(this.objectStates).map(([objectId, state]) => [
        objectId,
        {
          x: state.x,
          y: state.y,
          r: state.r,
          counts: { ...state.counts },
          offsets: this.getObjectOffsets(objectId),
        },
      ]),
    );
  }

  private getObjectConfig(objectId: string) {
    const objectConfig = this.config.objects.find((item) => item.id === objectId);
    if (!objectConfig) {
      throw new Error(`Unknown object config: ${objectId}`);
    }

    return objectConfig;
  }
}

function toPose(state: ObjectRuntimeState): ObjectPose {
  return {
    x: state.x,
    y: state.y,
    r: state.r,
  };
}

function isMoveAction(action: LayoutAction): action is "move_left" | "move_right" | "move_up" | "move_down" {
  return action === "move_left" || action === "move_right" || action === "move_up" || action === "move_down";
}

function isRotateAction(action: LayoutAction): action is "rotate_cw" | "rotate_ccw" {
  return action === "rotate_cw" || action === "rotate_ccw";
}

function getMovementStep(
  config: RuntimeTaskConfig,
  objectConfig: RuntimeTaskConfig["objects"][number],
): number {
  return objectConfig.behavior.movement.step ?? config.world.grid.size;
}

function wouldExceedMovementLimit(
  offsets: ObjectOffsets,
  objectConfig: RuntimeTaskConfig["objects"][number],
  action: LayoutAction,
): boolean {
  // Signed offsets make the bounds symmetric around origin.
  // Example: xSteps = -2 can still move right until it reaches +2.
  switch (action) {
    case "move_left":
      return offsets.xSteps - 1 < -(objectConfig.behavior.movement.max_left ?? Number.POSITIVE_INFINITY);
    case "move_right":
      return offsets.xSteps + 1 > (objectConfig.behavior.movement.max_right ?? Number.POSITIVE_INFINITY);
    case "move_up":
      return offsets.ySteps - 1 < -(objectConfig.behavior.movement.max_up ?? Number.POSITIVE_INFINITY);
    case "move_down":
      return offsets.ySteps + 1 > (objectConfig.behavior.movement.max_down ?? Number.POSITIVE_INFINITY);
    default:
      return true;
  }
}

function wouldExceedRotationLimit(
  offsets: ObjectOffsets,
  objectConfig: RuntimeTaskConfig["objects"][number],
  action: LayoutAction,
): boolean {
  // Rotation uses the same mental model as movement:
  // bound the signed step offset from the original orientation.
  switch (action) {
    case "rotate_cw":
      return offsets.rotationSteps + 1 > (objectConfig.behavior.rotation?.max_cw ?? Number.POSITIVE_INFINITY);
    case "rotate_ccw":
      return offsets.rotationSteps - 1 < -(objectConfig.behavior.rotation?.max_ccw ?? Number.POSITIVE_INFINITY);
    default:
      return true;
  }
}
