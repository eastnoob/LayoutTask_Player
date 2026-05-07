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
        objects: [{ id: "chair_01", asset: "chair_a", x: 0, y: 0, behavior: "move25" }],
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
    expect(config.messages.confirm_no_edit).toContain("unchanged layout");
    expect(config.requirements).toEqual({});
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
        objects: [{ id: "chair_01", asset: "chair_a", x: 0, y: 0, behavior: "move25" }],
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
        objects: [{ id: "chair_01", asset: "chair_a", x: 0, y: 0, behavior: "move25" }],
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
        objects: [{ id: "chair_01", asset: "chair_a", x: 0, y: 0, behavior: "move25" }],
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
