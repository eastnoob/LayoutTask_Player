import type { RuntimeTaskConfig } from "../types/runtime";
import type { FinalState, ObjectRuntimeState } from "../types/result";
import type { ObjectPose, OperationCounts } from "../types/events";
import { normalizeRotation } from "../utils/geometry";

export interface StateTransition {
  objectId: string;
  before: ObjectPose;
  after: ObjectPose;
  counts: OperationCounts;
}

export class StateStore {
  private readonly objectStates: Record<string, ObjectRuntimeState>;
  private locked = false;

  constructor(config: RuntimeTaskConfig) {
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

  rotateClockwise(objectId: string, step = 45): StateTransition {
    if (this.locked) {
      throw new Error("Cannot rotate object after task is locked");
    }

    const state = this.objectStates[objectId];
    if (!state) {
      throw new Error(`Unknown object: ${objectId}`);
    }

    const before = toPose(state);
    state.r = normalizeRotation(state.r + step);
    state.counts.cw += 1;

    return {
      objectId,
      before,
      after: toPose(state),
      counts: { ...state.counts },
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
        },
      ]),
    );
  }
}

function toPose(state: ObjectRuntimeState): ObjectPose {
  return {
    x: state.x,
    y: state.y,
    r: state.r,
  };
}
