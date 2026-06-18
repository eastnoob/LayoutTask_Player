# World Unit Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add first-class `world.unit` metadata so Rhino/generated tasks can declare the global world unit for coordinates, grid size, movement steps, collision geometry, and targets, while documenting local unit overrides as reserved but not implemented.

**Architecture:** This is metadata, not a unit-conversion system. The Player continues to treat all geometry as numeric world units; `world.unit` records what those numbers mean. Asset `intrinsic_unit` remains a file-internal annotation. Runtime result context and analysis CSV should carry the unit so exported data stays self-describing.

**Tech Stack:** TypeScript, Zod, JSON Schema, protocol Markdown/JSON fixtures, Vitest, Pixi tasks.

---

## File Structure

- Modify `src/types/config.ts`: add shared `WorldUnit` type, `WorldConfig.unit?: WorldUnit`, and `ObjectAssetConfig.intrinsic_unit?: WorldUnit`.
- Modify `src/schemas/config.schema.ts`: add `worldUnitSchema`, allow `world.unit`, expand `intrinsic_unit` values for both object and background assets.
- Modify `src/schemas/config.schema.test.ts`: assert `world.unit` and object/background `intrinsic_unit` parse.
- Modify `src/schemas/batch.schema.test.ts`: assert batch `shared.world.unit` parses.
- Modify `protocol/schemas/layouttask.batch.schema.json`: add a `worldUnit` definition and allow `world.unit`.
- Modify `src/types/result.ts`: add `unit?: WorldUnit` to result context.
- Modify `src/schemas/result.schema.ts`: validate optional `context.world.unit`.
- Modify `src/core/recorder.ts`: include `config.world.unit` in `result.context.world.unit`.
- Modify `src/core/recorder.test.ts` or `src/core/encoder.test.ts`: assert result context includes `unit` when configured.
- Modify `tools/decoder/decoder-utils.ts`: add `world_unit` to trial CSV rows.
- Modify `tools/decoder/decoder-utils.test.ts`: assert `world_unit` exports.
- Modify `tools/scoring/scoring-utils.ts`: add `world_unit` to object-state CSV rows.
- Modify `tools/scoring/scoring-utils.test.ts`: assert `world_unit` exports.
- Modify `protocol/rhino.md`: document global unit inheritance and local override reservation.
- Modify `protocol/README.md`: add short rule summary.
- Modify `protocol/templates/rhino-batch-template.json`: add `shared.world.unit`.
- Modify `protocol/templates/rhino-asset-package-template.md`: clarify `intrinsic_unit` vs `world.unit`.
- Modify `protocol/templates/rhino-export-checklist.md`: add unit consistency checks.
- Modify `protocol/examples/minimal-batch.json`, `protocol/examples/scoring-example.json`, and `protocol/examples/full-preview-collision/batch.json`: add `world.unit`.

## Semantics

- `world.unit` is optional and defaults semantically to `"unknown"` when omitted. The config loader does not inject `"unknown"`; omission remains valid for backward compatibility.
- Valid units: `"mm"`, `"cm"`, `"m"`, `"px"`, `"cad_unit"`, `"unknown"`.
- All task-space numeric geometry inherits `world.unit`: `world.viewBox`, `world.origin`, `world.grid.size`, `background.x/y/width/height`, `objects[].x/y/width/height`, `target.absolute.x/y`, `behavior.movement.step`, `collision.areas`, and object asset `default_width/default_height`.
- `intrinsic_unit` describes only an asset file's internal coordinate system. It does not change task-space world coordinates.
- Local unit override fields such as `object.unit`, `background.unit`, `movement.unit`, or `collision.unit` are reserved for future conversion support and must not be emitted in v1. They are not added to schemas in this plan.

## Task 1: Add Unit Types And Runtime Schemas

**Files:**
- Modify: `src/types/config.ts`
- Modify: `src/schemas/config.schema.ts`
- Test: `src/schemas/config.schema.test.ts`

- [x] **Step 1: Add `WorldUnit` and unit fields in `src/types/config.ts`**

Add this type near `AssetType`:

```ts
export type WorldUnit = "mm" | "cm" | "m" | "px" | "cad_unit" | "unknown";
```

Update `WorldConfig`:

```ts
export interface WorldConfig {
  unit?: WorldUnit;
  viewBox: ViewBox;
  origin: Point;
  grid: GridConfig;
}
```

Update `ObjectAssetConfig`:

```ts
export interface ObjectAssetConfig {
  type: AssetType;
  src: string;
  intrinsic_unit?: WorldUnit;
  default_width: number;
  default_height: number;
  anchor?: Anchor;
}
```

Update `BackgroundAssetConfig`:

```ts
export interface BackgroundAssetConfig {
  type: "image" | "svg";
  src: string;
  intrinsic_unit?: WorldUnit;
}
```

- [x] **Step 2: Add `worldUnitSchema` in `src/schemas/config.schema.ts`**

Add this near the top after imports:

```ts
export const worldUnitSchema = z.enum(["mm", "cm", "m", "px", "cad_unit", "unknown"]);
```

Update `worldSchema`:

```ts
export const worldSchema = z.object({
  unit: worldUnitSchema.optional(),
  viewBox: viewBoxSchema,
  origin: pointSchema,
  grid: gridSchema,
});
```

Update `objectAssetSchema`:

```ts
export const objectAssetSchema = z.object({
  type: z.enum(["svg", "png", "jpg", "image"]),
  src: z.string().min(1),
  intrinsic_unit: worldUnitSchema.optional(),
  default_width: z.number().positive(),
  default_height: z.number().positive(),
  anchor: z.enum(["center", "top_left"]).optional(),
});
```

Update `backgroundAssetSchema`:

```ts
export const backgroundAssetSchema = z.object({
  type: z.enum(["image", "svg"]),
  src: z.string().min(1),
  intrinsic_unit: worldUnitSchema.optional(),
});
```

- [x] **Step 3: Add config schema tests**

In `src/schemas/config.schema.test.ts`, update the import:

```ts
import {
  backgroundLibrarySchema,
  behaviorSchema,
  objectLibrarySchema,
  taskSchema,
} from "./config.schema";
```

Add these tests near the existing stage/world tests:

```ts
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
```

- [x] **Step 4: Run targeted config schema tests**

Run:

```bash
pixi run test src/schemas/config.schema.test.ts
```

Expected: PASS.

## Task 2: Add Batch Schema And Protocol JSON Schema Support

**Files:**
- Modify: `src/schemas/batch.schema.test.ts`
- Modify: `protocol/schemas/layouttask.batch.schema.json`
- Test: `src/schemas/batch.schema.test.ts`

- [x] **Step 1: Add batch parser test for shared world unit**

Add this test in `src/schemas/batch.schema.test.ts` inside `describe("batchSchema", ...)`:

```ts
  it("accepts shared world.unit metadata", () => {
    const batch = cloneMinimalBatch();
    batch.shared.world.unit = "mm";

    expect(batchSchema.parse(batch).shared.world?.unit).toBe("mm");
  });
```

- [x] **Step 2: Add `worldUnit` definition to protocol JSON Schema**

In `protocol/schemas/layouttask.batch.schema.json`, add this under `$defs`, near `nonEmptyString`:

```json
"worldUnit": {
  "description": "Metadata label for task-space world units. The player records this value but does not perform automatic unit conversion.",
  "enum": ["mm", "cm", "m", "px", "cad_unit", "unknown"]
},
```

Update `world.properties`:

```json
"properties": {
  "unit": { "$ref": "#/$defs/worldUnit" },
  "viewBox": { "$ref": "#/$defs/viewBox" },
  "origin": { "$ref": "#/$defs/point" },
  "grid": { "$ref": "#/$defs/grid" }
}
```

- [x] **Step 3: Validate JSON Schema parses**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('protocol/schemas/layouttask.batch.schema.json','utf8')); console.log('schema json ok')"
```

Expected output includes:

```text
schema json ok
```

- [x] **Step 4: Run batch schema tests**

Run:

```bash
pixi run test src/schemas/batch.schema.test.ts
```

Expected: PASS.

## Task 3: Preserve Unit In Runtime Results And Analysis Tools

**Files:**
- Modify: `src/types/result.ts`
- Modify: `src/schemas/result.schema.ts`
- Modify: `src/core/recorder.ts`
- Modify: `src/core/recorder.test.ts`
- Modify: `tools/decoder/decoder-utils.ts`
- Modify: `tools/decoder/decoder-utils.test.ts`
- Modify: `tools/scoring/scoring-utils.ts`
- Modify: `tools/scoring/scoring-utils.test.ts`

- [x] **Step 1: Add result context unit type support**

In `src/types/result.ts`, update the import:

```ts
import type { ViewBox, WorldUnit } from "./config";
```

Update `ResultContext.world`:

```ts
  world: {
    unit?: WorldUnit;
    viewBox: ViewBox;
    origin: {
      x: number;
      y: number;
    };
    grid_size: number;
    grid_snap: boolean;
    grid_origin?: {
      x: number;
      y: number;
    };
  };
```

In `src/schemas/result.schema.ts`, update the import:

```ts
import { pointSchema, viewBoxSchema, worldUnitSchema } from "./config.schema";
```

Update `resultContextSchema.world`:

```ts
  world: z.object({
    unit: worldUnitSchema.optional(),
    viewBox: viewBoxSchema,
    origin: z.object({
      x: z.number().finite(),
      y: z.number().finite(),
    }),
    grid_size: z.number().positive(),
    grid_snap: z.boolean(),
    grid_origin: pointSchema.optional(),
  }),
```

- [x] **Step 2: Record `world.unit` in `src/core/recorder.ts`**

Update `buildResultContext`:

```ts
      world: {
        unit: config.world.unit,
        viewBox: config.world.viewBox,
        origin: config.world.origin,
        grid_size: config.world.grid.size,
        grid_snap: config.world.grid.snap,
        grid_origin: config.world.grid.origin,
      },
```

- [x] **Step 3: Add recorder test**

In `src/core/recorder.test.ts`, add or update a recorder fixture so `config.world.unit = "mm"` and assert:

```ts
expect(result.context?.world.unit).toBe("mm");
```

If the existing test helper constructs a runtime config inline, add `unit: "mm"` to its `world` object.

- [x] **Step 4: Add `world_unit` to decoder trial CSV rows**

In `tools/decoder/decoder-utils.ts`, add to `TrialCsvRow`:

```ts
  world_unit: string;
```

In `toTrialRows`, set:

```ts
      world_unit: result.context?.world.unit ?? "",
```

In `emptyTrialRow`, set:

```ts
    world_unit: "",
```

In `tools/decoder/decoder-utils.test.ts`, update the fixture result context with:

```ts
world: {
  unit: "mm",
  viewBox: { x: -500, y: -500, width: 1000, height: 1000 },
  origin: { x: 0, y: 0 },
  grid_size: 25,
  grid_snap: true,
},
```

Assert:

```ts
expect(rows[0].world_unit).toBe("mm");
```

- [x] **Step 5: Add `world_unit` to scoring object-state CSV rows**

In `tools/scoring/scoring-utils.ts`, add to `ObjectStateCsvRow`:

```ts
  world_unit: string;
```

In `toObjectStateRows`, set:

```ts
        world_unit: result.context?.world.unit ?? "",
```

Place it near `session` or before `object_id`.

In `tools/scoring/scoring-utils.test.ts`, update fixture result context with `unit: "mm"` and assert:

```ts
expect(rows[0].world_unit).toBe("mm");
```

- [x] **Step 6: Run result/decoder/scoring tests**

Run:

```bash
pixi run test src/core/recorder.test.ts src/schemas/result.schema.test.ts tools/decoder/decoder-utils.test.ts tools/scoring/scoring-utils.test.ts
```

Expected: PASS.

## Task 4: Update Protocol Docs, Templates, And Examples

**Files:**
- Modify: `protocol/rhino.md`
- Modify: `protocol/README.md`
- Modify: `protocol/templates/rhino-batch-template.json`
- Modify: `protocol/templates/rhino-asset-package-template.md`
- Modify: `protocol/templates/rhino-export-checklist.md`
- Modify: `protocol/examples/minimal-batch.json`
- Modify: `protocol/examples/scoring-example.json`
- Modify: `protocol/examples/full-preview-collision/batch.json`
- Modify: `protocol/examples/assets/objects.json`
- Modify: `protocol/examples/full-preview-collision/assets/objects.json`

- [x] **Step 1: Update `protocol/rhino.md` world example**

Change the recommended shared world example to include:

```json
"unit": "mm",
```

The block should read:

```json
{
  "world": {
    "unit": "mm",
    "viewBox": { "x": 0, "y": 0, "width": 1000, "height": 1000 },
    "origin": { "x": 0, "y": 0 },
    "grid": { "size": 25, "visible": true, "snap": true }
  }
}
```

- [x] **Step 2: Replace `World Units` wording**

In `protocol/rhino.md`, expand `## World Units` with this text:

```md
`world.unit` is metadata for the task-space coordinate system. It does not trigger automatic conversion. If omitted, consumers should treat the unit as unknown.

Allowed values are:

- `mm`
- `cm`
- `m`
- `px`
- `cad_unit`
- `unknown`
```

Then state:

```md
The following fields inherit `world.unit`:
```

Use the existing list and add:

```md
- `objects[].target.absolute.x/y`
- collision `areas`
```

- [x] **Step 3: Add local override reserved note**

Add this subsection to `protocol/rhino.md` after `World Units`:

```md
### Local Unit Overrides

Local task-space unit overrides are reserved but not implemented in v1. Do not emit fields such as `object.unit`, `background.unit`, `movement.unit`, or `collision.unit`.

If future conversion support is added, local unit fields will override `world.unit` only for their own object/section. Until then, every task-space coordinate should use `world.unit`.
```

- [x] **Step 4: Clarify `intrinsic_unit`**

In `protocol/rhino.md` asset library rules, add:

```md
- `intrinsic_unit` describes the asset file's internal coordinate system only. It does not change the task-space size or placement values.
```

Update object library example to include:

```json
"intrinsic_unit": "px",
```

- [x] **Step 5: Update protocol README**

In `protocol/README.md`, add:

```md
Unit rule: `world.unit` labels the task-space unit for coordinates, grid size, movement step, collision geometry, and targets. Asset `intrinsic_unit` labels only the source SVG/image's internal coordinate system. Local unit override fields are reserved and not implemented in v1.
```

- [x] **Step 6: Update templates and examples**

Add `"unit": "mm"` to all protocol world examples:

```json
"world": {
  "unit": "mm",
  "viewBox": ...
}
```

Files:

- `protocol/templates/rhino-batch-template.json`
- `protocol/examples/minimal-batch.json`
- `protocol/examples/scoring-example.json`
- `protocol/examples/full-preview-collision/batch.json`

Add `intrinsic_unit` to object asset libraries:

```json
"intrinsic_unit": "px",
```

Files:

- `protocol/examples/assets/objects.json`
- `protocol/examples/full-preview-collision/assets/objects.json`

- [x] **Step 7: Update checklist**

In `protocol/templates/rhino-export-checklist.md`, add:

```md
- [x] `world.unit` is declared when the generator knows the task-space unit.
- [x] All task-space coordinates, dimensions, grid sizes, movement steps, target coordinates, and collision areas use `world.unit`.
- [x] Asset `intrinsic_unit` is used only to describe SVG/image source coordinates.
- [x] No local unit override fields are emitted; they are reserved and not implemented in v1.
```

- [x] **Step 8: Validate edited JSON files parse**

Run:

```bash
node -e "for (const f of ['protocol/templates/rhino-batch-template.json','protocol/examples/minimal-batch.json','protocol/examples/scoring-example.json','protocol/examples/full-preview-collision/batch.json','protocol/examples/assets/objects.json','protocol/examples/full-preview-collision/assets/objects.json']) { JSON.parse(require('fs').readFileSync(f,'utf8')); console.log(f, 'ok'); }"
```

Expected: all files print `ok`.

## Task 5: Validate Compiler, Fixtures, And Build

**Files:**
- Test existing fixtures and build.

- [x] **Step 1: Run schema and compiler tests**

Run:

```bash
pixi run test src/schemas/config.schema.test.ts src/schemas/batch.schema.test.ts src/core/batch-compiler.test.ts src/core/config-loader.test.ts
```

Expected: PASS.

- [x] **Step 2: Validate protocol batches**

Run:

```bash
pixi run validate-batch protocol/examples/minimal-batch.json
pixi run validate-batch protocol/examples/scoring-example.json
pixi run validate-batch protocol/examples/full-preview-collision/batch.json
```

Expected: all valid.

- [x] **Step 3: Compile full preview collision fixture**

Run:

```bash
pixi run compile-batch protocol/examples/full-preview-collision/batch.json --out .tmp/full-preview-collision-compiled
```

Expected: compile succeeds.

- [x] **Step 4: Run full test and build**

Run:

```bash
pixi run test
pixi run build
```

Expected: both pass.

## Task 6: Commit The Unit Metadata Update

**Files:**
- All files modified in Tasks 1-5.

- [x] **Step 1: Review diff**

Run:

```bash
git diff --stat
git diff -- src/types/config.ts src/schemas/config.schema.ts src/schemas/config.schema.test.ts src/schemas/batch.schema.test.ts protocol/schemas/layouttask.batch.schema.json src/types/result.ts src/schemas/result.schema.ts src/core/recorder.ts src/core/recorder.test.ts tools/decoder/decoder-utils.ts tools/decoder/decoder-utils.test.ts tools/scoring/scoring-utils.ts tools/scoring/scoring-utils.test.ts protocol/rhino.md protocol/README.md protocol/templates/rhino-batch-template.json protocol/templates/rhino-asset-package-template.md protocol/templates/rhino-export-checklist.md protocol/examples/minimal-batch.json protocol/examples/scoring-example.json protocol/examples/full-preview-collision/batch.json protocol/examples/assets/objects.json protocol/examples/full-preview-collision/assets/objects.json
```

Expected: diff includes unit metadata support and documentation only; no generated `.tmp` files are staged.

- [x] **Step 2: Check status**

Run:

```bash
git status --short
```

Expected: only intended source/docs/protocol files and this plan are modified.

- [x] **Step 3: Commit**

Run:

```bash
git add docs/superpowers/plans/2026-06-18-world-unit-metadata.md src/types/config.ts src/schemas/config.schema.ts src/schemas/config.schema.test.ts src/schemas/batch.schema.test.ts protocol/schemas/layouttask.batch.schema.json src/types/result.ts src/schemas/result.schema.ts src/core/recorder.ts src/core/recorder.test.ts tools/decoder/decoder-utils.ts tools/decoder/decoder-utils.test.ts tools/scoring/scoring-utils.ts tools/scoring/scoring-utils.test.ts protocol/rhino.md protocol/README.md protocol/templates/rhino-batch-template.json protocol/templates/rhino-asset-package-template.md protocol/templates/rhino-export-checklist.md protocol/examples/minimal-batch.json protocol/examples/scoring-example.json protocol/examples/full-preview-collision/batch.json protocol/examples/assets/objects.json protocol/examples/full-preview-collision/assets/objects.json
git commit -m "feat: add world unit metadata"
```

Expected: commit succeeds.

## Self-Review

- Spec coverage: Covers global `world.unit`, asset `intrinsic_unit`, local override reserved docs, result context, decoder/scoring exports, schema/tests/docs/examples.
- Placeholder scan: No TBD/TODO placeholders remain.
- Type consistency: Uses one enum vocabulary: `mm`, `cm`, `m`, `px`, `cad_unit`, `unknown`.
- Scope check: Does not implement automatic conversion or local unit override fields. This matches the requested v1 behavior.
