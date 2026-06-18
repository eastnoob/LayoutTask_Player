import { describe, expect, it } from "vitest";
import type { ObjectTargetState, ScoringReferenceConfig } from "../../src/types/batch";
import type { OperationCounts } from "../../src/types/events";
import type { LayoutTaskResult } from "../../src/types/result";
import type { DecodedSourceRecord } from "../decoder/decoder-utils";
import { parseScoringReference, toObjectStateRows } from "./scoring-utils";

describe("object-level scoring export rows", () => {
  it("rejects invalid scoring references", () => {
    expect(() => parseScoringReference({ schema: "layouttask.scoring-reference.v1" })).toThrow(/experiment_id|tasks/);
  });

  it("exports absolute final states with offsets, targets, and zero errors", () => {
    const rows = toObjectStateRows([sourceRecord(createResult())], scoringReference());

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source_index: 3,
      hash_ok: true,
      header_ok: true,
      exp: "exp1",
      qid: "Q1",
      task_id: "task1",
      session: "session1",
      world_unit: "mm",
      object_id: "chair_01",
      object_role: "variable",
      object_group_id: "chairs",
      relative_dx_steps: 2,
      relative_dy_steps: -1,
      relative_rotation_steps: 1,
      target_relative_dx_steps: 2,
      target_relative_dy_steps: -1,
      target_relative_rotation_steps: 1,
      error_relative_dx_steps: 0,
      error_relative_dy_steps: 0,
      error_relative_rotation_steps: 0,
      absolute_x: 150,
      absolute_y: 75,
      absolute_rotation_deg: 350,
      target_absolute_x: 150,
      target_absolute_y: 75,
      target_absolute_rotation_deg: 350,
      error_absolute_x: 0,
      error_absolute_y: 0,
      error_absolute_distance: 0,
      error_absolute_rotation_deg: 0,
    });
  });

  it("derives absolute values from relative final states and result context", () => {
    const result = createResult({
      final_state_mode: "relative",
      final_state: {
        chair_01: {
          dx_steps: -1,
          dy_steps: 2,
          rotation_steps: -2,
        },
      },
    });

    const rows = toObjectStateRows([sourceRecord(result)]);

    expect(rows[0]).toMatchObject({
      relative_dx_steps: -1,
      relative_dy_steps: 2,
      relative_rotation_steps: -2,
      absolute_x: 75,
      absolute_y: 150,
      absolute_rotation_deg: 260,
    });
  });

  it("exports observed values with blank target and error fields when scoring reference is missing", () => {
    const rows = toObjectStateRows([sourceRecord(createResult())]);

    expect(rows[0]).toMatchObject({
      relative_dx_steps: 2,
      relative_dy_steps: -1,
      relative_rotation_steps: 1,
      absolute_x: 150,
      absolute_y: 75,
      absolute_rotation_deg: 350,
      target_relative_dx_steps: "",
      target_relative_dy_steps: "",
      target_relative_rotation_steps: "",
      error_relative_dx_steps: "",
      error_relative_dy_steps: "",
      error_relative_rotation_steps: "",
      target_absolute_x: "",
      target_absolute_y: "",
      target_absolute_rotation_deg: "",
      error_absolute_x: "",
      error_absolute_y: "",
      error_absolute_distance: "",
      error_absolute_rotation_deg: "",
    });
  });

  it("uses shortest circular angle difference for absolute rotation error", () => {
    const rows = toObjectStateRows(
      [
        sourceRecord(
          createResult({
            final_state: {
              chair_01: {
                x: 150,
                y: 75,
                r: 350,
                counts: counts(),
                offsets: { xSteps: 2, ySteps: -1, rotationSteps: 1 },
              },
            },
          }),
        ),
      ],
      scoringReference({ absolute: { x: 150, y: 75, rotation_deg: 10 } }),
    );

    expect(rows[0].error_absolute_rotation_deg).toBe(20);
  });

  it("leaves absolute columns blank for relative final states without context", () => {
    const result = createResult({
      context: undefined,
      final_state_mode: "relative",
      final_state: {
        chair_01: {
          dx_steps: 1,
          dy_steps: 1,
          rotation_steps: 1,
        },
      },
    });

    const rows = toObjectStateRows([sourceRecord(result)]);

    expect(rows[0]).toMatchObject({
      relative_dx_steps: 1,
      relative_dy_steps: 1,
      relative_rotation_steps: 1,
      absolute_x: "",
      absolute_y: "",
      absolute_rotation_deg: "",
    });
  });
});

function sourceRecord(result: LayoutTaskResult): DecodedSourceRecord {
  return {
    sourceIndex: 3,
    decoded: {
      header: {
        version: "LAYOUTTASK1",
        qid: result.qid,
        taskId: result.task_id,
        sessionId: result.session,
        hash8: "ABC12345",
        encoding: "lz-uri",
      },
      hashOk: true,
      headerOk: true,
      result,
    },
  };
}

function createResult(overrides: Partial<LayoutTaskResult> = {}): LayoutTaskResult {
  return {
    schema: "layouttask.result.v1",
    exp: "exp1",
    qid: "Q1",
    task_id: "task1",
    session: "session1",
    start_time: 1_000,
    end_time: 2_000,
    duration_ms: 1_000,
    context: {
      world: {
        unit: "mm",
        viewBox: { x: 0, y: 0, width: 400, height: 400 },
        origin: { x: 0, y: 0 },
        grid_size: 25,
        grid_snap: true,
      },
      objects: {
        chair_01: {
          origin: { x: 100, y: 100, r: 320 },
          movement_step: 25,
          rotation_step: 30,
          limits: {},
        },
      },
    },
    events: [],
    final_state_mode: "absolute",
    final_state: {
      chair_01: {
        x: 150,
        y: 75,
        r: 350,
        counts: counts(),
        offsets: { xSteps: 2, ySteps: -1, rotationSteps: 1 },
      },
    },
    locked: true,
    ...overrides,
  };
}

function scoringReference(
  target: ObjectTargetState = {
    relative: { dx_steps: 2, dy_steps: -1, rotation_steps: 1 },
    absolute: { x: 150, y: 75, rotation_deg: 350 },
  },
): ScoringReferenceConfig {
  return {
    schema: "layouttask.scoring-reference.v1",
    experiment_id: "exp1",
    tasks: {
      task1: {
        qid: "Q1",
        objects: {
          chair_01: {
            role: "variable",
            group_id: "chairs",
            target,
          },
        },
      },
    },
  };
}

function counts(): OperationCounts {
  return {
    left: 0,
    right: 0,
    up: 0,
    down: 0,
    cw: 0,
    ccw: 0,
  };
}
