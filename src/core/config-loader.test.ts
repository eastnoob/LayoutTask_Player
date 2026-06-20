import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { compileBatch } from "./batch-compiler";
import { ConfigLoader, resolveRuntimeConfig } from "./config-loader";
import type { BatchConfig } from "../types/batch";
import type { TaskCollisionConfig } from "../types/config";

describe("resolveRuntimeConfig display image", () => {
  it("resolves display image paths and default flags", () => {
    const config = resolveRuntimeConfig({
      baseUrl: "http://example.test/layout-task/",
      manifest: {
        schema: "layouttask.manifest.v1",
        experiment_id: "exp1",
        asset_library: "assets/objects.json",
        background_library: "assets/backgrounds.json",
        behavior_library: "behaviors/behaviors.json",
        tasks: [{ qid: "Q1", task_id: "room01", file: "tasks/room01.json" }],
      },
      objectLibrary: {
        schema: "layouttask.assets.objects.v1",
        objects: {
          chair_a: {
            type: "svg",
            src: "assets/objects/chair_a.svg",
            default_width: 50,
            default_height: 50,
          },
        },
      },
      backgroundLibrary: {
        schema: "layouttask.assets.backgrounds.v1",
        backgrounds: {
          room01_bg: {
            type: "svg",
            src: "assets/backgrounds/room01.svg",
          },
        },
      },
      behaviorLibrary: {
        schema: "layouttask.behaviors.v1",
        behaviors: {
          move25: {
            movement: { mode: "button", step: 25 },
            free_drag: { enabled: false },
          },
        },
      },
      task: {
        schema: "layouttask.task.v1",
        task_id: "room01",
        qid: "Q1",
        world: {
          viewBox: { x: -500, y: -500, width: 1000, height: 1000 },
          origin: { x: 0, y: 0 },
          grid: { size: 25, visible: false, snap: true },
        },
        background: { asset: "room01_bg", x: -400, y: -300, width: 800, height: 600 },
        objects: [{ id: "chair_01", asset: "chair_a", x: 0, y: 0, behavior: { template: "move25" } }],
        display_image: {
          src: "assets/display-images/example.jpeg",
        },
      },
    });

    expect(config.displayImage).toMatchObject({
      enabled: true,
      src: "assets/display-images/example.jpeg",
      alt: "Reference image",
      record_metrics: true,
      srcResolved: "http://example.test/layout-task/assets/display-images/example.jpeg",
    });
    expect(config.recording.record_display_changes).toBe(true);
    expect(config.recording.record_page_timing).toBe(true);
    expect(config.dataSave).toEqual({ mode: "copy" });
    expect(config.messages.confirm_no_edit).toContain("unchanged layout");
    expect(config.messages.reconstruction_hint_rotation).toContain("rotate");
    expect(config.requirements).toEqual({});
    expect(config.stage).toEqual({
      fit: "contain",
      max_height_ratio: 0.72,
      padding: 16,
    });
  });

  it("uses manifest.asset_base_url only for static asset URLs", () => {
    const config = resolveRuntimeConfig({
      baseUrl: "http://example.test/layout-task/",
      manifest: {
        schema: "layouttask.manifest.v1",
        experiment_id: "exp1",
        asset_base_url: "https://cdn.example.test/layout-task/",
        asset_library: "assets/objects.json",
        background_library: "assets/backgrounds.json",
        behavior_library: "behaviors/behaviors.json",
        tasks: [{ qid: "Q1", task_id: "room01", file: "tasks/room01.json" }],
      },
      objectLibrary: {
        schema: "layouttask.assets.objects.v1",
        objects: {
          chair_a: {
            type: "svg",
            src: "assets/objects/chair_a.svg",
            default_width: 50,
            default_height: 50,
          },
        },
      },
      backgroundLibrary: {
        schema: "layouttask.assets.backgrounds.v1",
        backgrounds: {
          room01_bg: {
            type: "svg",
            src: "assets/backgrounds/room01.svg",
          },
        },
      },
      behaviorLibrary: {
        schema: "layouttask.behaviors.v1",
        behaviors: {
          move25: {
            movement: { mode: "button", step: 25 },
            free_drag: { enabled: false },
          },
        },
      },
      task: {
        schema: "layouttask.task.v1",
        task_id: "room01",
        qid: "Q1",
        world: {
          viewBox: { x: -500, y: -500, width: 1000, height: 1000 },
          origin: { x: 0, y: 0 },
          grid: { size: 25, visible: false, snap: true },
        },
        background: { asset: "room01_bg", x: -400, y: -300, width: 800, height: 600 },
        objects: [{ id: "chair_01", asset: "chair_a", x: 0, y: 0, behavior: { template: "move25" } }],
        display_image: {
          src: "assets/display-images/example.jpeg",
        },
      },
    });

    expect(config.baseUrl).toBe("http://example.test/layout-task/");
    expect(config.background.asset.srcResolved).toBe("https://cdn.example.test/layout-task/assets/backgrounds/room01.svg");
    expect(config.objects[0].asset.srcResolved).toBe("https://cdn.example.test/layout-task/assets/objects/chair_a.svg");
    expect(config.displayImage?.srcResolved).toBe("https://cdn.example.test/layout-task/assets/display-images/example.jpeg");
  });

  it("resolves messages and min viewport requirements", () => {
    const config = resolveRuntimeConfig({
      baseUrl: "http://example.test/layout-task/",
      manifest: {
        schema: "layouttask.manifest.v1",
        experiment_id: "exp1",
        asset_library: "assets/objects.json",
        background_library: "assets/backgrounds.json",
        behavior_library: "behaviors/behaviors.json",
        tasks: [{ qid: "Q1", task_id: "room01", file: "tasks/room01.json" }],
      },
      objectLibrary: {
        schema: "layouttask.assets.objects.v1",
        objects: {
          chair_a: {
            type: "svg",
            src: "assets/objects/chair_a.svg",
            default_width: 50,
            default_height: 50,
          },
        },
      },
      backgroundLibrary: {
        schema: "layouttask.assets.backgrounds.v1",
        backgrounds: {
          room01_bg: {
            type: "svg",
            src: "assets/backgrounds/room01.svg",
          },
        },
      },
      behaviorLibrary: {
        schema: "layouttask.behaviors.v1",
        behaviors: {
          move25: {
            movement: { mode: "button", step: 25 },
            free_drag: { enabled: false },
          },
        },
      },
      task: {
        schema: "layouttask.task.v1",
        task_id: "room01",
        qid: "Q1",
        world: {
          viewBox: { x: -500, y: -500, width: 1000, height: 1000 },
          origin: { x: 0, y: 0 },
          grid: { size: 25, visible: false, snap: true },
        },
        background: { asset: "room01_bg", x: -400, y: -300, width: 800, height: 600 },
        objects: [{ id: "chair_01", asset: "chair_a", x: 0, y: 0, behavior: { template: "move25" } }],
        messages: {
          confirm_no_edit: "Custom no-edit",
        },
        requirements: {
          min_viewport: {
            width: 1200,
            height: 800,
            message: "Please enlarge your window.",
          },
        },
      },
    });

    expect(config.messages.confirm_no_edit).toBe("Custom no-edit");
    expect(config.messages.confirm_lock_1).toContain("locked");
    expect(config.requirements.min_viewport).toMatchObject({
      width: 1200,
      height: 800,
      mode: "warn",
      message: "Please enlarge your window.",
    });
  });

  it("resolves datapipe data save defaults", () => {
    const config = resolveRuntimeConfig({
      baseUrl: "http://example.test/layout-task/",
      manifest: {
        schema: "layouttask.manifest.v1",
        experiment_id: "exp1",
        asset_library: "assets/objects.json",
        background_library: "assets/backgrounds.json",
        behavior_library: "behaviors/behaviors.json",
        tasks: [{ qid: "Q1", task_id: "room01", file: "tasks/room01.json" }],
      },
      objectLibrary: {
        schema: "layouttask.assets.objects.v1",
        objects: {
          chair_a: {
            type: "svg",
            src: "assets/objects/chair_a.svg",
            default_width: 50,
            default_height: 50,
          },
        },
      },
      backgroundLibrary: {
        schema: "layouttask.assets.backgrounds.v1",
        backgrounds: {
          room01_bg: {
            type: "svg",
            src: "assets/backgrounds/room01.svg",
          },
        },
      },
      behaviorLibrary: {
        schema: "layouttask.behaviors.v1",
        behaviors: {
          move25: {
            movement: { mode: "button", step: 25 },
            free_drag: { enabled: false },
          },
        },
      },
      task: {
        schema: "layouttask.task.v1",
        task_id: "room01",
        qid: "Q1",
        world: {
          viewBox: { x: -500, y: -500, width: 1000, height: 1000 },
          origin: { x: 0, y: 0 },
          grid: { size: 25, visible: false, snap: true },
        },
        background: { asset: "room01_bg", x: -400, y: -300, width: 800, height: 600 },
        objects: [{ id: "chair_01", asset: "chair_a", x: 0, y: 0, behavior: { template: "move25" } }],
        data_save: {
          mode: "datapipe",
          experiment_id: "EXP123",
        },
      },
    });

    expect(config.dataSave).toEqual({
      mode: "datapipe",
      experiment_id: "EXP123",
      endpoint: "https://pipe.jspsych.org/api/data/",
      filename_prefix: "layout-task",
      payload_format: "json-envelope",
      save_encoded: true,
      save_result: true,
    });
  });
});

describe("resolveRuntimeConfig flow", () => {
  it("defaults missing flow to direct reconstruction", () => {
    const config = resolveRuntimeConfig(createBehaviorConfigInput({
      template: "move25",
    }));

    expect(config.flow).toEqual({ mode: "direct_reconstruction" });
  });

  it("resolves preview flow defaults and custom values", () => {
    const input = createBehaviorConfigInput({
      template: "move25",
    });
    input.task.display_image = {
      src: "assets/display-images/example.jpeg",
    };
    input.task.flow = {
      mode: "preview_then_reconstruct",
      config: {
        preview_duration_sec: 7,
        intro_confirm_label: "Begin",
        stage_during_preview: "locked",
        message_before: "Study for {seconds}s.",
      },
    };

    const config = resolveRuntimeConfig(input);

    expect(config.flow).toEqual({
      mode: "preview_then_reconstruct",
      config: {
        preview_duration_sec: 7,
        require_preview_ack: true,
        intro_message:
          "Next, you will have {seconds} seconds to study the image. After the image disappears, reconstruct the scene from memory.",
        intro_confirm_label: "Begin",
        stage_during_preview: "locked",
        show_countdown: true,
        message_before: "Study for {seconds}s.",
        message_after: "Please reconstruct the scene from memory.",
      },
    });
  });

  it("throws a clear error when preview flow has no enabled display image", () => {
    const input = createBehaviorConfigInput({
      template: "move25",
    });
    input.task.flow = {
      mode: "preview_then_reconstruct",
    };

    expect(() => resolveRuntimeConfig(input)).toThrow("preview_then_reconstruct requires display_image.enabled=true");
  });
});

describe("resolveRuntimeConfig SVG viewBox sizing", () => {
  it("uses object SVG viewBox when object and asset dimensions are omitted", () => {
    const input = createBehaviorConfigInput({ template: "move25" });
    const asset = input.objectLibrary.objects.chair_a as any;
    delete asset.default_width;
    delete asset.default_height;
    asset.inlineSvgText = "<svg viewBox=\"10 20 11555 2633\"><rect width=\"11555\" height=\"2633\" /></svg>";

    const config = resolveRuntimeConfig(input);

    expect(config.objects[0].width).toBe(11555);
    expect(config.objects[0].height).toBe(2633);
  });

  it("scales inferred object SVG viewBox dimensions when viewbox_scale is configured", () => {
    const input = createBehaviorConfigInput({ template: "move25" });
    const asset = input.objectLibrary.objects.chair_a as any;
    delete asset.default_width;
    delete asset.default_height;
    asset.viewbox_scale = 40;
    asset.inlineSvgText = "<svg viewBox=\"10 20 11555 2633\"><rect width=\"11555\" height=\"2633\" /></svg>";

    const config = resolveRuntimeConfig(input);

    expect(config.objects[0].width).toBe(462200);
    expect(config.objects[0].height).toBe(105320);
  });

  it("lets object instance dimensions override asset defaults and SVG viewBox", () => {
    const input = createBehaviorConfigInput({ template: "move25" });
    const asset = input.objectLibrary.objects.chair_a as any;
    asset.default_width = 80;
    asset.default_height = 90;
    asset.inlineSvgText = "<svg viewBox=\"0 0 11555 2633\"></svg>";
    input.task.objects[0].width = 120;
    input.task.objects[0].height = 130;

    const config = resolveRuntimeConfig(input);

    expect(config.objects[0].width).toBe(120);
    expect(config.objects[0].height).toBe(130);
  });

  it("lets object asset defaults override SVG viewBox", () => {
    const input = createBehaviorConfigInput({ template: "move25" });
    const asset = input.objectLibrary.objects.chair_a as any;
    asset.default_width = 80;
    asset.default_height = 90;
    asset.inlineSvgText = "<svg viewBox=\"0 0 11555 2633\"></svg>";

    const config = resolveRuntimeConfig(input);

    expect(config.objects[0].width).toBe(80);
    expect(config.objects[0].height).toBe(90);
  });

  it("throws when an SVG object has no explicit dimensions and no valid viewBox", () => {
    const input = createBehaviorConfigInput({ template: "move25" });
    const asset = input.objectLibrary.objects.chair_a as any;
    delete asset.default_width;
    delete asset.default_height;
    asset.inlineSvgText = "<svg><rect width=\"50\" height=\"50\" /></svg>";

    expect(() => resolveRuntimeConfig(input)).toThrow(
      "Object chair_01 asset chair_a requires explicit dimensions or a valid SVG viewBox",
    );
  });

  it("uses background SVG viewBox when explicit placement is omitted", () => {
    const input = createBehaviorConfigInput({ template: "move25" });
    input.task.background = { asset: "room01_bg" };
    (input.backgroundLibrary.backgrounds.room01_bg as any).inlineSvgText =
      "<svg viewBox=\"-1600000 -1200000 3200000 2400000\"></svg>";

    const config = resolveRuntimeConfig(input);

    expect(config.background).toMatchObject({
      x: -1600000,
      y: -1200000,
      width: 3200000,
      height: 2400000,
    });
  });

  it("scales inferred background SVG viewBox placement when viewbox_scale is configured", () => {
    const input = createBehaviorConfigInput({ template: "move25" });
    input.task.background = { asset: "room01_bg" };
    (input.backgroundLibrary.backgrounds.room01_bg as any).viewbox_scale = 40;
    (input.backgroundLibrary.backgrounds.room01_bg as any).inlineSvgText = "<svg viewBox=\"10 20 2519 1031\"></svg>";

    const config = resolveRuntimeConfig(input);

    expect(config.background).toMatchObject({
      x: 400,
      y: 800,
      width: 100760,
      height: 41240,
    });
  });

  it("lets explicit background placement override SVG viewBox", () => {
    const input = createBehaviorConfigInput({ template: "move25" });
    (input.backgroundLibrary.backgrounds.room01_bg as any).inlineSvgText =
      "<svg viewBox=\"-1600000 -1200000 3200000 2400000\"></svg>";

    const config = resolveRuntimeConfig(input);

    expect(config.background).toMatchObject({
      x: -400,
      y: -300,
      width: 800,
      height: 600,
    });
  });

  it("throws when a background has no explicit placement and no valid SVG viewBox", () => {
    const input = createBehaviorConfigInput({ template: "move25" });
    input.task.background = { asset: "room01_bg" };
    (input.backgroundLibrary.backgrounds.room01_bg as any).inlineSvgText = "<svg></svg>";

    expect(() => resolveRuntimeConfig(input)).toThrow(
      "Background asset room01_bg requires explicit placement or a valid SVG viewBox",
    );
  });
});

describe("ConfigLoader SVG viewBox sizing", () => {
  it("fetches SVG assets before resolving omitted object dimensions and background placement", async () => {
    const fetchImpl = createConfigFetch({
      taskBackground: { asset: "room01_bg" },
      objectAssets: {
        chair_a: {
          type: "svg",
          src: "assets/objects/chair_a.svg",
        },
      },
      backgroundAssets: {
        room01_bg: {
          type: "svg",
          src: "assets/backgrounds/room01.svg",
        },
      },
      textByPath: {
        "/layout-task/assets/objects/chair_a.svg":
          "<svg viewBox=\"0 0 11555 2633\"><rect width=\"11555\" height=\"2633\" /></svg>",
        "/layout-task/assets/backgrounds/room01.svg":
          "<svg viewBox=\"-1600000 -1200000 3200000 2400000\"></svg>",
      },
    });
    const loader = new ConfigLoader({
      baseUrl: "http://example.test/layout-task/",
      fetchImpl,
    });

    const config = await loader.loadRuntimeConfig({ taskId: "room01" });

    expect(config.objects[0]).toMatchObject({
      width: 11555,
      height: 2633,
    });
    expect(config.background).toMatchObject({
      x: -1600000,
      y: -1200000,
      width: 3200000,
      height: 2400000,
    });
    expect(config.objects[0].asset.inlineSvgText).toContain("11555");
    expect(config.background.asset.inlineSvgText).toContain("3200000");
  });
});

describe("resolveRuntimeConfig collision", () => {
  it("applies default runtime collision values", () => {
    const config = resolveRuntimeConfig(createBehaviorConfigInput({
      template: "move25",
    }));

    expect(config.collision).toEqual({
      enabled: false,
      mode: "discrete",
      areas: [],
    });
    expect(config.objects[0].collision).toEqual({
      enabled: true,
      shape: "box",
      padding: 0,
    });
  });

  it("does not share default collision areas arrays between runtime configs", () => {
    const first = resolveRuntimeConfig(createBehaviorConfigInput({
      template: "move25",
    }));
    const second = resolveRuntimeConfig(createBehaviorConfigInput({
      template: "move25",
    }));

    expect(first.collision.areas).not.toBe(second.collision.areas);

    first.collision.areas.push({
      id: "parsed_svg_area",
      type: "block",
      shape: "rect",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });

    expect(second.collision.areas).toEqual([]);
  });

  it("merges authored collision values into runtime defaults", () => {
    const input = createBehaviorConfigInput({
      template: "move25",
    });
    input.task.collision = {
      enabled: true,
      areas: [
        {
          id: "walkable",
          type: "contain",
          shape: "rect",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        },
      ],
      source: {
        type: "svg",
        src: "assets/collision/room_collision.svg",
      },
    };
    input.task.objects[0].collision = {
      enabled: false,
      padding: 4,
    };

    const config = resolveRuntimeConfig(input);

    expect(config.collision).toEqual({
      enabled: true,
      mode: "discrete",
      areas: [
        {
          id: "walkable",
          type: "contain",
          shape: "rect",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        },
      ],
      source: {
        type: "svg",
        src: "assets/collision/room_collision.svg",
        srcResolved: "http://example.test/layout-task/assets/collision/room_collision.svg",
      },
    });
    expect(config.objects[0].collision).toEqual({
      enabled: false,
      shape: "box",
      padding: 4,
    });
  });

  it("normalizes authored object asset_outline collision to runtime polygons with a resolved source", () => {
    const input = createBehaviorConfigInput({
      template: "move25",
    });
    input.task.objects[0].collision = {
      enabled: true,
      shape: "asset_outline",
      source: {
        type: "svg",
        src: "assets/collision/chair_outline.svg",
      },
      padding: 3,
    };

    const config = resolveRuntimeConfig(input);

    expect(config.objects[0].collision).toEqual({
      enabled: true,
      shape: "polygons",
      polygons: [],
      padding: 3,
      source: {
        type: "svg",
        src: "assets/collision/chair_outline.svg",
        srcResolved: "http://example.test/layout-task/assets/collision/chair_outline.svg",
      },
    });
  });

  it("deep-copies authored object polygon collision data into runtime config", () => {
    const input = createBehaviorConfigInput({
      template: "move25",
    });
    const authoredPolygons = [
      {
        id: "seat",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
      },
    ];
    input.task.objects[0].collision = {
      shape: "polygons",
      polygons: authoredPolygons,
    };

    const config = resolveRuntimeConfig(input);
    const runtimeCollision = config.objects[0].collision;
    expect(runtimeCollision.shape).toBe("polygons");
    if (runtimeCollision.shape !== "polygons") {
      throw new Error("Expected runtime polygon collision");
    }

    runtimeCollision.polygons[0].id = "mutated";
    runtimeCollision.polygons[0].points[0].x = 99;
    runtimeCollision.polygons[0].points.push({ x: 99, y: 99 });

    expect(authoredPolygons).toEqual([
      {
        id: "seat",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
      },
    ]);
  });
});

describe("ConfigLoader collision runtime config", () => {
  it("resolves inline collision areas and object collision defaults", async () => {
    const loader = new ConfigLoader({
      baseUrl: "http://example.test/layout-task/",
      fetchImpl: createConfigFetch({
        taskCollision: {
          enabled: true,
          areas: [
            {
              id: "inline_contain",
              type: "contain",
              shape: "rect",
              x: 0,
              y: 0,
              width: 100,
              height: 80,
            },
          ],
        },
      }),
    });

    const config = await loader.loadRuntimeConfig({ taskId: "room01" });

    expect(config.collision).toEqual({
      enabled: true,
      mode: "discrete",
      areas: [
        {
          id: "inline_contain",
          type: "contain",
          shape: "rect",
          x: 0,
          y: 0,
          width: 100,
          height: 80,
        },
      ],
    });
    expect(config.objects[0].collision).toEqual({
      enabled: true,
      shape: "box",
      padding: 0,
    });
  });

  it("fetches SVG collision source and appends parsed areas to runtime collision areas", async () => {
    const collisionSvgText = [
      "<svg viewBox=\"0 0 200 200\">",
      "  <rect id=\"svg_block\" data-collision=\"block\" x=\"10\" y=\"20\" width=\"30\" height=\"40\" />",
      "  <polygon id=\"svg_contain\" data-layout-collision=\"contain\" points=\"0,0 20,0 20,20\" />",
      "</svg>",
    ].join("");
    const fetchImpl = createConfigFetch({
      taskCollision: {
        enabled: true,
        areas: [
          {
            id: "inline_block",
            type: "block",
            shape: "rect",
            x: 1,
            y: 2,
            width: 3,
            height: 4,
          },
        ],
        source: {
          type: "svg",
          src: "assets/collision/room_collision.svg",
        },
      },
      textByPath: {
        "/layout-task/assets/collision/room_collision.svg": collisionSvgText,
      },
    });
    const loader = new ConfigLoader({
      baseUrl: "http://example.test/layout-task/",
      fetchImpl,
    });

    const config = await loader.loadRuntimeConfig({ taskId: "room01" });

    expect(fetchImpl).toHaveBeenCalledWith("http://example.test/layout-task/assets/collision/room_collision.svg");
    expect(config.collision.source).toMatchObject({
      type: "svg",
      src: "assets/collision/room_collision.svg",
      srcResolved: "http://example.test/layout-task/assets/collision/room_collision.svg",
      inlineSvgText: collisionSvgText,
    });
    expect(config.collision.areas).toEqual([
      {
        id: "inline_block",
        type: "block",
        shape: "rect",
        x: 1,
        y: 2,
        width: 3,
        height: 4,
      },
      {
        id: "svg_block",
        type: "block",
        shape: "rect",
        x: 10,
        y: 20,
        width: 30,
        height: 40,
      },
      {
        id: "svg_contain",
        type: "contain",
        shape: "polygon",
        points: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 20 },
        ],
      },
    ]);
  });

  it("fetches SVG collision source from manifest asset_base_url", async () => {
    const cdnCollisionSvgText =
      "<svg viewBox=\"0 0 100 100\"><rect id=\"cdn_block\" data-collision=\"block\" x=\"5\" y=\"6\" width=\"7\" height=\"8\" /></svg>";
    const fetchImpl = createConfigFetch({
      manifestAssetBaseUrl: "https://cdn.example.test/layout-task/",
      taskCollision: {
        enabled: true,
        source: {
          type: "svg",
          src: "assets/collision/room_collision.svg",
        },
      },
      textByUrl: {
        "https://cdn.example.test/layout-task/assets/collision/room_collision.svg": cdnCollisionSvgText,
      },
    });
    const loader = new ConfigLoader({
      baseUrl: "http://example.test/layout-task/",
      fetchImpl,
    });

    const config = await loader.loadRuntimeConfig({ taskId: "room01" });

    expect(config.collision.source?.srcResolved).toBe("https://cdn.example.test/layout-task/assets/collision/room_collision.svg");
    expect(fetchImpl).toHaveBeenCalledWith("https://cdn.example.test/layout-task/assets/collision/room_collision.svg");
    expect(fetchImpl).not.toHaveBeenCalledWith("http://example.test/layout-task/assets/collision/room_collision.svg");
    expect(config.collision.source?.inlineSvgText).toBe(cdnCollisionSvgText);
    expect(config.collision.areas).toEqual([
      {
        id: "cdn_block",
        type: "block",
        shape: "rect",
        x: 5,
        y: 6,
        width: 7,
        height: 8,
      },
    ]);
  });

  it("does not fetch or parse disabled collision sources", async () => {
    const fetchImpl = createConfigFetch({
      taskCollision: {
        enabled: false,
        areas: [
          {
            id: "inline_block",
            type: "block",
            shape: "rect",
            x: 1,
            y: 2,
            width: 3,
            height: 4,
          },
        ],
        source: {
          type: "svg",
          src: "assets/collision/room_collision.svg",
        },
      },
      textByPath: {
        "/layout-task/assets/collision/room_collision.svg":
          "<svg viewBox=\"0 0 100 100\"><rect id=\"should_not_parse\" data-collision=\"block\" width=\"10\" height=\"10\" /></svg>",
      },
    });
    const loader = new ConfigLoader({
      baseUrl: "http://example.test/layout-task/",
      fetchImpl,
    });

    const config = await loader.loadRuntimeConfig({ taskId: "room01" });

    expect(fetchImpl).not.toHaveBeenCalledWith("http://example.test/layout-task/assets/collision/room_collision.svg");
    expect(config.collision.source).toMatchObject({
      type: "svg",
      src: "assets/collision/room_collision.svg",
      srcResolved: "http://example.test/layout-task/assets/collision/room_collision.svg",
    });
    expect(config.collision.source?.inlineSvgText).toBeUndefined();
    expect(config.collision.areas).toEqual([
      {
        id: "inline_block",
        type: "block",
        shape: "rect",
        x: 1,
        y: 2,
        width: 3,
        height: 4,
      },
    ]);
  });

  it("fetches each object asset_outline collision source once and fills runtime polygons", async () => {
    const outlineSvgText = [
      "<svg viewBox=\"0 0 50 50\">",
      "  <rect id=\"seat_outline\" x=\"5\" y=\"10\" width=\"20\" height=\"15\" />",
      "</svg>",
    ].join("");
    const colliderSourceUrl = "https://cdn.example.test/layout-task/assets/collision/chair_outline.svg";
    const fetchImpl = createConfigFetch({
      manifestAssetBaseUrl: "https://cdn.example.test/layout-task/",
      taskObjects: [
        {
          id: "chair_01",
          asset: "chair_a",
          x: 0,
          y: 0,
          behavior: { template: "move25" },
          collision: {
            enabled: true,
            shape: "asset_outline",
            source: {
              type: "svg",
              src: "assets/collision/chair_outline.svg",
            },
            padding: 2,
          },
        },
        {
          id: "chair_02",
          asset: "chair_a",
          x: 50,
          y: 0,
          behavior: { template: "move25" },
          collision: {
            enabled: true,
            shape: "asset_outline",
            source: {
              type: "svg",
              src: "assets/collision/chair_outline.svg",
            },
          },
        },
      ],
      textByUrl: {
        [colliderSourceUrl]: outlineSvgText,
      },
    });
    const loader = new ConfigLoader({
      baseUrl: "http://example.test/layout-task/",
      fetchImpl,
    });

    const config = await loader.loadRuntimeConfig({ taskId: "room01" });

    expect(fetchImpl).toHaveBeenCalledWith(colliderSourceUrl);
    expect(fetchImpl).not.toHaveBeenCalledWith("http://example.test/layout-task/assets/collision/chair_outline.svg");
    expect(
      vi.mocked(fetchImpl).mock.calls.filter(
        ([url]) => url === colliderSourceUrl,
      ),
    ).toHaveLength(1);
    expect(config.objects[0].collision).toEqual({
      enabled: true,
      shape: "polygons",
      padding: 2,
      source: {
        type: "svg",
        src: "assets/collision/chair_outline.svg",
        srcResolved: colliderSourceUrl,
        inlineSvgText: outlineSvgText,
      },
      polygons: [
        {
          id: "seat_outline",
          points: [
            { x: 5, y: 10 },
            { x: 25, y: 10 },
            { x: 25, y: 25 },
            { x: 5, y: 25 },
          ],
        },
      ],
    });
    expect(config.objects[1].collision).toMatchObject({
      enabled: true,
      shape: "polygons",
      padding: 0,
      source: {
        inlineSvgText: outlineSvgText,
      },
      polygons: config.objects[0].collision.shape === "polygons" ? config.objects[0].collision.polygons : [],
    });
  });

  it("does not fetch or parse disabled object asset_outline collision sources", async () => {
    const colliderSourceUrl = "https://cdn.example.test/layout-task/assets/collision/invalid_outline.svg";
    const fetchImpl = createConfigFetch({
      manifestAssetBaseUrl: "https://cdn.example.test/layout-task/",
      taskObjects: [
        {
          id: "chair_01",
          asset: "chair_a",
          x: 0,
          y: 0,
          behavior: { template: "move25" },
          collision: {
            enabled: false,
            shape: "asset_outline",
            source: {
              type: "svg",
              src: "assets/collision/invalid_outline.svg",
            },
            padding: 5,
          },
        },
      ],
      textByUrl: {
        [colliderSourceUrl]: "<svg><image href=\"bad.png\" /></svg>",
      },
    });
    const loader = new ConfigLoader({
      baseUrl: "http://example.test/layout-task/",
      fetchImpl,
    });

    const config = await loader.loadRuntimeConfig({ taskId: "room01" });

    expect(fetchImpl).not.toHaveBeenCalledWith(colliderSourceUrl);
    expect(config.objects[0].collision).toEqual({
      enabled: false,
      shape: "polygons",
      polygons: [],
      padding: 5,
      source: {
        type: "svg",
        src: "assets/collision/invalid_outline.svg",
        srcResolved: colliderSourceUrl,
      },
    });
  });
});

describe("ConfigLoader JS module task config", () => {
  it("loads a trusted .config.js task through default export and still validates it", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      const dataByPath: Record<string, unknown> = {
        "/layout-task/manifest.json": {
          schema: "layouttask.manifest.v1",
          experiment_id: "exp1",
          asset_base_url: "https://cdn.example.test/layout-task/",
          asset_library: "assets/objects.json",
          background_library: "assets/backgrounds.json",
          behavior_library: "behaviors/behaviors.json",
          tasks: [{ qid: "Q1", task_id: "room01", file: "tasks/room01.config.js" }],
        },
        "/layout-task/assets/objects.json": {
          schema: "layouttask.assets.objects.v1",
          objects: {
            chair_a: {
              type: "svg",
              src: "assets/objects/chair_a.svg",
              default_width: 50,
              default_height: 50,
            },
          },
        },
        "/layout-task/assets/backgrounds.json": {
          schema: "layouttask.assets.backgrounds.v1",
          backgrounds: {
            room01_bg: {
              type: "svg",
              src: "assets/backgrounds/room01.svg",
            },
          },
        },
        "/layout-task/behaviors/behaviors.json": {
          schema: "layouttask.behaviors.v1",
          behaviors: {
            move25: {
              movement: { mode: "button", step: 25 },
              free_drag: { enabled: false },
            },
          },
        },
      };

      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => dataByPath[path],
        text: async () => "<svg viewBox=\"0 0 50 50\"><rect width=\"50\" height=\"50\" /></svg>",
      } as Response;
    });

    const moduleImportImpl = vi.fn(async () => ({
      default: {
        schema: "layouttask.task.v1",
        task_id: "room01",
        qid: "Q1",
        world: {
          viewBox: { x: -500, y: -500, width: 1000, height: 1000 },
          origin: { x: 0, y: 0 },
          grid: { size: 25, visible: false, snap: true },
        },
        background: { asset: "room01_bg", x: -400, y: -300, width: 800, height: 600 },
        objects: [{ id: "chair_01", asset: "chair_a", x: 0, y: 0, behavior: { template: "move25" } }],
      },
    }));

    const loader = new ConfigLoader({
      baseUrl: "http://example.test/layout-task/",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      moduleImportImpl,
    });

    const config = await loader.loadRuntimeConfig({ taskId: "room01" });

    expect(moduleImportImpl).toHaveBeenCalledWith(
      expect.stringMatching(/^http:\/\/example\.test\/layout-task\/tasks\/room01\.config\.js\?layoutTaskConfigVersion=/),
    );
    expect(fetchImpl).not.toHaveBeenCalledWith(expect.stringContaining("room01.config.js"));
    expect(config.taskId).toBe("room01");
    expect(config.objects[0].asset.srcResolved).toBe("https://cdn.example.test/layout-task/assets/objects/chair_a.svg");
  });
});

describe("ConfigLoader 4000x fixture", () => {
  it("loads the 4000x world-fit task from public config files", async () => {
    const loader = new ConfigLoader({
      baseUrl: "http://example.test/layout-task/",
      fetchImpl: createPublicConfigFetch(),
    });

    const config = await loader.loadRuntimeConfig({ taskId: "room01_x4000_fit_test" });

    expect(config.qid).toBe("QFIT4000");
    expect(config.world.viewBox).toEqual({ x: -2000000, y: -2000000, width: 4000000, height: 4000000 });
    expect(config.world.grid.size).toBe(100000);
    expect(config.background.width).toBe(3200000);
    expect(config.objects[0].asset.inlineSvgText).toContain("viewBox=\"0 0 200000 200000\"");
    expect(config.objects[0]).toMatchObject({
      assetId: "chair_a_x4000",
      width: 200000,
      height: 200000,
      behavior: {
        movement: { mode: "drag", step: 100000 },
        free_drag: { enabled: true, snap: true },
      },
    });
    expect(config.stage).toEqual({
      fit: "contain",
      max_height_ratio: 0.72,
      padding: 16,
    });
  });
});

describe("ConfigLoader collision demo fixture", () => {
  it("loads explicit chair drag limits that reach demo collision targets", async () => {
    const loader = new ConfigLoader({
      baseUrl: "http://example.test/layout-task/",
      fetchImpl: createPublicConfigFetch(),
    });

    const config = await loader.loadRuntimeConfig({ taskId: "room_collision_demo" });
    const chair = config.objects.find((object) => object.id === "chair_01");
    const table = config.objects.find((object) => object.id === "table_01");

    expect(config.qid).toBe("QCOLLISION");
    expect(config.collision.enabled).toBe(true);
    expect(config.collision.areas).toEqual([
      {
        id: "walkable_room",
        type: "contain",
        shape: "rect",
        x: -400,
        y: -300,
        width: 800,
        height: 600,
      },
      {
        id: "center_block",
        type: "block",
        shape: "rect",
        x: -50,
        y: -50,
        width: 100,
        height: 100,
      },
    ]);
    expect(chair?.behaviorTemplateId).toBeUndefined();
    expect(chair?.behavior).toEqual({
      movement: {
        mode: "button",
        step: 25,
        max_left: 12,
        max_right: 20,
        max_up: 12,
        max_down: 12,
      },
      rotation: { step: 45, max_cw: 4, max_ccw: 4 },
      free_drag: { enabled: false },
    });

    expect(chair).toBeDefined();
    expect(table).toBeDefined();
    const chairHalfWidth = (chair?.width ?? 0) / 2;
    const chairHalfHeight = (chair?.height ?? 0) / 2;
    const step = chair?.behavior.movement.step ?? 0;
    const minReachX = (chair?.x ?? 0) - step * (chair?.behavior.movement.max_left ?? 0);
    const maxReachX = (chair?.x ?? 0) + step * (chair?.behavior.movement.max_right ?? 0);
    const minReachY = (chair?.y ?? 0) - step * (chair?.behavior.movement.max_up ?? 0);
    const maxReachY = (chair?.y ?? 0) + step * (chair?.behavior.movement.max_down ?? 0);

    expect(maxReachX).toBeGreaterThanOrEqual(50 + chairHalfWidth);
    expect(maxReachX).toBeGreaterThanOrEqual(table?.x ?? Number.POSITIVE_INFINITY);
    expect(minReachX - chairHalfWidth).toBeLessThan(-400);
    expect(minReachY - chairHalfHeight).toBeLessThan(-300);
    expect(maxReachY + chairHalfHeight).toBeGreaterThan(300);
  });
});

describe("ConfigLoader complete preview collision demo fixture", () => {
  it("loads the preview stimulus, flow, collision layer, and button reconstruction controls", async () => {
    const loader = new ConfigLoader({
      baseUrl: "http://example.test/layout-task/",
      fetchImpl: createPublicConfigFetch(),
    });

    const config = await loader.loadRuntimeConfig({ taskId: "room_collision_preview_demo" });
    const chair = config.objects.find((object) => object.id === "chair_01");

    expect(config.qid).toBe("QCOLLISIONPREVIEW");
    expect(config.displayImage).toMatchObject({
      enabled: true,
      src: "assets/display-images/collision_demo_stimulus.svg",
      srcResolved: "http://example.test/layout-task/assets/display-images/collision_demo_stimulus.svg",
      alt: "Collision demo reference scene",
      record_metrics: true,
    });
    expect(config.flow).toMatchObject({
      mode: "preview_then_reconstruct",
      config: {
        preview_duration_sec: 5,
        require_preview_ack: true,
        stage_during_preview: "hidden",
        show_countdown: true,
      },
    });
    expect(config.collision.enabled).toBe(true);
    expect(config.collision.source).toMatchObject({
      type: "svg",
      src: "assets/collision/room_collision_demo.svg",
      srcResolved: "http://example.test/layout-task/assets/collision/room_collision_demo.svg",
    });
    expect(config.collision.source?.inlineSvgText).toContain("data-collision");
    expect(config.collision.areas.map((area) => area.id)).toEqual(["walkable_room", "center_block"]);
    expect(chair?.behavior.movement.mode).toBe("button");
    expect(chair?.behavior.free_drag.enabled).toBe(false);
    expect(config.recording.record_blocked_events).toBe(true);
  });
});

describe("ConfigLoader protocol full-preview-collision fixture", () => {
  it("resolves the example object collider SVG to runtime polygons", async () => {
    const protocolRoot = join(process.cwd(), "protocol", "examples", "full-preview-collision");
    const batch = JSON.parse(await readFile(join(protocolRoot, "batch.json"), "utf8")) as BatchConfig;
    const objectLibrary = JSON.parse(
      await readFile(join(protocolRoot, batch.shared.asset_library), "utf8"),
    ) as unknown;
    const backgroundLibrary = JSON.parse(
      await readFile(join(protocolRoot, batch.shared.background_library), "utf8"),
    ) as unknown;
    const compiled = compileBatch(batch);
    const task = compiled.tasks[0];
    const fetchImpl = vi.fn(async (url: string) => {
      const relativePath = new URL(url).pathname.replace(/^\/layout-task\//, "");
      const jsonByPath: Record<string, unknown> = {
        "manifest.json": compiled.manifest,
        [task.file]: task.config,
        [batch.shared.asset_library]: objectLibrary,
        [batch.shared.background_library]: backgroundLibrary,
        [batch.shared.behavior_library]: {
          schema: "layouttask.behaviors.v1",
          behaviors: {},
        },
      };
      const jsonData = jsonByPath[relativePath];
      const body =
        jsonData === undefined
          ? await readFile(join(protocolRoot, relativePath), "utf8")
          : JSON.stringify(jsonData);

      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => JSON.parse(body),
        text: async () => body,
      } as Response;
    });
    const loader = new ConfigLoader({
      baseUrl: "http://example.test/layout-task/",
      fetchImpl,
    });

    const config = await loader.loadRuntimeConfig({ taskId: "full_preview_collision_001" });
    const chair = config.objects.find((object) => object.id === "chair_01");

    expect(chair?.collision).toMatchObject({
      enabled: true,
      shape: "polygons",
      padding: 0,
      source: {
        type: "svg",
        src: "assets/collision/objects/full_chair_COLLISION.svg",
        srcResolved: "http://example.test/layout-task/assets/collision/objects/full_chair_COLLISION.svg",
      },
      polygons: [
        {
          id: "chair_solid",
          points: [
            { x: -20, y: -20 },
            { x: 20, y: -20 },
            { x: 20, y: 20 },
            { x: -20, y: 20 },
          ],
        },
      ],
    });
    expect(chair?.collision.shape === "polygons" ? chair.collision.source?.inlineSvgText : "").toContain(
      'id="chair_solid"',
    );
  });
});

describe("resolveRuntimeConfig object behavior", () => {
  it("resolves template-only behavior", () => {
    const config = resolveRuntimeConfig(createBehaviorConfigInput({
      template: "move25",
    }));

    expect(config.objects[0].behaviorTemplateId).toBe("move25");
    expect(config.objects[0].behavior).toMatchObject({
      movement: { mode: "button", step: 25, max_left: 2 },
      free_drag: { enabled: false },
    });
  });

  it("merges object behavior config over a template", () => {
    const config = resolveRuntimeConfig(createBehaviorConfigInput({
      template: "move25",
      config: {
        movement: { max_left: 1, max_right: 3 },
        rotation: { step: 90, max_cw: 1 },
      },
    }));

    expect(config.objects[0].behavior).toMatchObject({
      movement: { mode: "button", step: 25, max_left: 1, max_right: 3 },
      rotation: { step: 90, max_cw: 1 },
      free_drag: { enabled: false },
    });
  });

  it("resolves config-only behavior when the object provides a complete behavior", () => {
    const config = resolveRuntimeConfig(createBehaviorConfigInput({
      config: {
        movement: { mode: "drag", step: 25, max_left: 4, max_right: 4 },
        rotation: { step: 45, max_cw: 2, max_ccw: 2 },
        free_drag: { enabled: true, snap: true },
      },
    }));

    expect(config.objects[0].behaviorTemplateId).toBeUndefined();
    expect(config.objects[0].behavior.movement.mode).toBe("drag");
    expect(config.objects[0].behavior.free_drag.enabled).toBe(true);
  });

  it("throws a clear error for an unknown behavior template", () => {
    expect(() =>
      resolveRuntimeConfig(createBehaviorConfigInput({
        template: "missing_behavior",
      })),
    ).toThrow("Unknown behavior template: missing_behavior");
  });
});

function createBehaviorConfigInput(behavior: Parameters<typeof resolveRuntimeConfig>[0]["task"]["objects"][number]["behavior"]): Parameters<typeof resolveRuntimeConfig>[0] {
  return {
    baseUrl: "http://example.test/layout-task/",
    manifest: {
      schema: "layouttask.manifest.v1",
      experiment_id: "exp1",
      asset_library: "assets/objects.json",
      background_library: "assets/backgrounds.json",
      behavior_library: "behaviors/behaviors.json",
      tasks: [{ qid: "Q1", task_id: "room01", file: "tasks/room01.json" }],
    },
    objectLibrary: {
      schema: "layouttask.assets.objects.v1",
      objects: {
        chair_a: {
          type: "svg",
          src: "assets/objects/chair_a.svg",
          default_width: 50,
          default_height: 50,
        },
      },
    },
    backgroundLibrary: {
      schema: "layouttask.assets.backgrounds.v1",
      backgrounds: {
        room01_bg: {
          type: "svg",
          src: "assets/backgrounds/room01.svg",
        },
      },
    },
    behaviorLibrary: {
      schema: "layouttask.behaviors.v1",
      behaviors: {
        move25: {
          movement: { mode: "button", step: 25, max_left: 2, max_right: 2 },
          free_drag: { enabled: false },
        },
      },
    },
    task: {
      schema: "layouttask.task.v1",
      task_id: "room01",
      qid: "Q1",
      world: {
        viewBox: { x: -500, y: -500, width: 1000, height: 1000 },
        origin: { x: 0, y: 0 },
        grid: { size: 25, visible: false, snap: true },
      },
      background: { asset: "room01_bg", x: -400, y: -300, width: 800, height: 600 },
      objects: [{ id: "chair_01", asset: "chair_a", x: 0, y: 0, behavior }],
    },
  };
}

function createConfigFetch(options: {
  manifestAssetBaseUrl?: string;
  taskCollision?: TaskCollisionConfig;
  taskBackground?: Parameters<typeof resolveRuntimeConfig>[0]["task"]["background"];
  taskObjects?: Parameters<typeof resolveRuntimeConfig>[0]["task"]["objects"];
  objectAssets?: Record<string, unknown>;
  backgroundAssets?: Record<string, unknown>;
  textByPath?: Record<string, string>;
  textByUrl?: Record<string, string>;
}): typeof fetch {
  return vi.fn(async (url: string) => {
    const path = new URL(url).pathname;
    const dataByPath: Record<string, unknown> = {
      "/layout-task/manifest.json": {
        schema: "layouttask.manifest.v1",
        experiment_id: "exp1",
        asset_base_url: options.manifestAssetBaseUrl,
        asset_library: "assets/objects.json",
        background_library: "assets/backgrounds.json",
        behavior_library: "behaviors/behaviors.json",
        tasks: [{ qid: "Q1", task_id: "room01", file: "tasks/room01.json" }],
      },
      "/layout-task/tasks/room01.json": {
        schema: "layouttask.task.v1",
        task_id: "room01",
        qid: "Q1",
        world: {
          viewBox: { x: -500, y: -500, width: 1000, height: 1000 },
          origin: { x: 0, y: 0 },
          grid: { size: 25, visible: false, snap: true },
        },
        background: options.taskBackground ?? { asset: "room01_bg", x: -400, y: -300, width: 800, height: 600 },
        objects: options.taskObjects ?? [{ id: "chair_01", asset: "chair_a", x: 0, y: 0, behavior: { template: "move25" } }],
        collision: options.taskCollision,
      },
      "/layout-task/assets/objects.json": {
        schema: "layouttask.assets.objects.v1",
        objects: options.objectAssets ?? {
          chair_a: {
            type: "svg",
            src: "assets/objects/chair_a.svg",
            default_width: 50,
            default_height: 50,
          },
        },
      },
      "/layout-task/assets/backgrounds.json": {
        schema: "layouttask.assets.backgrounds.v1",
        backgrounds: options.backgroundAssets ?? {
          room01_bg: {
            type: "svg",
            src: "assets/backgrounds/room01.svg",
          },
        },
      },
      "/layout-task/behaviors/behaviors.json": {
        schema: "layouttask.behaviors.v1",
        behaviors: {
          move25: {
            movement: { mode: "button", step: 25 },
            free_drag: { enabled: false },
          },
        },
      },
    };
    const text = options.textByUrl?.[url] ?? options.textByPath?.[path] ?? "<svg viewBox=\"0 0 50 50\"><rect width=\"50\" height=\"50\" /></svg>";
    const jsonData = dataByPath[path];

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => jsonData,
      text: async () => text,
    } as Response;
  }) as unknown as typeof fetch;
}

function createPublicConfigFetch(): typeof fetch {
  return (async (url: string) => {
    const path = new URL(url).pathname.replace(/^\/layout-task\//, "");
    const filePath = join(process.cwd(), "public", "layout-task", path);
    const body = await readFile(filePath, "utf8");

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => JSON.parse(body),
      text: async () => body,
    } as Response;
  }) as typeof fetch;
}
