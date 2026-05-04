import { describe, expect, it } from "vitest";
import { StateStore } from "./state-store";
import type { RuntimeTaskConfig } from "../types/runtime";

describe("StateStore action limits", () => {
  it("limits movement by offset from the initial position", () => {
    const store = new StateStore(createRuntimeConfig());

    store.applyAction("chair_01", "move_left");
    store.applyAction("chair_01", "move_left");

    expect(store.getObjectState("chair_01")).toMatchObject({ x: -50, y: 0 });
    expect(store.getObjectOffsets("chair_01")).toMatchObject({ xSteps: -2, ySteps: 0 });
    expect(store.canApplyAction("chair_01", "move_left")).toEqual({
      ok: false,
      reason: "limit_reached",
    });
    expect(store.canApplyAction("chair_01", "move_right")).toEqual({ ok: true });

    store.applyAction("chair_01", "move_right");
    store.applyAction("chair_01", "move_right");
    store.applyAction("chair_01", "move_right");
    store.applyAction("chair_01", "move_right");

    expect(store.getObjectState("chair_01")).toMatchObject({
      x: 50,
      y: 0,
      counts: {
        left: 2,
        right: 4,
      },
    });
    expect(store.getObjectOffsets("chair_01")).toMatchObject({ xSteps: 2, ySteps: 0 });
    expect(store.canApplyAction("chair_01", "move_right")).toEqual({
      ok: false,
      reason: "limit_reached",
    });
  });

  it("limits rotation by offset from the initial rotation", () => {
    const store = new StateStore(createRuntimeConfig());

    store.applyAction("chair_01", "rotate_cw");
    store.applyAction("chair_01", "rotate_cw");

    expect(store.getObjectState("chair_01")).toMatchObject({
      r: 90,
    });
    expect(store.getObjectOffsets("chair_01")).toMatchObject({ rotationSteps: 2 });
    expect(store.canApplyAction("chair_01", "rotate_cw")).toEqual({
      ok: false,
      reason: "limit_reached",
    });
    expect(store.canApplyAction("chair_01", "rotate_ccw")).toEqual({ ok: true });

    store.applyAction("chair_01", "rotate_ccw");
    store.applyAction("chair_01", "rotate_ccw");
    store.applyAction("chair_01", "rotate_ccw");
    store.applyAction("chair_01", "rotate_ccw");

    expect(store.getObjectState("chair_01")).toMatchObject({
      r: 270,
      counts: {
        cw: 2,
        ccw: 4,
      },
    });
    expect(store.getObjectOffsets("chair_01")).toMatchObject({ rotationSteps: -2 });
    expect(store.canApplyAction("chair_01", "rotate_ccw")).toEqual({
      ok: false,
      reason: "limit_reached",
    });
  });

  it("blocks actions after locking", () => {
    const store = new StateStore(createRuntimeConfig());
    store.lock();

    expect(store.canApplyAction("chair_01", "move_left")).toEqual({
      ok: false,
      reason: "locked",
    });
  });
});

function createRuntimeConfig(): RuntimeTaskConfig {
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
      record_user_agent: true,
      record_blocked_events: false,
    },
  };
}
