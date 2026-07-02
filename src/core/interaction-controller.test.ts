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

  it("does not select static context objects", () => {
    const base = createRuntimeConfig();
    const config = createRuntimeConfig({
      objects: [
        {
          ...base.objects[0],
          behavior: {
            movement: { mode: "none" },
            free_drag: { enabled: false },
          },
        },
      ],
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

    expect(controller.getActiveObjectId()).toBeUndefined();
    expect(renderer.activateObject).not.toHaveBeenCalled();
    expect(renderer.updateControlsDisabled).not.toHaveBeenCalled();
  });

  it("still selects rotation-only objects", () => {
    const base = createRuntimeConfig();
    const config = createRuntimeConfig({
      objects: [
        {
          ...base.objects[0],
          behavior: {
            movement: { mode: "none" },
            rotation: { step: 90 },
            free_drag: { enabled: false },
          },
        },
      ],
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

    expect(controller.getActiveObjectId()).toBe("chair_01");
    expect(renderer.activateObject).toHaveBeenCalledWith("chair_01");
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

  it("shows limit feedback when an active object hits a movement limit", () => {
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
    controller.requestAction({ objectId: "chair_01", action: "move_left" });
    controller.requestAction({ objectId: "chair_01", action: "move_left" });
    const result = controller.requestAction({ objectId: "chair_01", action: "move_left" });

    expect(result).toEqual({ ok: false, reason: "limit_reached" });
    expect(renderer.showLimitFeedback).toHaveBeenCalledWith("chair_01", "move_left");
  });

  it("records collision blocked events and shows limit feedback", () => {
    const base = createRuntimeConfig();
    const config = createRuntimeConfig({
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
      recording: {
        ...base.recording,
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
    const result = controller.requestAction({ objectId: "chair_01", action: "move_right" });

    expect(result).toEqual({ ok: false, reason: "collision" });
    expect(renderer.showLimitFeedback).toHaveBeenCalledWith("chair_01", "move_right");
    expect(store.getObjectState("chair_01")).toMatchObject({ x: 0, y: 0 });
    expect(recorder.recordEvent).toHaveBeenCalledOnce();
    expect(recorder.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        object: "chair_01",
        action: "move_right",
        valid: false,
        blocked_reason: "collision",
      }),
    );
  });

  it("does not show limit feedback for inactive objects", () => {
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
    const result = controller.requestAction({ objectId: "chair_01", action: "move_left" });

    expect(result).toEqual({ ok: false, reason: "object_not_active" });
    expect(renderer.showLimitFeedback).not.toHaveBeenCalled();
  });

  it("does not show limit feedback after locking", () => {
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
    expect(renderer.showLimitFeedback).not.toHaveBeenCalled();
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

  it("blocks deselect when active group requires confidence", () => {
    const config = createRuntimeConfig();
    const store = new StateStore(config);
    const renderer = createRendererStub();
    const controller = new InteractionController({
      config,
      store,
      renderer,
      recorder: createRecorderStub(),
      confidence: {
        canEnterObjectEdit: vi.fn(() => ({ ok: true as const })),
        enterObjectEdit: vi.fn(),
        canLeaveActiveGroup: vi.fn(() => ({
          ok: false,
          reason: "confidence_required",
          groupId: "chair_group",
        })),
        leaveActiveGroup: vi.fn(() => ({
          ok: false,
          reason: "confidence_required",
          groupId: "chair_group",
        })),
      },
    });

    controller.bind();
    controller.selectObject("chair_01");
    controller.deselectObject();

    expect(controller.getActiveObjectId()).toBe("chair_01");
    expect(renderer.clearActiveObject).not.toHaveBeenCalled();
    expect(renderer.setStatus).toHaveBeenLastCalledWith(
      "Choose a confidence rating for this furniture group before exiting edit mode.",
    );
  });

  it("blocks switching objects when active group requires confidence", () => {
    const base = createRuntimeConfig();
    const config = createRuntimeConfig({
      objects: [
        base.objects[0],
        {
          ...base.objects[0],
          id: "table_01",
        },
      ],
    });
    const store = new StateStore(config);
    const renderer = createRendererStub();
    const controller = new InteractionController({
      config,
      store,
      renderer,
      recorder: createRecorderStub(),
      confidence: {
        canEnterObjectEdit: vi.fn((objectId: string) =>
          objectId === "table_01"
            ? { ok: false as const, reason: "confidence_required", groupId: "chair_group" }
            : { ok: true as const },
        ),
        enterObjectEdit: vi.fn(),
        canLeaveActiveGroup: vi.fn(() => ({ ok: true as const })),
        leaveActiveGroup: vi.fn(() => ({ ok: true as const })),
      },
    });

    controller.bind();
    controller.selectObject("chair_01");
    controller.selectObject("table_01");

    expect(controller.getActiveObjectId()).toBe("chair_01");
    expect(renderer.activateObject).toHaveBeenCalledWith("chair_01");
    expect(renderer.activateObject).not.toHaveBeenCalledWith("table_01");
    expect(renderer.setStatus).toHaveBeenLastCalledWith(
      "Choose a confidence rating for this furniture group before exiting edit mode.",
    );
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

  it("shows limit feedback when drag is clamped by movement limits", () => {
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
    controller.requestDragStart({
      objectId: "chair_01",
      pointer: { clientX: 10, clientY: 20, pointerId: 7, worldX: 0, worldY: 0 },
    });
    controller.requestDragMove({
      objectId: "chair_01",
      pointer: { clientX: 30, clientY: 40, pointerId: 7, worldX: 500, worldY: 0 },
    });

    expect(renderer.showLimitFeedback).toHaveBeenCalledWith("chair_01", "move_right");
  });

  it("records blocked drag collision events when enabled", () => {
    const base = createDragRuntimeConfig();
    const config = createDragRuntimeConfig({
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
      recording: {
        ...base.recording,
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
    expect(
      controller.requestDragStart({
        objectId: "chair_01",
        pointer: { clientX: 10, clientY: 20, pointerId: 7, worldX: 0, worldY: 0 },
      }),
    ).toEqual({ ok: true });
    expect(
      controller.requestDragMove({
        objectId: "chair_01",
        pointer: { clientX: 30, clientY: 40, pointerId: 7, worldX: 25, worldY: 0 },
      }),
    ).toEqual({ ok: true });
    expect(
      controller.requestDragEnd({
        objectId: "chair_01",
        pointer: { clientX: 35, clientY: 45, pointerId: 7, worldX: 0, worldY: 0 },
      }),
    ).toEqual({ ok: true });

    expect(store.getObjectState("chair_01")).toMatchObject({ x: 0, y: 0 });
    expect(recorder.recordEvent).toHaveBeenCalledTimes(3);
    expect(recorder.recordEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        object: "chair_01",
        action: "drag_move",
        valid: false,
        blocked_reason: "collision",
        before: { x: 0, y: 0, r: 0 },
        after: { x: 0, y: 0, r: 0 },
        pointer: { clientX: 30, clientY: 40, pointerId: 7, worldX: 25, worldY: 0 },
      }),
    );
    expect(recorder.recordEvent).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        object: "chair_01",
        action: "drag_end",
        valid: true,
        after: { x: 0, y: 0, r: 0 },
      }),
    );
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
    showLimitFeedback: vi.fn(),
    activateObject: vi.fn(),
    clearActiveObject: vi.fn(),
    setDragging: vi.fn(),
    focusConfidence: vi.fn(),
    showConfidenceForActiveGroup: vi.fn(),
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
