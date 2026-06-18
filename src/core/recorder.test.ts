import { describe, expect, it, vi } from "vitest";
import { Recorder } from "./recorder";
import { createRuntimeConfig } from "../test-support/runtime-config";

describe("Recorder", () => {
  it("stamps event index/time and respects display/user-agent toggles", async () => {
    const baseConfig = createRuntimeConfig({
      world: {
        unit: "mm",
        viewBox: { x: -500, y: -500, width: 1000, height: 1000 },
        origin: { x: 0, y: 0 },
        grid: { size: 25, visible: false, snap: true },
      },
    });
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
      getPageTiming: (submitTime, playerStartTime) => ({
        source: "performance.timeOrigin",
        page_open_time: 500,
        submit_time: submitTime,
        total_elapsed_ms: submitTime - 500,
        player_start_time: playerStartTime,
        player_elapsed_ms: submitTime - playerStartTime,
      }),
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
    expect(result.page_timing).toMatchObject({
      page_open_time: 500,
      submit_time: 2_000,
      total_elapsed_ms: 1_500,
      player_start_time: 1_000,
      player_elapsed_ms: 1_000,
    });
    expect(result.user_agent).toBeUndefined();
    expect(result.final_state).toBeDefined();
    expect(result.flow).toEqual({ mode: "direct_reconstruction" });
    expect(result.context?.world.unit).toBe("mm");
  });

  it("skips page timing when record_page_timing is false", async () => {
    const baseConfig = createRuntimeConfig();
    const recorder = new Recorder({
      config: {
        ...baseConfig,
        recording: {
          ...baseConfig.recording,
          record_page_timing: false,
        },
      },
      sessionId: "SESSION1",
      getPageTiming: () => {
        throw new Error("should not collect page timing");
      },
      getFinalState: () => ({}),
      nowImpl: createNowSequence([1_000, 2_000]),
    });

    recorder.start();
    const result = await recorder.finish();

    expect(result.page_timing).toBeUndefined();
  });

  it("includes flow timing when supplied", async () => {
    const baseConfig = createRuntimeConfig({
      flow: {
        mode: "preview_then_reconstruct",
        config: {
          preview_duration_sec: 10,
          require_preview_ack: true,
          intro_message: "You will have {seconds}s.",
          intro_confirm_label: "Start",
          stage_during_preview: "hidden",
          show_countdown: true,
          message_before: "Study for {seconds}s.",
          message_after: "Reconstruct.",
        },
      },
    });
    const recorder = new Recorder({
      config: baseConfig,
      sessionId: "SESSION1",
      getFinalState: () => ({}),
      getFlowInfo: () => ({
        mode: "preview_then_reconstruct",
        preview_ack_at: 900,
        preview_started_at: 1_000,
        preview_ended_at: 11_000,
        preview_duration_ms: 10_000,
        reconstruction_started_at: 11_000,
      }),
      nowImpl: createNowSequence([1_000, 12_000]),
    });

    recorder.start();
    const result = await recorder.finish();

    expect(result.flow).toEqual({
      mode: "preview_then_reconstruct",
      preview_ack_at: 900,
      preview_started_at: 1_000,
      preview_ended_at: 11_000,
      preview_duration_ms: 10_000,
      reconstruction_started_at: 11_000,
    });
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
