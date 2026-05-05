import { describe, expect, it } from "vitest";
import { resolveRuntimeConfig } from "./config-loader";

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
  });
});
