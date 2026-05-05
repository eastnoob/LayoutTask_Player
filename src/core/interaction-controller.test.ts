import { describe, expect, it, vi } from "vitest";
import type { LayoutTaskEvent } from "../types/events";
import type { LayoutTaskRenderer } from "./renderer";
import { InteractionController } from "./interaction-controller";
import { StateStore } from "./state-store";
import { createDragRuntimeConfig, createRuntimeConfig } from "../test-support/runtime-config";

describe("InteractionController", () => {
  it("requires selection before applying an action", () => {
    const store = new StateStore(createRuntimeConfig());
    const renderer = createRendererStub();
    const recorder = createRecorderStub();
    const controller = new InteractionController({
      config: createRuntimeConfig(),
      store,
      renderer,
      recorder,
    });

    controller.bind();
    const result = controller.requestAction({
      objectId: "chair_01",
      action: "move_right",
    });

    expect(result).toEqual({ ok: false, reason: "object_not_active" });
    expect(renderer.setStatus).toHaveBeenCalledWith("Select an object before using its controls.");
  });

  it("applies actions only for the active object", () => {
    const config = createRuntimeConfig();
    const store = new StateStore(config);
    const renderer = createRendererStub();
    const recorder = createRecorderStub();
    const controller = new InteractionController({
      config,
      store,
      renderer,
      recorder,
    });

    controller.bind();
    controller.selectObject("chair_01");

    const result = controller.requestAction({
      objectId: "chair_01",
      action: "move_right",
      pointer: { clientX: 10, clientY: 20 },
    });

    expect(result).toEqual({ ok: true });
    expect(store.getObjectState("chair_01").x).toBe(25);
    expect(recorder.recordEvent).toHaveBeenCalledOnce();
    expect(renderer.updateObject).toHaveBeenCalledWith("chair_01");
  });

  it("records blocked actions when record_blocked_events is enabled", () => {
    const config = createRuntimeConfig({
      recording: {
        ...createRuntimeConfig().recording,
        record_events: false,
        record_blocked_events: true,
      },
    });
    const store = new StateStore(config);
    const renderer = createRendererStub();
    const recorder = createRecorderStub();
    const controller = new InteractionController({
      config,
      store,
      renderer,
      recorder,
    });

    controller.bind();
    controller.selectObject("chair_01");
    controller.requestAction({ objectId: "chair_01", action: "move_left" });
    controller.requestAction({ objectId: "chair_01", action: "move_left" });
    const result = controller.requestAction({ objectId: "chair_01", action: "move_left" });

    expect(result).toEqual({ ok: false, reason: "limit_reached" });
    expect(recorder.recordEvent).toHaveBeenCalledOnce();
    expect(recorder.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        object: "chair_01",
        action: "move_left",
        valid: false,
        blocked_reason: "limit_reached",
      }),
    );
  });

  it("rejects actions after locking", () => {
    const config = createRuntimeConfig();
    const store = new StateStore(config);
    const renderer = createRendererStub();
    const recorder = createRecorderStub();
    const controller = new InteractionController({
      config,
      store,
      renderer,
      recorder,
    });

    controller.bind();
    controller.selectObject("chair_01");
    store.lock();

    const result = controller.requestAction({ objectId: "chair_01", action: "move_left" });
    expect(result).toEqual({ ok: false, reason: "locked" });
  });

  it("clears edit mode on deselect", () => {
    const config = createRuntimeConfig();
    const store = new StateStore(config);
    const renderer = createRendererStub();
    const recorder = createRecorderStub();
    const controller = new InteractionController({
      config,
      store,
      renderer,
      recorder,
    });

    controller.bind();
    controller.selectObject("chair_01");
    controller.deselectObject();

    expect(controller.getActiveObjectId()).toBeUndefined();
    expect(renderer.clearActiveObject).toHaveBeenCalledOnce();
  });

  it("records drag start and end without logging drag move events", () => {
    const config = createDragRuntimeConfig();
    const store = new StateStore(config);
    const renderer = createRendererStub();
    const recorder = createRecorderStub();
    const controller = new InteractionController({
      config,
      store,
      renderer,
      recorder,
    });

    controller.bind();
    expect(
      controller.requestDragStart({
        objectId: "chair_01",
        pointer: { clientX: 10, clientY: 20, pointerId: 7, worldX: 0, worldY: 0 },
      }),
    ).toEqual({ ok: true });
    expect(
      controller.requestDragMove({
        objectId: "chair_01",
        pointer: { clientX: 30, clientY: 40, pointerId: 7, worldX: 37, worldY: -62 },
      }),
    ).toEqual({ ok: true });
    expect(
      controller.requestDragEnd({
        objectId: "chair_01",
        pointer: { clientX: 35, clientY: 45, pointerId: 7, worldX: 37, worldY: -62 },
      }),
    ).toEqual({ ok: true });

    expect(store.getObjectState("chair_01")).toMatchObject({ x: 25, y: -50 });
    expect(recorder.recordEvent).toHaveBeenCalledTimes(2);
    expect(recorder.recordEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ object: "chair_01", action: "drag_start", valid: true }),
    );
    expect(recorder.recordEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        object: "chair_01",
        action: "drag_end",
        valid: true,
        after: { x: 25, y: -50, r: 0 },
      }),
    );
    expect(renderer.setDragging).toHaveBeenCalledWith("chair_01", true);
    expect(renderer.setDragging).toHaveBeenCalledWith("chair_01", false);
  });

  it("rejects drag for button-mode objects", () => {
    const config = createRuntimeConfig();
    const store = new StateStore(config);
    const renderer = createRendererStub();
    const recorder = createRecorderStub();
    const controller = new InteractionController({
      config,
      store,
      renderer,
      recorder,
    });

    controller.bind();
    const result = controller.requestDragStart({
      objectId: "chair_01",
      pointer: { clientX: 10, clientY: 20, pointerId: 1, worldX: 0, worldY: 0 },
    });

    expect(result).toEqual({ ok: false, reason: "movement_disabled" });
    expect(recorder.recordEvent).not.toHaveBeenCalled();
  });
});

function createRendererStub(): LayoutTaskRenderer {
  return {
    setStatus: vi.fn(),
    updateObject: vi.fn(),
    updateControlsDisabled: vi.fn(),
    activateObject: vi.fn(),
    clearActiveObject: vi.fn(),
    setDragging: vi.fn(),
  } as unknown as LayoutTaskRenderer;
}

function createRecorderStub(): { recordEvent: ReturnType<typeof vi.fn> } {
  return {
    recordEvent: vi.fn((event: Omit<LayoutTaskEvent, "i" | "t">) => ({
      ...event,
      i: 0,
      t: 0,
    })),
  };
}
