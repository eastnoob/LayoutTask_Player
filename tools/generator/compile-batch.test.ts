import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileBatchToDirectory } from "./compile-batch";
import { readTutorialPackageLock, verifyTutorialPackage } from "../../src/core/tutorial-package-lock";

describe("compileBatchToDirectory", () => {
  it("rejects an invalid reference mode before compiling", async () => {
    const root = mkdtempSync(join(tmpdir(), "layout-task-reference-mode-"));
    const input = join(process.cwd(), "protocol", "examples", "minimal-batch.json");

    await expect(
      compileBatchToDirectory({ input, out: join(root, "out"), referenceMode: "always" as never }),
    ).rejects.toThrow(/reference mode/i);
  });

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

  it("rejects the protected tutorial package as a compiler output root", async () => {
    const root = mkdtempSync(join(tmpdir(), "layout-task-protected-tutorial-"));
    const out = join(root, "public", "layout-task-tutorial");
    const input = join(process.cwd(), "protocol", "examples", "minimal-batch.json");

    await expect(compileBatchToDirectory({ input, out })).rejects.toThrow(/protected tutorial package/i);
    expect(existsSync(join(out, "manifest.json"))).toBe(false);
  });

  it("copies the verified tutorial package into the release output without changing the source", async () => {
    const root = mkdtempSync(join(tmpdir(), "layout-task-tutorial-release-"));
    const source = join(root, "tutorial-source");
    const out = join(root, "release");
    const batchPath = join(process.cwd(), "protocol", "examples", "minimal-batch.json");
    const fixedSource = join(process.cwd(), "public", "layout-task-tutorial");
    await cp(fixedSource, source, { recursive: true });
    const lockBefore = await readFile(join(source, "tutorial-package.lock.json"), "utf8");
    const sourceLock = readTutorialPackageLock(source);
    const sourceSnapshot = new Map<string, string>();
    for (const entry of sourceLock.files) {
      sourceSnapshot.set(entry.path, (await readFile(join(source, entry.path))).toString("base64"));
    }

    await compileBatchToDirectory({ input: batchPath, out, tutorialSourceRoot: source });

    expect(existsSync(join(out, "tutorial", "tutorial-package.lock.json"))).toBe(true);
    const releaseLock = readTutorialPackageLock(join(out, "tutorial"));
    expect(releaseLock.files.length).toBeGreaterThan(0);
    for (const entry of releaseLock.files) {
      expect(existsSync(join(out, "tutorial", entry.path))).toBe(true);
    }
    expect(await readFile(join(source, "tutorial-package.lock.json"), "utf8")).toBe(lockBefore);
    for (const entry of sourceLock.files) {
      expect((await readFile(join(source, entry.path))).toString("base64")).toBe(sourceSnapshot.get(entry.path));
    }

    await rm(source, { recursive: true, force: true });
    expect(() => verifyTutorialPackage(join(out, "tutorial"), out)).not.toThrow();
  });

  it("emits a validated 25-presentation schedule for the real R12 batch", async () => {
    const root = mkdtempSync(join(tmpdir(), "layout-task-r12-schedule-"));
    const out = join(root, "persistent");
    const input = join(process.cwd(), "assets", "generated-experiments", "run_12_core_23", "source", "batch.json");

    await compileBatchToDirectory({ input, out, referenceMode: "persistent" });

    const schedulePath = join(out, "schedule.json");
    const schedule = JSON.parse(await readFile(schedulePath, "utf8")) as {
      uniqueSceneCount: number;
      presentationCount: number;
      baseSequenceCount: number;
      sequences: Array<{ presentations: Array<{ taskId: string }> }>;
    };
    expect(schedule.uniqueSceneCount).toBe(23);
    expect(schedule.presentationCount).toBe(25);
    expect(schedule.baseSequenceCount).toBe(46);
    expect(schedule.sequences.every((sequence) => sequence.presentations)).toBe(true);
    expect(JSON.parse(await readFile(join(out, "tasks", "scene_be84fc97a8d1.json"), "utf8")).display_image.src)
      .toContain("be84fc97a8d1_perspective_stimulus_1920x1080.png");
  });
});
