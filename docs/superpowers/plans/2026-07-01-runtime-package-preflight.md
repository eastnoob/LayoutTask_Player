# Runtime Package Preflight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small runtime package validator that catches missing assets and illegal variable/context collider overlaps before a generated package is deployed.

**Architecture:** Reuse the existing `ConfigLoader`, `evaluateCollision`, and batch/package conventions. Do not change runtime collision semantics: `group_id` remains analysis-only, and any positive candidate overlap blocks movement.

**Tech Stack:** TypeScript, Node `fs/promises`, existing Vitest tests, existing `pixi` / npm task style.

---

## File Structure

- Create: `tools/generator/validate-runtime-package.ts`
  - CLI for checking a deployable Player `base` directory.
  - Loads every manifest task through `ConfigLoader`.
  - Reports missing/unreadable assets, collider parse failures, variable initial collisions, and optional target collisions.
- Create: `tools/generator/validate-runtime-package.test.ts`
  - Tests the CLI helper logic through exported functions, not shell snapshots.
  - Uses tiny temp package fixtures created inside the test.
- Modify: `pixi.toml`
  - Add `validate-runtime-package = "npm exec tsx -- tools/generator/validate-runtime-package.ts"`.
- Modify: `protocol/rhino.md`
  - Clarify object collider `<use>` rules.
  - Add runtime package preflight command to validation workflow.
- Modify: `protocol/player-ingestion.md`
  - Add preflight between compile and browser open.
  - State that `validate-batch` does not inspect SVG geometry.
- Modify: `protocol/templates/rhino-export-checklist.md`
  - Add object collider sidecar checks and preflight.
- Modify: `protocol/templates/rhino-asset-package-template.md`
  - Align `<use>` wording with runtime behavior.

---

### Task 1: Runtime Package Validator Tests

**Files:**
- Create: `tools/generator/validate-runtime-package.test.ts`

- [ ] **Step 1: Write tests for healthy and colliding packages**

Create `tools/generator/validate-runtime-package.test.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateRuntimePackage } from "./validate-runtime-package";

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(path: string, value: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, value, "utf8");
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
}

describe("validateRuntimePackage", () => {
  it("passes a package whose variable initial pose does not collide", async ({ task }) => {
    const root = join(task.meta.name.replace(/[^a-z0-9_-]/gi, "_"), "healthy");
    const packageRoot = join(process.cwd(), ".tmp", "validate-runtime-package-test", root);
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
    const root = join(task.meta.name.replace(/[^a-z0-9_-]/gi, "_"), "colliding");
    const packageRoot = join(process.cwd(), ".tmp", "validate-runtime-package-test", root);
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tools/generator/validate-runtime-package.test.ts
```

Expected: FAIL because `tools/generator/validate-runtime-package.ts` does not exist.

---

### Task 2: Runtime Package Validator Implementation

**Files:**
- Create: `tools/generator/validate-runtime-package.ts`

- [ ] **Step 1: Implement the minimal validator**

Create `tools/generator/validate-runtime-package.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ConfigLoader } from "../../src/core/config-loader";
import { evaluateCollision } from "../../src/core/collision-geometry";
import type { CollisionResult } from "../../src/core/collision-geometry";
import type { ObjectPose } from "../../src/types/events";
import type { ManifestConfig } from "../../src/types/config";

export type RuntimePackageFailure =
  | {
      type: "load_error";
      task_id?: string;
      message: string;
    }
  | {
      type: "initial_collision" | "target_collision";
      task_id: string;
      object_id: string;
      reason: CollisionResult extends { ok: false; reason: infer R } ? R : never;
      collided_with?: string;
    };

export interface RuntimePackageReport {
  ok: boolean;
  baseDir: string;
  taskCount: number;
  variableCount: number;
  failures: RuntimePackageFailure[];
}

export interface ValidateRuntimePackageOptions {
  baseDir: string;
  checkTargets?: boolean;
}

interface CliArgs {
  base?: string;
  checkTargets: boolean;
}

const usage = `Usage: tsx tools/generator/validate-runtime-package.ts --base <compiled-base-dir> [--check-targets]
       tsx tools/generator/validate-runtime-package.ts <compiled-base-dir> [--check-targets]`;

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function parseArgs(args: string[]): CliArgs {
  const parsed: CliArgs = { checkTargets: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--base") {
      parsed.base = requireValue(args, index, "--base");
      index += 1;
      continue;
    }
    if (arg.startsWith("--base=")) {
      parsed.base = arg.slice("--base=".length);
      continue;
    }
    if (arg === "--check-targets") {
      parsed.checkTargets = true;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (!parsed.base) {
      parsed.base = arg;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }
  return parsed;
}

function failureFromCollision(
  type: "initial_collision" | "target_collision",
  taskId: string,
  objectId: string,
  result: Exclude<CollisionResult, { ok: true }>,
): RuntimePackageFailure {
  return {
    type,
    task_id: taskId,
    object_id: objectId,
    reason: result.reason,
    collided_with: result.reason === "object" ? result.objectId : result.areaId,
  };
}

function targetPoseFromRelative(object: { x: number; y: number; rotation: number; behavior: any; target?: any }, gridSize: number): ObjectPose | undefined {
  const relative = object.target?.relative;
  if (!relative) {
    return undefined;
  }
  const moveStep = object.behavior.movement.step ?? gridSize;
  const rotationStep = object.behavior.rotation?.step ?? 45;
  return {
    x: object.x + relative.dx_steps * moveStep,
    y: object.y + relative.dy_steps * moveStep,
    r: object.rotation + relative.rotation_steps * rotationStep,
  };
}

export async function validateRuntimePackage(options: ValidateRuntimePackageOptions): Promise<RuntimePackageReport> {
  const baseDir = path.resolve(options.baseDir);
  const baseUrl = pathToFileURL(`${baseDir}${path.sep}`).href;
  const failures: RuntimePackageFailure[] = [];
  let taskCount = 0;
  let variableCount = 0;

  const fetchImpl = (async (url: string) => {
    const fileUrl = new URL(url);
    const relativePath = decodeURIComponent(fileUrl.pathname).replace(/^\/?[A-Za-z]:\//, "");
    const basePath = path.resolve(baseDir);
    const target = path.resolve(baseDir, path.relative(basePath, path.resolve(fileUrl.pathname)));
    const windowsTarget = process.platform === "win32" ? fileUrl.pathname.replace(/^\/([A-Za-z]:\/)/, "$1") : target;
    const body = await readFile(windowsTarget || relativePath, "utf8");
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => JSON.parse(body),
      text: async () => body,
    } as Response;
  }) as typeof fetch;

  let manifest: ManifestConfig;
  try {
    const rawManifest = await readFile(path.join(baseDir, "manifest.json"), "utf8");
    manifest = JSON.parse(rawManifest) as ManifestConfig;
  } catch (error) {
    failures.push({ type: "load_error", message: error instanceof Error ? error.message : String(error) });
    return { ok: false, baseDir, taskCount, variableCount, failures };
  }

  const loader = new ConfigLoader({ baseUrl, fetchImpl });
  taskCount = manifest.tasks.length;

  for (const task of manifest.tasks) {
    try {
      const config = await loader.loadRuntimeConfig({ taskId: task.task_id });
      for (const object of config.objects.filter((item) => item.role === "variable")) {
        variableCount += 1;
        const initial = evaluateCollision({
          movingObject: object,
          candidatePose: { x: object.x, y: object.y, r: object.rotation },
          objects: config.objects,
          areas: config.collision.areas,
          worldViewBox: config.world.viewBox,
        });
        if (!initial.ok) {
          failures.push(failureFromCollision("initial_collision", config.taskId, object.id, initial));
        }
        if (options.checkTargets) {
          const targetPose = targetPoseFromRelative(object, config.world.grid.size);
          if (targetPose) {
            const target = evaluateCollision({
              movingObject: object,
              candidatePose: targetPose,
              objects: config.objects,
              areas: config.collision.areas,
              worldViewBox: config.world.viewBox,
            });
            if (!target.ok) {
              failures.push(failureFromCollision("target_collision", config.taskId, object.id, target));
            }
          }
        }
      }
    } catch (error) {
      failures.push({
        type: "load_error",
        task_id: task.task_id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ok: failures.length === 0,
    baseDir,
    taskCount,
    variableCount,
    failures,
  };
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  if (!args.base) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  const report = await validateRuntimePackage({ baseDir: args.base, checkTargets: args.checkTargets });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  await main();
}
```

- [ ] **Step 2: Simplify the local fetch path if tests reveal Windows path issues**

If the first implementation fails because file URL conversion is wrong, replace the `fetchImpl` body with:

```ts
const fetchImpl = (async (url: string) => {
  const fileUrl = new URL(url);
  const pathname = decodeURIComponent(fileUrl.pathname);
  const absolutePath = process.platform === "win32" ? pathname.replace(/^\/([A-Za-z]:\/)/, "$1") : pathname;
  const body = await readFile(absolutePath, "utf8");
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => JSON.parse(body),
    text: async () => body,
  } as Response;
}) as typeof fetch;
```

- [ ] **Step 3: Run targeted tests**

Run:

```bash
npm test -- tools/generator/validate-runtime-package.test.ts
```

Expected: PASS.

---

### Task 3: Pixi Task

**Files:**
- Modify: `pixi.toml`

- [ ] **Step 1: Add the task**

In `[tasks]`, add:

```toml
validate-runtime-package = "npm exec tsx -- tools/generator/validate-runtime-package.ts"
```

- [ ] **Step 2: Run the task on a known colliding generated package**

Run:

```bash
pixi run validate-runtime-package --base public/layout-task-generated-sg-output-2-collider-preserve-size
```

Expected: non-zero exit and JSON failures containing `initial_collision`.

- [ ] **Step 3: Run the task on the healthy test package through npm**

Run:

```bash
npm test -- tools/generator/validate-runtime-package.test.ts
```

Expected: PASS.

---

### Task 4: Documentation Updates

**Files:**
- Modify: `protocol/rhino.md`
- Modify: `protocol/player-ingestion.md`
- Modify: `protocol/templates/rhino-export-checklist.md`
- Modify: `protocol/templates/rhino-asset-package-template.md`

- [ ] **Step 1: Update object collider `<use>` wording in `protocol/rhino.md`**

Replace the current object collider support paragraph with:

```md
Supported object collider geometry:

- filled `rect` without rounded corners
- filled `polygon`
- filled closed `path` using `M`, `L`, `H`, `V`, `C`, `S`, `Q`, `T`, and `Z`; curves are flattened into polygons
- sized `<use>` references only when the referenced footprint is intentionally a solid rectangular collider
- `matrix`, `translate`, `scale`, and `rotate` transforms

Avoid image-backed `<use>` from Rhino/SVG exports unless the whole referenced rectangle
is intentionally solid. The Player treats a sized `<use>` as a rectangular collider
and does not inspect raster transparency.

Do not use:

- standalone `<image>` as geometry
- visual artwork, screenshots, or raster remnants as collider geometry
- `mask`, `clipPath`, or `filter`
- rounded `rect` (`rx`/`ry`)
- stroke-only lines as collision solids
```

- [ ] **Step 2: Add preflight command in `protocol/rhino.md` validation section**

After the `compile-batch` command, add:

```md
Then run runtime package preflight:

```bash
pixi run validate-runtime-package --base public/layout-task-generated --check-targets
```

`validate-batch` checks JSON structure and cross-record semantics. It does not
load SVG assets or evaluate collider geometry. `validate-runtime-package` loads
the deployable base through the same `ConfigLoader` used by the browser and
checks variable initial poses and optional target poses against collision.
```

- [ ] **Step 3: Update `protocol/player-ingestion.md` pipeline**

Change the pipeline diagram to include:

```text
compile-batch
        |
        v
validate-runtime-package
        |
        v
static Player base
```

Add:

```md
Runtime package preflight reads the compiled base directory, not only the source
`batch.json`. It catches missing assets, malformed collider SVGs, and illegal
variable/context overlaps before participants see the task.
```

- [ ] **Step 4: Update checklist**

Add these bullets before `Run validate-batch`:

```md
- [ ] Object collider sidecars contain only intentional filled vector solids.
- [ ] Sized `<use>` appears in object collider sidecars only when the whole rectangle is intended to block movement.
- [ ] No image-backed `<use>` or raster remnants are used as object colliders unless intentionally rectangular.
- [ ] For every variable object, the reconstruction initial pose does not overlap any collision-enabled context object.
- [ ] For every scored variable object, the target pose does not overlap any collision-enabled context object.
```

Add after `Run validate-batch before compiling`:

```md
- [ ] Run `validate-runtime-package` on the compiled/deployable base before browser testing.
```

- [ ] **Step 5: Update asset package template**

Replace the collider bullet with:

```md
- Collider SVGs should share the visual object's local coordinate system and contain only intentional filled vector solids. Recommended shapes are `rect`, `polygon`, and closed `path`; curves in paths are flattened. A sized `<use>` is accepted only when that entire rectangle is intended to be the collider. Avoid image-backed `<use>`, masks, clip paths, filters, rounded rects, stroke-only geometry, and visual artwork.
```

---

### Task 5: Verification

**Files:**
- No new files beyond prior tasks.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npm test -- tools/generator/validate-runtime-package.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full tests**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: `tsc && vite build` exits 0.

- [ ] **Step 4: Demonstrate the current generated package fails preflight**

Run:

```bash
pixi run validate-runtime-package --base public/layout-task-generated-sg-output-2-collider-preserve-size
```

Expected: non-zero exit with `initial_collision` entries for the currently invalid Rhino collider package.

- [ ] **Step 5: Commit**

Run:

```bash
git add tools/generator/validate-runtime-package.ts tools/generator/validate-runtime-package.test.ts pixi.toml protocol/rhino.md protocol/player-ingestion.md protocol/templates/rhino-export-checklist.md protocol/templates/rhino-asset-package-template.md docs/superpowers/plans/2026-07-01-runtime-package-preflight.md
git commit -m "feat: add runtime package preflight"
```

---

## Self-Review

Spec coverage:

- Documents `<use>` ambiguity and Rhino collider export constraints.
- Adds package-level preflight because `validate-batch` cannot inspect SVG geometry.
- Keeps runtime collision semantics unchanged.
- Adds a `pixi` task for repeatable use.
- Includes tests for both healthy and colliding packages.

No placeholders remain.

Type consistency:

- `validateRuntimePackage()` returns a structured report used by both CLI and tests.
- Failure types use `task_id`, `object_id`, and `collided_with`, matching protocol naming style.
