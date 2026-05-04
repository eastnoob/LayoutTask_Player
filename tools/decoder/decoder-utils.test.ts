import { describe, expect, it } from "vitest";
import { isRelativeFinalState, validateDecodedResult } from "./decoder-utils";
import type { DecodedLayoutTask } from "../../src/core/encoder";

describe("decoder validation", () => {
  it("accepts a clean relative final-state record", () => {
    const validation = validateDecodedResult(createDecodedRecord());

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it("flags relative final states that exceed configured limits", () => {
    const decoded = createDecodedRecord();
    if (!isRelativeFinalState(decoded.result.final_state)) {
      throw new Error("Test setup expects relative final state");
    }

    decoded.result.final_state.chair_01.dx_steps = 3;
    const validation = validateDecodedResult(decoded);

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain("right_limit_exceeded:chair_01");
  });

  it("flags event/final-state mismatches when full events are present", () => {
    const decoded = createDecodedRecord();
    if (!isRelativeFinalState(decoded.result.final_state)) {
      throw new Error("Test setup expects relative final state");
    }

    decoded.result.final_state.chair_01.dx_steps = 0;
    const validation = validateDecodedResult(decoded);

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain("event_final_state_mismatch:chair_01");
  });
});

function createDecodedRecord(): DecodedLayoutTask {
  return {
    header: {
      version: "LAYOUTTASK1",
      qid: "Q1",
      taskId: "room01",
      sessionId: "SESSION1",
      hash8: "HASH1234",
      encoding: "lz-uri",
    },
    hashOk: true,
    headerOk: true,
    result: {
      schema: "layouttask.result.v1",
      exp: "test_exp",
      qid: "Q1",
      task_id: "room01",
      session: "SESSION1",
      start_time: 1_000,
      end_time: 2_000,
      duration_ms: 1_000,
      context: {
        world: {
          viewBox: { x: -500, y: -500, width: 1000, height: 1000 },
          origin: { x: 0, y: 0 },
          grid_size: 25,
          grid_snap: true,
        },
        objects: {
          chair_01: {
            origin: { x: 0, y: 0, r: 0 },
            movement_step: 25,
            rotation_step: 45,
            limits: {
              left: 2,
              right: 2,
              up: 2,
              down: 2,
              cw: 2,
              ccw: 2,
            },
          },
        },
      },
      events: [
        {
          i: 0,
          t: 250,
          object: "chair_01",
          action: "move_right",
          valid: true,
          before: { x: 0, y: 0, r: 0 },
          after: { x: 25, y: 0, r: 0 },
          offsets: { xSteps: 1, ySteps: 0, rotationSteps: 0 },
        },
      ],
      final_state_mode: "relative",
      final_state: {
        chair_01: {
          dx_steps: 1,
          dy_steps: 0,
          rotation_steps: 0,
        },
      },
      locked: true,
    },
  };
}
