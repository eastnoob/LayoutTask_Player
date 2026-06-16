import { describe, expect, it } from "vitest";
import { StateStore } from "./state-store";
import { createDragRuntimeConfig, createRuntimeConfig } from "../test-support/runtime-config";

describe("StateStore action limits", () => {
  it("limits movement by offset from the initial position", () => {
    const store = new StateStore(createRuntimeConfig());
    expect(store.hasEdits()).toBe(false);

    store.applyAction("chair_01", "move_left");
    expect(store.hasEdits()).toBe(true);
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

  it("applies drag positions with snap and relative movement limits", () => {
    const store = new StateStore(createDragRuntimeConfig());
    expect(store.hasEdits()).toBe(false);

    const transition = store.applyDragPosition("chair_01", { x: 37, y: -62 });

    expect(transition.after).toMatchObject({ x: 25, y: -50 });
    expect(transition.offsets).toMatchObject({ xSteps: 1, ySteps: -2 });
    expect(store.hasEdits()).toBe(true);

    const limited = store.applyDragPosition("chair_01", { x: 500, y: -500 });
    expect(limited.after).toMatchObject({ x: 50, y: -50 });
    expect(limited.offsets).toMatchObject({ xSteps: 2, ySteps: -2 });
    expect(limited.limitedAction).toBe("move_right");
  });

  it("snaps drag positions to the configured grid origin", () => {
    const store = new StateStore(
      createDragRuntimeConfig({
        world: {
          viewBox: { x: -500, y: -500, width: 1000, height: 1000 },
          origin: { x: 0, y: 0 },
          grid: { size: 25, visible: false, snap: true, origin: { x: 10, y: 5 } },
        },
      }),
    );

    const transition = store.applyDragPosition("chair_01", { x: 36, y: 31 });

    expect(transition.after).toMatchObject({ x: 35, y: 30 });
  });

  it("clips drag positions to the world viewBox", () => {
    const store = new StateStore(
      createDragRuntimeConfig({
        world: {
          viewBox: { x: -25, y: -25, width: 50, height: 50 },
          origin: { x: 0, y: 0 },
          grid: { size: 25, visible: false, snap: true },
        },
      }),
    );

    const transition = store.applyDragPosition("chair_01", { x: 100, y: 100 });
    expect(transition.after).toMatchObject({ x: 25, y: 25 });
  });

  it("rejects dragging for button-mode objects and locked stores", () => {
    const buttonStore = new StateStore(createRuntimeConfig());
    expect(buttonStore.canDragObject("chair_01")).toEqual({ ok: false, reason: "movement_disabled" });

    const dragStore = new StateStore(createDragRuntimeConfig());
    dragStore.lock();
    expect(dragStore.canDragObject("chair_01")).toEqual({ ok: false, reason: "locked" });
  });

  it("does not count a no-op drag as an edit", () => {
    const store = new StateStore(createDragRuntimeConfig());

    store.applyDragPosition("chair_01", { x: 0, y: 0 });

    expect(store.hasEdits()).toBe(false);
  });

  it("blocks button movement when the next step overlaps another collision-enabled object", () => {
    const store = new StateStore(createCollisionRuntimeConfig());

    expect(store.canApplyAction("chair_01", "move_right")).toEqual({
      ok: false,
      reason: "collision",
    });
    expect(() => store.applyAction("chair_01", "move_right")).toThrow(
      "Cannot apply move_right to chair_01: collision",
    );
    expect(store.getObjectState("chair_01")).toMatchObject({
      x: 0,
      y: 0,
      counts: {
        right: 0,
      },
    });
    expect(store.hasEdits()).toBe(false);
  });

  it("blocks rotation when the next rotation overlaps another collision-enabled object", () => {
    const store = new StateStore(createCollisionRuntimeConfig({ rotationalObject: true }));

    expect(store.canApplyAction("chair_01", "rotate_cw")).toEqual({
      ok: false,
      reason: "collision",
    });
    expect(store.getObjectState("chair_01")).toMatchObject({
      r: 0,
      counts: {
        cw: 0,
      },
    });
  });

  it("keeps the last valid drag position when the dragged candidate collides", () => {
    const store = new StateStore(createCollisionDragRuntimeConfig());

    const transition = store.applyDragPosition("chair_01", { x: 25, y: 0 });

    expect(transition.before).toEqual({ x: 0, y: 0, r: 0 });
    expect(transition.after).toEqual({ x: 0, y: 0, r: 0 });
    expect(transition.limitedAction).toBe("move_right");
    expect(transition.blockedReason).toBe("collision");
    expect(store.getObjectState("chair_01")).toMatchObject({ x: 0, y: 0 });
    expect(store.hasEdits()).toBe(false);
  });
});

function createCollisionRuntimeConfig(options: { rotationalObject?: boolean } = {}) {
  const base = createRuntimeConfig();
  const movingObject = options.rotationalObject
    ? {
        ...base.objects[0],
        width: 80,
        height: 20,
      }
    : base.objects[0];
  const blockingObject = options.rotationalObject
    ? {
        ...base.objects[0],
        id: "table_01",
        x: 35,
        y: 20,
        width: 20,
        height: 20,
      }
    : {
        ...base.objects[0],
        id: "table_01",
        x: 55,
        y: 0,
        width: 20,
        height: 50,
      };

  return createRuntimeConfig({
    collision: {
      ...base.collision,
      enabled: true,
    },
    objects: [movingObject, blockingObject],
  });
}

function createCollisionDragRuntimeConfig() {
  const base = createDragRuntimeConfig();

  return createDragRuntimeConfig({
    collision: {
      ...base.collision,
      enabled: true,
    },
    objects: [
      base.objects[0],
      {
        ...base.objects[0],
        id: "table_01",
        x: 55,
        y: 0,
        width: 20,
        height: 50,
      },
    ],
  });
}
