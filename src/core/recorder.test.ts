import { describe, expect, it, vi } from "vitest";
import { Recorder } from "./recorder";
import { createRuntimeConfig } from "../test-support/runtime-config";

describe("Recorder", () => {
  it("stamps event index/time and respects display/user-agent toggles", async () => {
    const baseConfig = createRuntimeConfig();
    const config = {
      ...baseConfig,
      recording: {
        ...baseConfig.recording,
        record_display_info: false,
        record_user_agent: false,
        record_final_state: false,
      },
    };
    const getDisplayInfo = vi.fn();
    const recorder = new Recorder({
      config,
      sessionId: "SESSION1",
      getDisplayInfo,
      getFinalState: () => ({
        chair_01: {
          x: 0,
          y: 0,
          r: 0,
          counts: { left: 0, right: 0, up: 0, down: 0, cw: 0, ccw: 0 },
          offsets: { xSteps: 0, ySteps: 0, rotationSteps: 0 },
        },
      }),
      nowImpl: createNowSequence([1_000, 1_120, 2_000]),
      getUserAgent: () => "Test UA",
    });

    recorder.start();
    const event = recorder.recordEvent({
      object: "chair_01",
      action: "move_right",
      valid: true,
    });
    const result = await recorder.finish();

    expect(event).toMatchObject({ i: 0, t: 120 });
    expect(getDisplayInfo).not.toHaveBeenCalled();
    expect(result.display).toBeUndefined();
    expect(result.user_agent).toBeUndefined();
    expect(result.final_state).toBeDefined();
  });
});

function createNowSequence(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index] ?? values[values.length - 1] ?? 0;
    index += 1;
    return value;
  };
}
