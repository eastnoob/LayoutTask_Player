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
          inlineSvgText:
            '<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="34" height="34" rx="6" fill="#2f6f73" /></svg>',
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
        behaviorTemplateId: "move25_rotate45_limited",
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
        collision: {
          enabled: true,
          shape: "box",
          padding: 0,
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
    dataSave: {
      mode: "copy",
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
    flow: {
      mode: "direct_reconstruction",
    },
    messages: {
      confirm_lock_1: "After confirmation, the object layout will be locked. Continue?",
      confirm_lock_2: "Please confirm again: this will finalize the current layout.",
      confirm_no_edit: "You have not edited any object. Are you sure this unchanged layout is your final answer?",
      status_ready: "Ready",
      status_copy_again_ok: "Encoded result copied again.",
      status_copy_again_fail: "Copy failed. Please copy the encoded result manually.",
      instruction_edit_mode:
        "Click an object to enter edit mode. Controls stay visible until you tap the stage background to exit.",
      reconstruction_hint_title: "Reconstruct the scene from memory.",
      reconstruction_hint_drag: "Drag movable objects to place them.",
      reconstruction_hint_button: "Use the arrow buttons to move selected objects.",
      reconstruction_hint_rotation: "Use the rotate buttons to adjust orientation.",
      reconstruction_hint_select: "Click an object to show its available controls.",
    },
    requirements: {},
    stage: {
      fit: "contain",
      max_height_ratio: 0.72,
      padding: 16,
    },
    collision: {
      enabled: false,
      mode: "discrete",
      areas: [],
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
        behaviorTemplateId: "drag25_rotate45_limited",
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
