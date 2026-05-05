import type { RuntimeTaskConfig } from "../types/runtime";

// Shared runtime-config fixture for unit tests.
// 统一测试输入后，controller / recorder / completion 的行为更容易横向比较。
export function createRuntimeConfig(overrides: Partial<RuntimeTaskConfig> = {}): RuntimeTaskConfig {
  return {
    schema: "layouttask.runtime.v1",
    experimentId: "test_exp",
    qid: "Q1",
    taskId: "room01",
    baseUrl: "http://example.test/layout-task/",
    world: {
      viewBox: { x: -500, y: -500, width: 1000, height: 1000 },
      origin: { x: 0, y: 0 },
      grid: { size: 25, visible: false, snap: true },
    },
    background: {
      assetId: "room01_bg",
      asset: {
        type: "svg",
        src: "assets/backgrounds/room01.svg",
        srcResolved: "http://example.test/layout-task/assets/backgrounds/room01.svg",
      },
      x: -400,
      y: -300,
      width: 800,
      height: 600,
    },
    objects: [
      {
        id: "chair_01",
        assetId: "chair_a",
        asset: {
          type: "svg",
          src: "assets/objects/chair_a.svg",
          srcResolved: "http://example.test/layout-task/assets/objects/chair_a.svg",
          default_width: 50,
          default_height: 50,
          anchor: "center",
        },
        x: 0,
        y: 0,
        rotation: 0,
        width: 50,
        height: 50,
        anchor: "center",
        behaviorId: "move25_rotate45_limited",
        behavior: {
          movement: {
            mode: "button",
            step: 25,
            max_left: 2,
            max_right: 2,
            max_up: 2,
            max_down: 2,
          },
          rotation: {
            step: 45,
            max_cw: 2,
            max_ccw: 2,
          },
          free_drag: {
            enabled: false,
          },
        },
      },
    ],
    completion: {
      double_confirm: true,
      lock_after_confirm: true,
      allow_copy_again: true,
    },
    recording: {
      record_events: true,
      record_final_state: true,
      record_display_info: true,
      record_display_changes: true,
      record_page_timing: true,
      record_user_agent: true,
      record_blocked_events: false,
    },
    output: {
      encoding: "lz-uri",
      detail: "final-only",
      final_state: "relative",
    },
    feedback: {
      limit_messages: {
        move_left: "You cannot move further left.",
        move_right: "You cannot move further right.",
        move_up: "You cannot move further up.",
        move_down: "You cannot move further down.",
        rotate_cw: "You cannot rotate further clockwise.",
        rotate_ccw: "You cannot rotate further counter-clockwise.",
      },
    },
    displayImage: undefined,
    ...overrides,
  };
}

export function createDragRuntimeConfig(overrides: Partial<RuntimeTaskConfig> = {}): RuntimeTaskConfig {
  const base = createRuntimeConfig();

  return createRuntimeConfig({
    ...base,
    objects: [
      {
        ...base.objects[0],
        behaviorId: "drag25_rotate45_limited",
        behavior: {
          ...base.objects[0].behavior,
          movement: {
            mode: "drag",
            step: 25,
            max_left: 2,
            max_right: 2,
            max_up: 2,
            max_down: 2,
          },
          free_drag: {
            enabled: true,
            snap: true,
          },
        },
      },
    ],
    ...overrides,
  });
}
