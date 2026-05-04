import { describe, expect, it } from "vitest";
import { StateStore } from "./state-store";
import { createRuntimeConfig } from "../test-support/runtime-config";

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
