import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ConfigLoader, resolveRuntimeConfig } from "./config-loader";

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
