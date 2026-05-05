import { describe, expect, it } from "vitest";
import { behaviorSchema, taskSchema } from "./config.schema";

describe("behaviorSchema", () => {
  it("requires movement.mode drag to match free_drag.enabled", () => {
    // Drag authoring must be explicit in both places.
    // 这样研究者配置错时会尽早失败，而不是运行时表现得像坏掉了一样。
    expect(() =>
      behaviorSchema.parse({
        movement: { mode: "drag", step: 25 },
        free_drag: { enabled: false },
      }),
    ).toThrow("free_drag.enabled must match movement.mode='drag'");

    expect(() =>
      behaviorSchema.parse({
        movement: { mode: "button", step: 25 },
        free_drag: { enabled: true },
      }),
    ).toThrow("free_drag.enabled must match movement.mode='drag'");
  });
});

describe("taskSchema display_image", () => {
  it("accepts a display image and defaults enabled/alt/record_metrics", () => {
    const parsed = taskSchema.parse({
      schema: "layouttask.task.v1",
      task_id: "room01",
      qid: "Q1",
      world: {
        viewBox: { x: -500, y: -500, width: 1000, height: 1000 },
        origin: { x: 0, y: 0 },
        grid: { size: 25 },
      },
      background: {
        asset: "room01_bg",
        x: -400,
        y: -300,
        width: 800,
        height: 600,
      },
      objects: [],
      display_image: {
        src: "assets/display-images/example.jpeg",
      },
    });

    expect(parsed.display_image).toMatchObject({
      enabled: true,
      src: "assets/display-images/example.jpeg",
      alt: "Reference image",
      record_metrics: true,
    });
  });
});

describe("taskSchema recording", () => {
  it("accepts display and page timing toggles", () => {
    const parsed = taskSchema.parse({
      schema: "layouttask.task.v1",
      task_id: "room01",
      qid: "Q1",
      world: {
        viewBox: { x: -500, y: -500, width: 1000, height: 1000 },
        origin: { x: 0, y: 0 },
        grid: { size: 25 },
      },
      background: {
        asset: "room01_bg",
        x: -400,
        y: -300,
        width: 800,
        height: 600,
      },
      objects: [],
      recording: {
        record_display_changes: false,
        record_page_timing: false,
      },
    });

    expect(parsed.recording?.record_display_changes).toBe(false);
    expect(parsed.recording?.record_page_timing).toBe(false);
  });
});
