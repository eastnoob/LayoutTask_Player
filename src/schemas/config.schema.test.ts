import { describe, expect, it } from "vitest";
import {
  backgroundLibrarySchema,
  behaviorSchema,
  objectLibrarySchema,
  taskSchema,
} from "./config.schema";

function createMinimalTask(): any {
  return {
    schema: "layouttask.task.v1",
    task_id: "room01",
    qid: "Q1",
    world: {
      viewBox: { x: 0, y: 0, width: 1000, height: 1000 },
      origin: { x: 0, y: 0 },
      grid: { size: 25, visible: true, snap: true },
    },
    background: { asset: "room_bg", x: 0, y: 0, width: 1000, height: 1000 },
    objects: [
      {
        id: "chair_01",
        asset: "chair_a",
        x: 100,
        y: 100,
        rotation: 0,
        behavior: { template: "drag25_rotate45_limited" },
      },
    ],
  };
}

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

describe("taskSchema world units", () => {
  it("accepts optional world.unit metadata", () => {
    const task = createMinimalTask();
    task.world.unit = "mm";

    expect(taskSchema.parse(task).world.unit).toBe("mm");
  });

  it("rejects unsupported world.unit values", () => {
    const task = createMinimalTask();
    task.world.unit = "inch";

    expect(() => taskSchema.parse(task)).toThrow();
  });
});

describe("asset library intrinsic units", () => {
  it("accepts object and background intrinsic_unit metadata", () => {
    expect(
      objectLibrarySchema.parse({
        schema: "layouttask.assets.objects.v1",
        objects: {
          chair_a: {
            type: "svg",
            src: "assets/objects/chair_a.svg",
            intrinsic_unit: "px",
            default_width: 500,
            default_height: 500,
          },
        },
      }).objects.chair_a.intrinsic_unit,
    ).toBe("px");

    expect(
      backgroundLibrarySchema.parse({
        schema: "layouttask.assets.backgrounds.v1",
        backgrounds: {
          room_001_bg: {
            type: "svg",
            src: "assets/backgrounds/room_001_bg.svg",
            intrinsic_unit: "mm",
          },
        },
      }).backgrounds.room_001_bg.intrinsic_unit,
    ).toBe("mm");
  });
});

describe("taskSchema autosave", () => {
  it("defaults empty autosave to disabled local state-change autosave with restore prompt", () => {
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
      autosave: {},
    });

    expect(parsed.autosave).toEqual({
      enabled: false,
      storage: "localStorage",
      restore_prompt: true,
      save_on: "state_change",
    });
  });

  it("accepts enabled autosave and applies storage prompt and trigger defaults", () => {
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
      autosave: {
        enabled: true,
      },
    });

    expect(parsed.autosave).toEqual({
      enabled: true,
      storage: "localStorage",
      restore_prompt: true,
      save_on: "state_change",
    });
  });
});

describe("taskSchema flow", () => {
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

  it("accepts direct and preview flow modes with defaults", () => {
    expect(
      taskSchema.parse({
        ...baseTask,
        flow: { mode: "direct_reconstruction" },
      }).flow,
    ).toEqual({ mode: "direct_reconstruction" });

    expect(
      taskSchema.parse({
        ...baseTask,
        display_image: { src: "assets/display-images/example.jpeg" },
        flow: { mode: "preview_then_reconstruct" },
      }).flow,
    ).toMatchObject({
      mode: "preview_then_reconstruct",
        config: {
          preview_duration_sec: 10,
          require_preview_ack: true,
          intro_confirm_label: "Start preview",
          stage_during_preview: "hidden",
        show_countdown: true,
      },
    });
  });

  it("requires display_image for preview flow and rejects invalid preview config", () => {
    expect(() =>
      taskSchema.parse({
        ...baseTask,
        flow: { mode: "preview_then_reconstruct" },
      }),
    ).toThrow("preview_then_reconstruct requires display_image.enabled=true");

    expect(() =>
      taskSchema.parse({
        ...baseTask,
        display_image: { src: "assets/display-images/example.jpeg" },
        flow: {
          mode: "preview_then_reconstruct",
          config: {
            preview_duration_sec: 0,
          },
        },
      }),
    ).toThrow();

    expect(() =>
      taskSchema.parse({
        ...baseTask,
        display_image: { src: "assets/display-images/example.jpeg" },
        flow: {
          mode: "preview_then_reconstruct",
          config: {
            stage_during_preview: "visible",
          },
        },
      }),
    ).toThrow();
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

describe("taskSchema collision", () => {
  it("accepts inline collision contain and block areas", () => {
    const task = createMinimalTask();
    task.collision = {
      enabled: true,
      mode: "discrete",
      areas: [
        {
          id: "room_walkable",
          type: "contain",
          shape: "polygon",
          points: [
            { x: 0, y: 0 },
            { x: 1000, y: 0 },
            { x: 1000, y: 1000 },
            { x: 0, y: 1000 },
          ],
        },
        {
          id: "pillar_01",
          type: "block",
          shape: "rect",
          x: 400,
          y: 400,
          width: 100,
          height: 100,
        },
      ],
    };
    task.objects[0].collision = { enabled: true, shape: "box", padding: 0 };

    const parsed = taskSchema.parse(task);

    expect(parsed.collision?.enabled).toBe(true);
    expect(parsed.collision?.areas).toHaveLength(2);
    expect(parsed.objects[0].collision).toEqual({ enabled: true, shape: "box", padding: 0 });
  });

  it("accepts an SVG collision source", () => {
    const task = createMinimalTask();
    task.collision = {
      enabled: true,
      source: {
        type: "svg",
        src: "assets/collision/room_collision.svg",
      },
    };

    expect(taskSchema.parse(task).collision?.source).toEqual({
      type: "svg",
      src: "assets/collision/room_collision.svg",
    });
  });

  it("rejects invalid collision polygons", () => {
    const task = createMinimalTask();
    task.collision = {
      enabled: true,
      areas: [
        {
          id: "bad_poly",
          type: "contain",
          shape: "polygon",
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
        },
      ],
    };

    expect(() => taskSchema.parse(task)).toThrow();
  });
});
