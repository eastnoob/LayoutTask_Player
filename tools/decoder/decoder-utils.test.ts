import { describe, expect, it } from "vitest";
import {
  isRelativeFinalState,
  toEventRows,
  toTrialRows,
  validateDecodedResult,
} from "./decoder-utils";
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

  it("exports page timing and display summary columns for trial CSV", () => {
    const rows = toTrialRows([{ sourceIndex: 0, decoded: createDecodedRecord() }]);

    expect(rows[0]).toMatchObject({
      page_timing_source: "performance.timeOrigin",
      page_open_time: 900,
      submit_time: 2000,
      total_elapsed_ms: 1100,
      player_start_time: 1000,
      player_elapsed_ms: 1000,
      visual_viewport_width: 1200,
      visual_viewport_height: 800,
      visual_viewport_scale: 1,
      screen_orientation_type: "landscape-primary",
      screen_orientation_angle: 0,
      screen_color_depth: 24,
      screen_pixel_depth: 24,
      display_image_css_width: 1000,
      display_image_css_height: 750,
      display_image_effective_pixel_width: 1500,
      display_image_effective_pixel_height: 1125,
      display_changes_event_count: 1,
      display_changes_resize_count: 2,
      display_changes_visual_viewport_resize_count: 1,
      display_changes_visual_viewport_scroll_count: 3,
      display_changes_orientation_change_count: 0,
    });
  });

  it("leaves trial CSV timing/display columns empty when optional groups are missing", () => {
    const decoded = createDecodedRecord();
    delete decoded.result.display;
    delete decoded.result.page_timing;
    const rows = toTrialRows([{ sourceIndex: 0, decoded }]);

    expect(rows[0].page_timing_source).toBe("");
    expect(rows[0].total_elapsed_ms).toBe("");
    expect(rows[0].visual_viewport_width).toBe("");
    expect(rows[0].display_changes_event_count).toBe("");
    expect(rows[0].display_image_effective_pixel_width).toBe("");
  });

  it("exports qc columns on event CSV rows", () => {
    const rows = toEventRows([{ sourceIndex: 7, decoded: createDecodedRecord() }]);

    expect(rows[0]).toMatchObject({
      source_index: 7,
      hash_ok: true,
      header_ok: true,
      final_state_mode: "relative",
      action: "move_right",
    });
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
      page_timing: {
        source: "performance.timeOrigin",
        page_open_time: 900,
        submit_time: 2_000,
        total_elapsed_ms: 1_100,
        player_start_time: 1_000,
        player_elapsed_ms: 1_000,
      },
      display: {
        viewport: { width: 1280, height: 900 },
        screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040 },
        visualViewport: {
          width: 1200,
          height: 800,
          scale: 1,
          offsetLeft: 0,
          offsetTop: 0,
          pageLeft: 0,
          pageTop: 0,
        },
        screenOrientation: {
          type: "landscape-primary",
          angle: 0,
        },
        screenColor: {
          colorDepth: 24,
          pixelDepth: 24,
        },
        devicePixelRatio: 1.5,
        displayImageRendered: {
          cssWidth: 1000,
          cssHeight: 750,
          devicePixelRatio: 1.5,
          effectivePixelWidth: 1500,
          effectivePixelHeight: 1125,
        },
        changes: {
          initial: {
            viewport: { width: 1280, height: 900 },
          },
          final: {
            viewport: { width: 1280, height: 900 },
          },
          events: [
            {
              i: 0,
              t: 15,
              type: "visual_viewport_resize",
              snapshot: {
                viewport: { width: 1280, height: 900 },
              },
            },
          ],
          resizeCount: 2,
          visualViewportResizeCount: 1,
          visualViewportScrollCount: 3,
          orientationChangeCount: 0,
        },
      },
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
