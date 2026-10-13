import { describe, expect, it } from "vitest";
import {
  isRelativeFinalState,
  toEventRows,
  toTrialRows,
  validateDecodedResult,
} from "./decoder-utils";
import type { DecodedLayoutTask } from "../../src/core/encoder";
import type { PauseSummary } from "../../src/types/result";

describe("decoder validation", () => {
  it("accepts a clean relative final-state record", () => {
    const validation = validateDecodedResult(createDecodedRecord());

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it("validates Pause-adjusted and magnifier-adjusted durations separately", () => {
    const decoded = createDecodedRecord();
    decoded.result.pause = {
      pause_used: true,
      pause_count: 1,
      pause_duration_ms: 200,
      pause_events: [
        { type: "pause_confirmed", mode: "formal", at: 1_200 },
        { type: "pause_resumed", mode: "formal", at: 1_400, reason: "manual_resume" },
      ],
    };
    decoded.result.duration_ms = 800;
    decoded.result.magnifier = { use_count: 2, total_duration_ms: 100 };
    decoded.result.effective_duration_ms = 700;

    const validation = validateDecodedResult(decoded);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.warnings).toEqual([]);
  });

  it.each([
    { name: "fully before the task", intervals: [[200, 400]], total: 200, duration: 1_000 },
    { name: "fully after the task", intervals: [[2_100, 2_300]], total: 200, duration: 1_000 },
    { name: "overlapping the task start", intervals: [[900, 1_100]], total: 200, duration: 900 },
    { name: "overlapping the task end", intervals: [[1_900, 2_100]], total: 200, duration: 900 },
    { name: "completely inside the task", intervals: [[1_200, 1_400]], total: 200, duration: 800 },
    { name: "spanning the task", intervals: [[900, 2_100]], total: 1_200, duration: 0 },
    { name: "touching the task boundaries", intervals: [[800, 1_000], [2_000, 2_200]], total: 400, duration: 1_000 },
    { name: "multiple known intervals", intervals: [[200, 400], [1_100, 1_300], [1_900, 2_200]], total: 700, duration: 700 },
  ])("clips Pause intervals $name", ({ intervals, total, duration }) => {
    const decoded = createDecodedRecord();
    decoded.result.events[0].t = 0;
    decoded.result.pause = {
      pause_used: true,
      pause_count: intervals.length,
      pause_duration_ms: total,
      pause_events: intervals.flatMap(([start, end]) => [
        { type: "pause_confirmed" as const, mode: "formal" as const, at: start },
        { type: "pause_resumed" as const, mode: "formal" as const, at: end, reason: "manual_resume" as const },
      ]),
    };
    decoded.result.duration_ms = duration;

    expect(validateDecodedResult(decoded)).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it("uses complete historical single-interval timestamps without events", () => {
    const decoded = createDecodedRecord();
    decoded.result.pause = {
      pause_used: true, pause_count: 1, pause_duration_ms: 200, pause_events: [],
      pause_started_at: 900, pause_ended_at: 1_100,
    };
    decoded.result.duration_ms = 900;

    expect(validateDecodedResult(decoded)).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it("does not certify formal timing when event interval count contradicts pause_count", () => {
    const decoded = createDecodedRecord();
    decoded.result.pause = {
      pause_used: true,
      pause_count: 1,
      pause_duration_ms: 400,
      pause_events: [
        { type: "pause_confirmed", mode: "formal", at: 1_100 },
        { type: "pause_resumed", mode: "formal", at: 1_300, reason: "manual_resume" },
        { type: "pause_confirmed", mode: "formal", at: 1_500 },
        { type: "pause_resumed", mode: "formal", at: 1_700, reason: "manual_resume" },
      ],
    };
    decoded.result.duration_ms = 600;

    const validation = validateDecodedResult(decoded);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.warnings).toContain("pause_timing_unverifiable");
  });

  it("still certifies tutorial practice intervals with the formal pause count representation", () => {
    const decoded = createDecodedRecord();
    decoded.result.pause = {
      pause_used: false,
      pause_count: 0,
      pause_duration_ms: 200,
      tutorial_pause_practice: true,
      pause_events: [
        { type: "pause_confirmed", mode: "tutorial_practice", at: 1_200 },
        { type: "pause_resumed", mode: "tutorial_practice", at: 1_400, reason: "manual_resume" },
      ],
    };
    decoded.result.duration_ms = 800;

    expect(validateDecodedResult(decoded)).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it.each<{ name: string; pause: PauseSummary }>([
    { name: "aggregate only", pause: { pause_used: true, pause_count: 1, pause_duration_ms: 200, pause_events: [] } },
    { name: "incomplete pair", pause: { pause_used: true, pause_count: 1, pause_duration_ms: 200, pause_events: [
      { type: "pause_confirmed", mode: "formal", at: 1_200 },
    ] } },
    { name: "missing earlier interval", pause: { pause_used: true, pause_count: 2, pause_duration_ms: 400, pause_events: [
      { type: "pause_confirmed", mode: "formal", at: 1_200 },
      { type: "pause_resumed", mode: "formal", at: 1_400, reason: "manual_resume" },
    ] } },
    { name: "timestamps covering only the latest interval", pause: {
      pause_used: true, pause_count: 2, pause_duration_ms: 400, pause_events: [],
      pause_started_at: 1_200, pause_ended_at: 1_400,
    } },
  ])("warns rather than validating exact historical timing: $name", ({ pause }) => {
    const decoded = createDecodedRecord();
    decoded.result.pause = pause;
    decoded.result.duration_ms = 900;
    decoded.result.magnifier = { use_count: 1, total_duration_ms: 100 };
    decoded.result.effective_duration_ms = 800;
    decoded.result.page_timing!.effective_player_elapsed_ms = 800;

    const validation = validateDecodedResult(decoded);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.warnings).toContain("pause_timing_unverifiable");
  });

  it("accepts an explicitly unused Pause summary without a compatibility warning", () => {
    const decoded = createDecodedRecord();
    decoded.result.pause = { pause_used: false, pause_count: 0, pause_duration_ms: 0, pause_events: [] };

    expect(validateDecodedResult(decoded)).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it.each([
    { offset: 10, errors: [] },
    { offset: -10, errors: [] },
    { offset: 11, errors: ["duration_mismatch"] },
    { offset: -11, errors: ["duration_mismatch"] },
  ])("applies the 10 ms task-duration tolerance to offset $offset", ({ offset, errors }) => {
    const decoded = createDecodedRecord();
    decoded.result.duration_ms = 1_000 + offset;

    expect(validateDecodedResult(decoded).errors).toEqual(errors);
  });

  it("still detects a real duration mismatch after clipping a previous task's Pause", () => {
    const decoded = createDecodedRecord();
    decoded.result.pause = {
      pause_used: true, pause_count: 1, pause_duration_ms: 200, pause_events: [
        { type: "pause_confirmed", mode: "formal", at: 200 },
        { type: "pause_resumed", mode: "formal", at: 400, reason: "manual_resume" },
      ],
    };
    decoded.result.duration_ms = 800;

    expect(validateDecodedResult(decoded).errors).toContain("duration_mismatch");
  });

  it("derives effective page duration from clipped Pause when active elapsed is missing", () => {
    const decoded = createDecodedRecord();
    decoded.result.pause = {
      pause_used: true, pause_count: 1, pause_duration_ms: 200, pause_events: [],
      pause_started_at: 900, pause_ended_at: 1_100,
    };
    decoded.result.duration_ms = 900;
    decoded.result.magnifier = { use_count: 1, total_duration_ms: 100 };
    decoded.result.effective_duration_ms = 800;
    decoded.result.page_timing!.effective_player_elapsed_ms = 800;

    expect(validateDecodedResult(decoded)).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it("uses the page player window when it differs from the task window", () => {
    const decoded = createDecodedRecord();
    decoded.result.pause = {
      pause_used: true, pause_count: 1, pause_duration_ms: 200, pause_events: [],
      pause_started_at: 900, pause_ended_at: 1_100,
    };
    decoded.result.duration_ms = 900;
    decoded.result.magnifier = { use_count: 1, total_duration_ms: 100 };
    decoded.result.page_timing!.player_start_time = 900;
    decoded.result.page_timing!.player_elapsed_ms = 1_100;
    decoded.result.page_timing!.effective_player_elapsed_ms = 800;

    expect(validateDecodedResult(decoded)).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it.each([
    { offset: 10, errors: [] },
    { offset: -10, errors: [] },
    { offset: 11, errors: ["effective_duration_mismatch", "effective_player_duration_mismatch"] },
    { offset: -11, errors: ["effective_duration_mismatch", "effective_player_duration_mismatch"] },
  ])("applies the 10 ms tolerance to effective task/page offset $offset", ({ offset, errors }) => {
    const decoded = createDecodedRecord();
    decoded.result.magnifier = { use_count: 1, total_duration_ms: 100 };
    decoded.result.effective_duration_ms = 900 + offset;
    decoded.result.page_timing!.active_player_elapsed_ms = 1_000;
    decoded.result.page_timing!.effective_player_elapsed_ms = 900 + offset;

    expect(validateDecodedResult(decoded).errors).toEqual(errors);
  });

  it("checks magnifier accounting even when historical Pause timing is unverifiable", () => {
    const decoded = createDecodedRecord();
    decoded.result.pause = { pause_used: true, pause_count: 1, pause_duration_ms: 200, pause_events: [] };
    decoded.result.duration_ms = 900;
    decoded.result.magnifier = { use_count: 1, total_duration_ms: 100 };
    decoded.result.effective_duration_ms = 811;
    decoded.result.page_timing!.active_player_elapsed_ms = 900;
    decoded.result.page_timing!.effective_player_elapsed_ms = 811;

    const validation = validateDecodedResult(decoded);

    expect(validation.errors).toEqual(["effective_duration_mismatch", "effective_player_duration_mismatch"]);
    expect(validation.warnings).toContain("pause_timing_unverifiable");
  });

  it("does not hide an impossible magnifier duration behind zero effective durations", () => {
    const decoded = createDecodedRecord();
    decoded.result.magnifier = { use_count: 1, total_duration_ms: 1_011 };
    decoded.result.effective_duration_ms = 0;
    decoded.result.page_timing!.effective_player_elapsed_ms = 0;

    const validation = validateDecodedResult(decoded);

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain("magnifier_duration_exceeds_duration");
    expect(validation.errors).toContain("effective_duration_mismatch");
    expect(validation.errors).toContain("effective_player_duration_mismatch");
  });

  it("rejects a magnifier total exceeding reported page active elapsed", () => {
    const decoded = createDecodedRecord();
    decoded.result.magnifier = { use_count: 1, total_duration_ms: 100 };
    decoded.result.page_timing!.active_player_elapsed_ms = 80;
    decoded.result.page_timing!.effective_player_elapsed_ms = 0;

    expect(validateDecodedResult(decoded).errors).toContain("effective_player_duration_mismatch");
  });

  it("checks impossible magnifier totals even when effective fields are absent", () => {
    const decoded = createDecodedRecord();
    decoded.result.magnifier = { use_count: 1, total_duration_ms: 1_011 };

    expect(validateDecodedResult(decoded).errors).toContain("magnifier_duration_exceeds_duration");
  });

  it("warns when effective fields lack their historical magnifier summary", () => {
    const decoded = createDecodedRecord();
    decoded.result.effective_duration_ms = 900;
    decoded.result.page_timing!.effective_player_elapsed_ms = 900;

    expect(validateDecodedResult(decoded)).toEqual({
      valid: true, errors: [], warnings: ["magnifier_timing_unverifiable"],
    });
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
      world_unit: "mm",
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

  it("exports magnifier and effective timing columns for trial CSV", () => {
    const decoded = createDecodedRecord();
    decoded.result.magnifier = { use_count: 2, total_duration_ms: 100 };
    decoded.result.effective_duration_ms = 900;
    decoded.result.page_timing!.effective_player_elapsed_ms = 900;

    const rows = toTrialRows([{ sourceIndex: 0, decoded }]);

    expect(rows[0]).toMatchObject({
      effective_duration_ms: 900,
      effective_player_elapsed_ms: 900,
      magnifier_used: true,
      magnifier_use_count: 2,
      magnifier_duration_ms: 100,
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
          unit: "mm",
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
