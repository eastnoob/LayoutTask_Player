import type { RuntimeTaskConfig } from "../types/runtime";
import type { FinalState, ObjectRuntimeState } from "../types/result";
import { normalizeRotation } from "../utils/geometry";

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
