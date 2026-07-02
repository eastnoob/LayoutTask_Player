import { describe, expect, it } from "vitest";
import { pageTimingSchema, resultSchema } from "./result.schema";

function createMinimalResult(): any {
  return {
    schema: "layouttask.result.v1",
    exp: "EXP123",
    qid: "Q1",
    task_id: "room01",
    session: "S456",
    start_time: 1710000000000,
    end_time: 1710000005000,
    duration_ms: 5000,
    events: [],
    final_state_mode: "absolute",
    final_state: {
      chair_01: {
        x: 100,
        y: 100,
        r: 0,
        counts: {
          left: 0,
          right: 0,
          up: 0,
          down: 0,
          cw: 0,
          ccw: 0,
        },
      },
    },
    locked: true,
  };
}

describe("pageTimingSchema", () => {
  it("accepts fractional elapsed milliseconds from performance.timeOrigin", () => {
    // performance.timeOrigin can yield fractional millisecond protocol values.
    const parsed = pageTimingSchema.parse({
      source: "performance.timeOrigin",
      page_open_time: 1777994238876.2,
      submit_time: 1777994518204,
      total_elapsed_ms: 279327.8000488281,
      player_start_time: 1777994239766,
      player_elapsed_ms: 278438,
    });

    expect(parsed.total_elapsed_ms).toBe(279327.8000488281);
  });
});

describe("resultSchema events", () => {
  it("accepts collision as a blocked event reason", () => {
    // collision is a stable blocked outcome vocabulary item in result logs.
    const result = createMinimalResult();
    result.events = [
      {
        i: 0,
        t: 10,
        object: "chair_01",
        action: "move_right",
        valid: false,
        blocked_reason: "collision",
        before: { x: 100, y: 100, r: 0 },
        after: { x: 100, y: 100, r: 0 },
      },
    ];

    expect(resultSchema.parse(result).events?.[0].blocked_reason).toBe("collision");
  });
});

describe("resultSchema restore", () => {
  it("accepts optional restore metadata", () => {
    const parsed = resultSchema.parse({
      schema: "layouttask.result.v1",
      exp: "EXP123",
      qid: "Q1",
      task_id: "room01",
      session: "S456",
      start_time: 1710000000000,
      end_time: 1710000005000,
      duration_ms: 5000,
      restore: {
        recovered: true,
        restore_count: 2,
        draft_saved_at: 1710000002500.5,
        restored_at: 1710000003000.25,
      },
      events: [],
      final_state_mode: "absolute",
      final_state: {
        chair: {
          x: 10,
          y: 20,
          r: 90,
          counts: {
            left: 0,
            right: 1,
            up: 0,
            down: 0,
            cw: 1,
            ccw: 0,
          },
        },
      },
      locked: true,
    });

    expect(parsed.restore).toEqual({
      recovered: true,
      restore_count: 2,
      draft_saved_at: 1710000002500.5,
      restored_at: 1710000003000.25,
    });
  });
});

describe("resultSchema confidence", () => {
  it("accepts confidence values on result payloads", () => {
    const result = createMinimalResult();
    result.confidence = {
      chair_group: 4,
      table_group: 2,
    };

    expect(resultSchema.parse(result).confidence).toEqual({
      chair_group: 4,
      table_group: 2,
    });
  });

  it("rejects invalid confidence values", () => {
    const result = createMinimalResult();
    result.confidence = {
      chair_group: 0,
    };

    expect(() => resultSchema.parse(result)).toThrow();
  });
});
