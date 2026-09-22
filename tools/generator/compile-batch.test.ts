import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileBatchToDirectory } from "./compile-batch";

describe("compileBatchToDirectory", () => {
  it("copies only assets referenced by the compiled runtime package", async () => {
    const root = mkdtempSync(join(tmpdir(), "layout-task-compile-"));
    const source = join(root, "source");
    const out = join(root, "out");
    await mkdir(join(source, "assets", "objects"), { recursive: true });
    await mkdir(join(source, "assets", "backgrounds"), { recursive: true });
    await mkdir(join(source, "assets", "display-images"), { recursive: true });
    await mkdir(join(source, "assets", "collision", "objects"), { recursive: true });
    await mkdir(join(source, "behaviors"), { recursive: true });

    await writeFile(join(source, "assets", "objects", "chair.svg"), "<svg />", "utf8");
    await writeFile(join(source, "assets", "objects", "unused.svg"), "<svg />", "utf8");
    await writeFile(join(source, "assets", "backgrounds", "room.svg"), "<svg />", "utf8");
    await writeFile(join(source, "assets", "display-images", "stimulus.png"), "fake", "utf8");
    await writeFile(join(source, "assets", "collision", "objects", "chair_COLLISION.svg"), "<svg />", "utf8");
    await writeFile(join(source, "assets", "objects.json"), JSON.stringify({
      schema: "layouttask.assets.objects.v1",
      objects: {
        chair: { type: "svg", src: "assets/objects/chair.svg", anchor: "center" },
        unused: { type: "svg", src: "assets/objects/unused.svg", anchor: "center" },
      },
    }), "utf8");
    await writeFile(join(source, "assets", "backgrounds.json"), JSON.stringify({
      schema: "layouttask.assets.backgrounds.v1",
      backgrounds: {
        room: { type: "svg", src: "assets/backgrounds/room.svg" },
      },
    }), "utf8");
    await writeFile(join(source, "behaviors", "behaviors.json"), JSON.stringify({
      schema: "layouttask.behaviors.v1",
      behaviors: {
        move: { movement: { mode: "button", step: 25, max_left: 1 }, free_drag: { enabled: false } },
      },
    }), "utf8");

    const batchPath = join(source, "batch.json");
    await writeFile(batchPath, JSON.stringify({
      schema: "layouttask.batch.v1",
      experiment_id: "copy_assets",
      shared: {
        asset_library: "assets/objects.json",
        background_library: "assets/backgrounds.json",
        behavior_library: "behaviors/behaviors.json",
        world: {
          viewBox: { x: 0, y: 0, width: 500, height: 500 },
          origin: { x: 0, y: 0 },
          grid: { size: 25, visible: true, snap: true },
        },
      },
      trials: [
        {
          qid: "Q1",
          task_id: "room_001",
          background: { asset: "room" },
          display_image: { src: "assets/display-images/stimulus.png" },
          collision: {
            enabled: true,
            mode: "discrete",
            areas: [],
          },
          objects: [
            {
              id: "chair_01",
              asset: "chair",
              x: 100,
              y: 100,
              behavior: { template: "move" },
              collision: {
                enabled: true,
                shape: "asset_outline",
                source: { type: "svg", src: "assets/collision/objects/chair_COLLISION.svg" },
              },
            },
          ],
        },
      ],
    }), "utf8");

    await compileBatchToDirectory({ input: batchPath, out });

    expect(JSON.parse(await readFile(join(out, "manifest.json"), "utf8")).asset_library).toBe("assets/objects.json");
    expect(existsSync(join(out, "assets", "objects.json"))).toBe(true);
    expect(existsSync(join(out, "assets", "backgrounds.json"))).toBe(true);
    expect(existsSync(join(out, "behaviors", "behaviors.json"))).toBe(true);
    expect(existsSync(join(out, "assets", "objects", "chair.svg"))).toBe(true);
    expect(existsSync(join(out, "assets", "objects", "unused.svg"))).toBe(false);
    expect(existsSync(join(out, "assets", "backgrounds", "room.svg"))).toBe(true);
    expect(existsSync(join(out, "assets", "display-images", "stimulus.png"))).toBe(true);
    expect(existsSync(join(out, "assets", "collision", "objects", "chair_COLLISION.svg"))).toBe(true);
  });

  it("compiles protocol examples into self-contained runtime packages", async () => {
    const root = mkdtempSync(join(tmpdir(), "layout-task-protocol-examples-"));
    const examples = [
      {
        input: join(process.cwd(), "protocol", "examples", "minimal-batch.json"),
        out: join(root, "minimal"),
      },
      {
        input: join(process.cwd(), "protocol", "examples", "scoring-example.json"),
        out: join(root, "scoring"),
      },
      {
        input: join(process.cwd(), "protocol", "examples", "full-preview-collision", "batch.json"),
        out: join(root, "full-preview-collision"),
      },
    ];

    for (const example of examples) {
      await compileBatchToDirectory(example);

      expect(existsSync(join(example.out, "manifest.json"))).toBe(true);
      expect(existsSync(join(example.out, "assets", "objects.json"))).toBe(true);
      expect(existsSync(join(example.out, "assets", "backgrounds.json"))).toBe(true);
      expect(existsSync(join(example.out, "behaviors", "behaviors.json"))).toBe(true);
    }
  });
});
