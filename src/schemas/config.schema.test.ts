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
        grid: { size: 25, origin: { x: 10, y: 5 } },
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

    expect(parsed.world.grid.origin).toEqual({ x: 10, y: 5 });
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

describe("taskSchema release hardening fields", () => {
  it("accepts messages and min viewport requirements", () => {
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
      messages: {
        confirm_no_edit: "Custom no-edit message",
      },
      requirements: {
        min_viewport: {
          width: 1024,
          height: 720,
        },
      },
    });

    expect(parsed.messages?.confirm_no_edit).toBe("Custom no-edit message");
    expect(parsed.requirements?.min_viewport).toMatchObject({
      width: 1024,
      height: 720,
      mode: "warn",
    });
  });
});

describe("taskSchema stage", () => {
  it("accepts contain stage fit and applies defaults", () => {
    const parsed = taskSchema.parse({
      schema: "layouttask.task.v1",
      task_id: "room01",
      qid: "Q1",
      world: {
        viewBox: { x: 0, y: 0, width: 3200000, height: 2400000 },
        origin: { x: 0, y: 0 },
        grid: { size: 100000 },
      },
      background: {
        asset: "room01_bg_x4000",
        x: 0,
        y: 0,
        width: 3200000,
        height: 2400000,
      },
      objects: [],
      stage: {
        fit: "contain",
      },
    });

    expect(parsed.stage).toEqual({
      fit: "contain",
      max_height_ratio: 0.72,
      padding: 16,
    });
  });
});

describe("taskSchema data_save", () => {
  it("accepts copy mode by default and requires experiment_id for datapipe", () => {
    const baseTask = {
      schema: "layouttask.task.v1" as const,
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
    };

    expect(taskSchema.parse(baseTask).data_save).toBeUndefined();
    expect(() =>
      taskSchema.parse({
        ...baseTask,
        data_save: {
          mode: "datapipe",
        },
      }),
    ).toThrow();

    expect(
      taskSchema.parse({
        ...baseTask,
        data_save: {
          mode: "datapipe",
          experiment_id: "EXP123",
          payload_format: "csv-row",
        },
      }).data_save,
    ).toMatchObject({
      mode: "datapipe",
      experiment_id: "EXP123",
      payload_format: "csv-row",
    });
  });
});

describe("taskSchema object behavior", () => {
  const baseObject = {
    id: "chair_01",
    asset: "chair_a",
    x: 0,
    y: 0,
  };

  const baseTask = {
    schema: "layouttask.task.v1" as const,
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
  };

  it("accepts template-only, template-plus-config, and config-only behavior objects", () => {
    expect(
      taskSchema.parse({
        ...baseTask,
        objects: [{ ...baseObject, behavior: { template: "move25" } }],
      }).objects[0].behavior,
    ).toEqual({ template: "move25" });

    expect(
      taskSchema.parse({
        ...baseTask,
        objects: [
          {
            ...baseObject,
            behavior: {
              template: "move25",
              config: { movement: { max_left: 1 } },
            },
          },
        ],
      }).objects[0].behavior,
    ).toMatchObject({
      template: "move25",
      config: { movement: { max_left: 1 } },
    });

    expect(
      taskSchema.parse({
        ...baseTask,
        objects: [
          {
            ...baseObject,
            behavior: {
              config: {
                movement: { mode: "button", step: 25 },
                free_drag: { enabled: false },
              },
            },
          },
        ],
      }).objects[0].behavior,
    ).toMatchObject({
      config: {
        movement: { mode: "button", step: 25 },
        free_drag: { enabled: false },
      },
    });
  });

  it("rejects legacy string behavior and empty behavior objects", () => {
    expect(() =>
      taskSchema.parse({
        ...baseTask,
        objects: [{ ...baseObject, behavior: "move25" }],
      }),
    ).toThrow();

    expect(() =>
      taskSchema.parse({
        ...baseTask,
        objects: [{ ...baseObject, behavior: {} }],
      }),
    ).toThrow("behavior requires template or config");
  });
});
