import { describe, expect, it } from "vitest";
import { LayoutTaskEncoder } from "./encoder";
import type { LayoutTaskResult } from "../types/result";

describe("LayoutTaskEncoder", () => {
  it("encodes and decodes a result with hash and header validation", async () => {
    const encoder = new LayoutTaskEncoder();
    const result = createResult();

    const encoded = await encoder.encode(result);
    expect(encoded.output.startsWith("LAYOUTTASK1|Q1|room01|SESSION1|")).toBe(true);
    expect(encoded.output).toContain("|lz-uri|");

    const decoded = await encoder.decode(encoded.output);
    expect(decoded.hashOk).toBe(true);
    expect(decoded.headerOk).toBe(true);
    expect(decoded.header.encoding).toBe("lz-uri");
    expect(decoded.result.context).toBeUndefined();
    expect(decoded.result.events).toEqual([]);
    expect(decoded.result.final_state_mode).toBe("relative");
    expect(decoded.result.final_state).toEqual({
      chair_01: {
        dx_steps: 1,
        dy_steps: 0,
        rotation_steps: 0,
      },
    });
  });

  it("supports lz-base64 encoding", async () => {
    const encoder = new LayoutTaskEncoder();
    const result = createResult();

    const encoded = await encoder.encode(result, { encoding: "lz-base64" });
    expect(encoded.encoding).toBe("lz-base64");
    expect(encoded.output).toContain("|lz-base64|");

    const decoded = await encoder.decode(encoded.output);
    expect(decoded.hashOk).toBe(true);
    expect(decoded.headerOk).toBe(true);
    expect(decoded.header.encoding).toBe("lz-base64");
    expect(decoded.result.events).toEqual([]);
    expect(decoded.result.final_state_mode).toBe("relative");
  });

  it("supports plain-json encoding", async () => {
    const encoder = new LayoutTaskEncoder();
    const result = createResult();

    const encoded = await encoder.encode(result, { encoding: "plain-json" });
    expect(encoded.output).toContain("|plain-json|");

    const decoded = await encoder.decode(encoded.output);
    expect(decoded.hashOk).toBe(true);
    expect(decoded.headerOk).toBe(true);
    expect(decoded.result.events).toEqual([]);
    expect(decoded.result.final_state_mode).toBe("relative");
  });

  it("can include full event detail when configured", async () => {
    const encoder = new LayoutTaskEncoder();
    const result = createResult();

    const encoded = await encoder.encode(result, { detail: "full", final_state: "absolute" });
    const decoded = await encoder.decode(encoded.output);

    expect(decoded.hashOk).toBe(true);
    expect(decoded.result.context).toBeUndefined();
    expect(decoded.result).toEqual({
      ...result,
      context: undefined,
      final_state_mode: "absolute",
    });
  });
});

function createResult(): LayoutTaskResult {
  return {
    schema: "layouttask.result.v1",
    exp: "test_exp",
    qid: "Q1",
    task_id: "room01",
    session: "SESSION1",
    start_time: 1777884321123,
    end_time: 1777884322123,
    duration_ms: 1000,
    events: [
      {
        i: 0,
        t: 120,
        object: "chair_01",
        action: "move_right",
        valid: true,
        before: { x: 0, y: 0, r: 0 },
        after: { x: 25, y: 0, r: 0 },
        counts: { left: 0, right: 1, up: 0, down: 0, cw: 0, ccw: 0 },
        offsets: { xSteps: 1, ySteps: 0, rotationSteps: 0 },
      },
    ],
    final_state: {
      chair_01: {
        x: 25,
        y: 0,
        r: 0,
        counts: { left: 0, right: 1, up: 0, down: 0, cw: 0, ccw: 0 },
        offsets: { xSteps: 1, ySteps: 0, rotationSteps: 0 },
      },
    },
    locked: true,
  };
}
