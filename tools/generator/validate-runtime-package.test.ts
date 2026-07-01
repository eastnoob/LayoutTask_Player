import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateRuntimePackage } from "./validate-runtime-package";

const tmpRoot = join(process.cwd(), ".tmp", "validate-runtime-package-test");

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(filePath: string, value: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
}

async function createPackage(root: string, collisionSource: string): Promise<void> {
  await writeJson(join(root, "manifest.json"), {
    schema: "layouttask.manifest.v1",
    experiment_id: "preflight_test",
    asset_library: "assets/objects.json",
    background_library: "assets/backgrounds.json",
    behavior_library: "behaviors/behaviors.json",
    tasks: [{ qid: "Q1", task_id: "scene_001", file: "tasks/scene_001.json" }],
  });
  await writeJson(join(root, "assets/objects.json"), {
    schema: "layouttask.assets.objects.v1",
    objects: {
      context_asset: { type: "svg", src: "assets/objects/context.svg", default_width: 100, default_height: 100 },
      variable_asset: { type: "svg", src: "assets/objects/variable.svg", default_width: 20, default_height: 20 },
    },
  });
  await writeJson(join(root, "assets/backgrounds.json"), {
    schema: "layouttask.assets.backgrounds.v1",
    backgrounds: {
      room: { type: "svg", src: "assets/backgrounds/room.svg" },
    },
  });
  await writeJson(join(root, "behaviors/behaviors.json"), {
    schema: "layouttask.behaviors.v1",
    behaviors: {
      button10: {
        movement: { mode: "button", step: 10, max_left: 2, max_right: 2, max_up: 2, max_down: 2 },
        rotation: { step: 45, max_cw: 2, max_ccw: 2 },
        free_drag: { enabled: false },
      },
    },
  });
  await writeJson(join(root, "tasks/scene_001.json"), {
    schema: "layouttask.task.v1",
    task_id: "scene_001",
    qid: "Q1",
    world: {
      unit: "mm",
      viewBox: { x: 0, y: 0, width: 500, height: 500 },
      origin: { x: 0, y: 0 },
      grid: { size: 10, visible: true, snap: true },
    },
    background: { asset: "room", x: 0, y: 0, width: 500, height: 500 },
    collision: { enabled: true, mode: "discrete", areas: [] },
    objects: [
      {
        id: "context_01",
        role: "fixed",
        asset: "context_asset",
        x: 100,
        y: 100,
        behavior: { config: { movement: { mode: "none" }, free_drag: { enabled: false } } },
        collision: { enabled: true, shape: "asset_outline", source: { type: "svg", src: collisionSource } },
      },
      {
        id: "variable_01",
        role: "variable",
        asset: "variable_asset",
        x: 100,
        y: 100,
        behavior: { template: "button10" },
        collision: { enabled: true, shape: "box", padding: 0 },
        target: { relative: { dx_steps: 1, dy_steps: 0, rotation_steps: 0 } },
      },
    ],
  });
  await writeText(join(root, "assets/objects/context.svg"), '<svg viewBox="0 0 100 100"><rect width="100" height="100"/></svg>');
  await writeText(join(root, "assets/objects/variable.svg"), '<svg viewBox="0 0 20 20"><rect width="20" height="20"/></svg>');
  await writeText(join(root, "assets/backgrounds/room.svg"), '<svg viewBox="0 0 500 500"><rect width="500" height="500"/></svg>');
  await writeJson(join(root, "scoring/scoring-reference.json"), {
    schema: "layouttask.scoring-reference.v1",
    experiment_id: "preflight_test",
    tasks: {
      scene_001: {
        qid: "Q1",
        objects: {
          variable_01: {
            role: "variable",
            target: { relative: { dx_steps: 1, dy_steps: 0, rotation_steps: 0 } },
          },
        },
      },
    },
  });
}

describe("validateRuntimePackage", () => {
  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("passes a package whose variable initial pose does not collide", async ({ task }) => {
    const packageRoot = join(tmpRoot, task.id, "healthy");
    await createPackage(packageRoot, "assets/collision/objects/context_COLLISION.svg");
    await writeText(
      join(packageRoot, "assets/collision/objects/context_COLLISION.svg"),
      '<svg viewBox="0 0 100 100"><rect x="0" y="0" width="20" height="20"/></svg>',
    );

    const report = await validateRuntimePackage({ baseDir: packageRoot, checkTargets: true });

    expect(report.ok).toBe(true);
    expect(report.failures).toEqual([]);
    expect(report.taskCount).toBe(1);
    expect(report.variableCount).toBe(1);
  });

  it("reports variable initial collisions with object ids", async ({ task }) => {
    const packageRoot = join(tmpRoot, task.id, "colliding");
    await createPackage(packageRoot, "assets/collision/objects/context_COLLISION.svg");
    await writeText(
      join(packageRoot, "assets/collision/objects/context_COLLISION.svg"),
      '<svg viewBox="0 0 100 100"><rect x="40" y="40" width="20" height="20"/></svg>',
    );

    const report = await validateRuntimePackage({ baseDir: packageRoot, checkTargets: false });

    expect(report.ok).toBe(false);
    expect(report.failures).toContainEqual({
      type: "initial_collision",
      task_id: "scene_001",
      object_id: "variable_01",
      reason: "object",
      collided_with: "context_01",
    });
  });

  it("reports target collisions from the scoring reference when requested", async ({ task }) => {
    const packageRoot = join(tmpRoot, task.id, "target-colliding");
    await createPackage(packageRoot, "assets/collision/objects/context_COLLISION.svg");
    await writeText(
      join(packageRoot, "assets/collision/objects/context_COLLISION.svg"),
      '<svg viewBox="0 0 100 100"><rect x="60" y="40" width="20" height="20"/></svg>',
    );

    const report = await validateRuntimePackage({ baseDir: packageRoot, checkTargets: true });

    expect(report.ok).toBe(false);
    expect(report.failures).toContainEqual({
      type: "target_collision",
      task_id: "scene_001",
      object_id: "variable_01",
      reason: "object",
      collided_with: "context_01",
    });
  });
});
