# Relative Target Coordinate Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the protocol consistently treat variable-object answers as relative action steps (`dx_steps`, `dy_steps`, `rotation_steps`) while treating absolute coordinates as optional derived/analysis data.

**Architecture:** Keep Player runtime movement in world coordinates, but define the authored correct answer as relative steps from each object's reconstruction initial pose. Rhino/adaptor must provide per-object initial `x/y/rotation` in room/world coordinates; compiler and scoring preserve `target.relative` as the canonical answer and only use `target.absolute` when explicitly present.

**Tech Stack:** TypeScript, Zod schemas, Vitest, Node/tsx adaptor scripts, Markdown protocol documentation.

---

## File Structure

- Create `protocol/relative-target-coordinate-semantics.md`
  Independent short report for the new semantics. This is the human-readable authority for what changed, why, and how Rhino/adaptor/Player/scoring should interpret it.
- Modify `src/types/batch.ts`
  Clarify comments and type naming around relative-target-primary semantics.
- Modify `src/schemas/batch.schema.ts`
  Prefer requiring `target.relative` for source/scoring targets while optionally allowing `target.absolute` as auxiliary analysis data.
- Modify `src/core/batch-compiler.test.ts`
  Add regression tests that `target.relative` is preserved into `scoring-reference.json` and no absolute target is synthesized.
- Modify `tools/scoring/scoring-utils.test.ts`
  Add regression tests that scoring works when target has relative fields only.
- Modify `protocol/README.md`
  Update the short canonical state rule.
- Modify `protocol/rhino.md`
  Rewrite the Rhino-facing coordinate and target sections: initial pose is room/world bbox-center pose; correct answer is relative action steps.
- Modify `protocol/player-ingestion.md`
  Rewrite Player-side ingestion/scoring expectations around relative answers and optional absolute analysis fields.
- Modify `protocol/templates/rhino-export-checklist.md`
  Update checklist items so Rhino exporters verify relative answer steps, not required absolute target coordinates.
- Modify `protocol/templates/rhino-asset-package-template.md`
  Update package guidance if it still implies absolute targets are required.
- Modify `protocol/examples/scoring-example.json`
  Make the canonical scoring fixture use `target.relative` as the required answer and omit `target.absolute` unless the example specifically demonstrates optional analysis data.
- Modify `protocol/examples/full-preview-collision/batch.json`
  Remove required-answer framing around `target.absolute`; keep only `relative` for the primary answer or label `absolute` as optional if retained.

## Semantics To Preserve

Runtime object pose:

```json
{
  "id": "scene_m01_variable",
  "role": "variable",
  "asset": "m01_variable",
  "x": 31500,
  "y": 10500,
  "rotation": 0,
  "anchor": "center"
}
```

Meaning:

- `x/y/rotation` is the reconstruction initial pose.
- `x/y` is the object's bbox-center pose in the room/world coordinate system, not the SVG-local coordinate system.
- SVG `viewBox` remains only the asset-local drawing box.

Canonical correct answer:

```json
{
  "target": {
    "relative": {
      "dx_steps": -1,
      "dy_steps": 1,
      "rotation_steps": -2
    }
  }
}
```

Optional derived analysis data:

```json
{
  "target": {
    "relative": {
      "dx_steps": -1,
      "dy_steps": 1,
      "rotation_steps": -2
    },
    "absolute": {
      "x": 31000,
      "y": 11000,
      "rotation_deg": -90
    }
  }
}
```

`absolute` must not be required for valid source packages.

---

### Task 0: Independent Semantics Report

**Files:**
- Create: `protocol/relative-target-coordinate-semantics.md`
- Modify: `protocol/README.md`

- [ ] **Step 1: Create the independent report**

Create `protocol/relative-target-coordinate-semantics.md` with exactly this content:

```md
# Relative Target And Coordinate Semantics

This report is the compact authority for the protocol change that separates object initial pose from variable-object answer semantics.

## Short Version

For every object, `x`, `y`, and `rotation` are the reconstruction initial pose in the room/world coordinate system.

For variable objects, the correct answer is `target.relative`: signed movement and rotation steps from that initial pose.

`target.absolute` is optional analysis data. It is not required for authored source packages and should not be synthesized by the adaptor.

## Coordinate Contract

The Player has one runtime room coordinate system: `world.viewBox`.

Object pose fields use that system:

- `objects[].x`
- `objects[].y`
- `objects[].rotation`
- background placement
- grid size
- movement step
- collision geometry

For Rhino/CAD exports, `objects[].x/y` should normally be the object's own 2D bbox center after projection into the same coordinate system as the background SVG and `world.viewBox`. Z is ignored.

SVG `viewBox` is asset-local. It describes the drawing box of one SVG asset. It does not place the asset in the room.

With `anchor: "center"`, the Player aligns the center of the SVG/object box to `objects[].x/y`.

## State Contract

Fixed/context object:

```json
{
  "id": "scene_m01_group",
  "role": "fixed",
  "asset": "m01_group",
  "x": 31500,
  "y": 10500,
  "rotation": 0,
  "anchor": "center"
}
```

Variable object:

```json
{
  "id": "scene_m01_variable",
  "role": "variable",
  "asset": "m01_variable",
  "x": 31500,
  "y": 10500,
  "rotation": 0,
  "anchor": "center",
  "target": {
    "relative": {
      "dx_steps": -1,
      "dy_steps": 1,
      "rotation_steps": -2
    }
  }
}
```

The variable object's `x/y/rotation` is the participant's starting state. `target.relative` is the correct action sequence from that starting state.

## Optional Absolute Data

If a generator already has the final world pose, it may include:

```json
{
  "target": {
    "relative": {
      "dx_steps": -1,
      "dy_steps": 1,
      "rotation_steps": -2
    },
    "absolute": {
      "x": 31000,
      "y": 11000,
      "rotation_deg": -90
    }
  }
}
```

This is optional. The adaptor must not invent it. Scoring must work without it.

## Pipeline Responsibilities

Rhino/GH exporter:

- Computes each object or sub-object bbox center in the room coordinate system.
- Writes fixed and variable initial `x/y/rotation`.
- Writes variable `target.relative` action steps.
- May omit `target.absolute`.

Adaptor:

- Passes `target.relative` through unchanged.
- Does not synthesize `target.absolute`.
- May normalize assets, paths, behavior templates, and SVG sizing rules.

Compiler:

- Preserves object initial pose in runtime task JSON.
- Writes target data to private `scoring/scoring-reference.json`.
- Does not compute or require `target.absolute`.

Player:

- Renders objects at `x/y/rotation`.
- Records user answer as relative step offsets.
- Does not need target data at runtime.

Scoring:

- Compares observed relative steps to `target.relative`.
- Emits absolute observed values from initial pose plus user answer when context exists.
- Leaves target absolute columns blank when `target.absolute` is absent.

## Acceptance Checks

- A variable object with only `target.relative` validates.
- A variable object with `target.absolute` but no `target.relative` is rejected.
- Generated scoring reference preserves `target.relative`.
- Scoring produces zero relative error for matching step answers.
- Documentation no longer describes `target.absolute` as required.
```

- [ ] **Step 2: Link the report from `protocol/README.md`**

Add this bullet under "Main files":

```md
- `relative-target-coordinate-semantics.md`: compact report for object pose coordinates, relative answers, and optional absolute analysis data.
```

- [ ] **Step 3: Commit the report**

Run:

```bash
git add protocol/relative-target-coordinate-semantics.md protocol/README.md
git commit -m "docs: add relative target semantics report"
```

---

### Task 1: Schema And Type Contract

**Files:**
- Modify: `src/types/batch.ts`
- Modify: `src/schemas/batch.schema.ts`
- Test: `src/schemas/batch.schema.test.ts`

- [ ] **Step 1: Add failing schema tests for relative-only target**

Append these tests to `src/schemas/batch.schema.test.ts` near the existing scoring/batch target tests:

```ts
it("accepts relative-only object targets as the canonical answer", () => {
  const batch = makeValidBatch();
  batch.trials[0].objects[0].target = {
    relative: { dx_steps: -1, dy_steps: 2, rotation_steps: -2 },
  };

  const parsed = batchSchema.parse(batch);

  expect(parsed.trials[0].objects[0].target).toEqual({
    relative: { dx_steps: -1, dy_steps: 2, rotation_steps: -2 },
  });
});

it("rejects absolute-only object targets in authored batch config", () => {
  const batch = makeValidBatch();
  batch.trials[0].objects[0].target = {
    absolute: { x: 100, y: 200, rotation_deg: 45 },
  } as any;

  expect(() => batchSchema.parse(batch)).toThrow();
});
```

If this file does not have `makeValidBatch()`, copy the smallest valid batch fixture already used in nearby tests and set `target` on its first object.

- [ ] **Step 2: Run schema tests and verify failure**

Run:

```bash
npm run test -- src/schemas/batch.schema.test.ts
```

Expected:

```text
FAIL src/schemas/batch.schema.test.ts
```

The relative-only test may already pass. The absolute-only rejection should fail until `objectTargetSchema` is changed.

- [ ] **Step 3: Update `ObjectTargetState` to require relative**

In `src/types/batch.ts`, replace:

```ts
export type ObjectTargetState =
  | { relative: RelativeTargetState; absolute?: AbsoluteTargetState }
  | { relative?: RelativeTargetState; absolute: AbsoluteTargetState };
```

with:

```ts
export interface ObjectTargetState {
  /** Canonical correct answer: signed action steps from reconstruction initial pose. */
  relative: RelativeTargetState;
  /** Optional derived analysis pose in world coordinates. Not required for authored answers. */
  absolute?: AbsoluteTargetState;
}
```

Update nearby comments:

```ts
/** Correct answer for analysis. The canonical authored answer is relative action steps. */
target?: ObjectTargetState;
```

and:

```ts
export interface AbsoluteTargetState {
  /** Optional derived target anchor x in world units. */
  x: number;
  /** Optional derived target anchor y in world units. */
  y: number;
  /** Optional derived target clockwise rotation in degrees. */
  rotation_deg: number;
}
```

- [ ] **Step 4: Update Zod target schema**

In `src/schemas/batch.schema.ts`, replace:

```ts
export const objectTargetSchema = z.union([
  z.object({
    relative: relativeTargetSchema,
    absolute: absoluteTargetSchema.optional(),
  }),
  z.object({
    relative: relativeTargetSchema.optional(),
    absolute: absoluteTargetSchema,
  }),
]);
```

with:

```ts
export const objectTargetSchema = z.object({
  relative: relativeTargetSchema,
  absolute: absoluteTargetSchema.optional(),
});
```

- [ ] **Step 5: Run schema tests and verify pass**

Run:

```bash
npm run test -- src/schemas/batch.schema.test.ts
```

Expected:

```text
PASS src/schemas/batch.schema.test.ts
```

- [ ] **Step 6: Commit schema contract**

Run:

```bash
git add src/types/batch.ts src/schemas/batch.schema.ts src/schemas/batch.schema.test.ts
git commit -m "refactor: make relative targets canonical"
```

---

### Task 2: Compiler Regression For Relative-Only Scoring Reference

**Files:**
- Modify: `src/core/batch-compiler.test.ts`
- Inspect: `src/core/batch-compiler.ts`

- [ ] **Step 1: Add failing compiler test**

Add this test near the scoring reference tests in `src/core/batch-compiler.test.ts`:

```ts
it("preserves relative-only targets in scoring reference without synthesizing absolute targets", () => {
  const batch = makeBatch({
    trials: [
      {
        qid: "Q001",
        task_id: "room001",
        background: { asset: "room_bg", x: 0, y: 0, width: 1000, height: 1000 },
        objects: [
          {
            id: "chair_variable",
            role: "variable",
            asset: "chair",
            x: 100,
            y: 200,
            rotation: 0,
            behavior: { template: "button25_rotate45_limited" },
            target: {
              relative: { dx_steps: -1, dy_steps: 2, rotation_steps: -2 },
            },
          },
        ],
      },
    ],
  });

  const compiled = compileBatch(batch);

  expect(compiled.scoringReference.tasks.room001.objects.chair_variable.target).toEqual({
    relative: { dx_steps: -1, dy_steps: 2, rotation_steps: -2 },
  });
});
```

If `makeBatch` has a different helper signature in the file, adapt only the helper call shape; keep the assertion exactly as above.

- [ ] **Step 2: Run compiler test**

Run:

```bash
npm run test -- src/core/batch-compiler.test.ts
```

Expected:

```text
PASS src/core/batch-compiler.test.ts
```

If this fails because old tests still use absolute-only targets, update those tests to include `relative` and keep `absolute` only as optional extra data.

- [ ] **Step 3: Confirm compiler code needs no synthesis**

Inspect `src/core/batch-compiler.ts` and verify `compileScoringObjects()` still uses:

```ts
const target = object.target ?? scoring?.target;
```

Do not add code that computes `absolute` from `relative`.

- [ ] **Step 4: Commit compiler regression**

Run:

```bash
git add src/core/batch-compiler.test.ts src/core/batch-compiler.ts
git commit -m "test: preserve relative-only scoring targets"
```

---

### Task 3: Scoring Regression For Relative-Only Targets

**Files:**
- Modify: `tools/scoring/scoring-utils.test.ts`
- Inspect: `tools/scoring/scoring-utils.ts`

- [ ] **Step 1: Add scoring test for relative-only target**

Add this test to `tools/scoring/scoring-utils.test.ts` near existing `toObjectStateRows` tests:

```ts
it("scores relative-only targets and leaves target absolute columns blank", () => {
  const rows = toObjectStateRows(
    [
      decodedRecord({
        result: resultWithFinalState({
          final_state: {
            chair_variable: {
              dx_steps: -1,
              dy_steps: 2,
              rotation_steps: -2,
            },
          },
          context: {
            world: {
              unit: "mm",
              viewBox: { x: 0, y: 0, width: 1000, height: 1000 },
              origin: { x: 0, y: 0 },
              grid_size: 500,
              grid_snap: true,
            },
            objects: {
              chair_variable: {
                origin: { x: 31500, y: 10500, r: 0 },
                movement_step: 500,
                rotation_step: 45,
                limits: {
                  max_left: 2,
                  max_right: 2,
                  max_up: 2,
                  max_down: 2,
                  max_cw: 2,
                  max_ccw: 2,
                },
              },
            },
          },
        }),
      }),
    ],
    {
      schema: "layouttask.scoring-reference.v1",
      experiment_id: "exp",
      tasks: {
        room001: {
          qid: "Q001",
          objects: {
            chair_variable: {
              role: "variable",
              target: {
                relative: { dx_steps: -1, dy_steps: 2, rotation_steps: -2 },
              },
            },
          },
        },
      },
    },
  );

  expect(rows[0]).toMatchObject({
    relative_dx_steps: -1,
    relative_dy_steps: 2,
    relative_rotation_steps: -2,
    target_relative_dx_steps: -1,
    target_relative_dy_steps: 2,
    target_relative_rotation_steps: -2,
    error_relative_dx_steps: 0,
    error_relative_dy_steps: 0,
    error_relative_rotation_steps: 0,
    absolute_x: 31000,
    absolute_y: 11500,
    absolute_rotation_deg: 270,
    target_absolute_x: "",
    target_absolute_y: "",
    target_absolute_rotation_deg: "",
    error_absolute_x: "",
    error_absolute_y: "",
    error_absolute_distance: "",
    error_absolute_rotation_deg: "",
  });
});
```

If helper names differ, use the existing helpers in this test file. Keep the expected row semantics unchanged.

- [ ] **Step 2: Run scoring test**

Run:

```bash
npm run test -- tools/scoring/scoring-utils.test.ts
```

Expected:

```text
PASS tools/scoring/scoring-utils.test.ts
```

- [ ] **Step 3: Inspect scoring utility behavior**

Confirm `tools/scoring/scoring-utils.ts` keeps these behaviors:

```ts
const targetRelative = getTargetRelative(objectReference);
const targetAbsolute = getTargetAbsolute(objectReference);
```

and:

```ts
target_absolute_x: targetAbsolute?.x ?? "",
target_absolute_y: targetAbsolute?.y ?? "",
target_absolute_rotation_deg: targetAbsolute?.rotationDeg ?? "",
```

Do not derive target absolute columns when `target.absolute` is omitted.

- [ ] **Step 4: Commit scoring regression**

Run:

```bash
git add tools/scoring/scoring-utils.test.ts tools/scoring/scoring-utils.ts
git commit -m "test: score relative-only target answers"
```

---

### Task 4: Adaptor Contract Guard

**Files:**
- Modify: `protocol/adaptor/assemble-stimuli-csv.ts`
- Modify: `protocol/adaptor/assemble_protocol_batch_from_stimuli_csv.py`
- Test: add or modify adaptor tests if an adaptor test file already exists; otherwise use a small fixture command.

- [ ] **Step 1: Search for absolute-target synthesis**

Run:

```bash
rg -n "target\\.absolute|absolute|rotation_deg|dx_steps|dy_steps|rotation_steps" protocol/adaptor
```

Expected:

```text
No code path should synthesize target.absolute from target.relative.
```

If the search only shows pass-through parsing or comments, no code change is required.

- [ ] **Step 2: Add adaptor validation note in TS script**

In `protocol/adaptor/assemble-stimuli-csv.ts`, add this comment above `const parsedTrial = parseJsonCell(row, "trial_protocol_json");`:

```ts
    // The adaptor treats metric_trial_protocol_json as the source of truth.
    // It must preserve relative target actions as authored and must not synthesize target.absolute.
```

- [ ] **Step 3: Add matching note in Python wrapper**

In `protocol/adaptor/assemble_protocol_batch_from_stimuli_csv.py`, add this comment above the parsed trial assignment:

```py
        # Preserve target.relative from metric_trial_protocol_json as the canonical answer.
        # Do not synthesize target.absolute here; absolute pose is optional analysis data.
```

- [ ] **Step 4: Run adaptor on the small Rhino package**

Run:

```bash
pixi run assemble-stimuli-csv -- --csv D:/PROJECTS/RhinoGH/IsPictureEnough/stimuli/sg_output_2/data.csv --out D:/PROJECTS/RhinoGH/IsPictureEnough/stimuli/sg_output_2/processing/layouttask-source-relative-target-check --experiment-id sg_output_2_relative_check
```

Expected:

```text
Assembled 10 trial(s)
batch.json written
assets/objects.json written
assets/backgrounds.json written
behaviors/behaviors.json written
```

- [ ] **Step 5: Inspect generated target shape**

Run:

```bash
node -e "const b=require('D:/PROJECTS/RhinoGH/IsPictureEnough/stimuli/sg_output_2/processing/layouttask-source-relative-target-check/batch.json'); for (const o of b.trials[0].objects) if (o.role==='variable') console.log(o.id, JSON.stringify(o.target));"
```

Expected:

```text
Each variable object prints target.relative.
target.absolute may appear only if Rhino emitted it; the adaptor did not create it.
```

- [ ] **Step 6: Commit adaptor comments/guards**

Run:

```bash
git add protocol/adaptor/assemble-stimuli-csv.ts protocol/adaptor/assemble_protocol_batch_from_stimuli_csv.py
git commit -m "docs: clarify adaptor relative target pass-through"
```

---

### Task 5: Protocol Docs Rewrite

**Files:**
- Inspect: `protocol/relative-target-coordinate-semantics.md`
- Modify: `protocol/README.md`
- Modify: `protocol/rhino.md`
- Modify: `protocol/player-ingestion.md`
- Modify: `protocol/templates/rhino-export-checklist.md`
- Modify: `protocol/templates/rhino-asset-package-template.md`

- [ ] **Step 1: Update `protocol/README.md`**

Keep the link to `protocol/relative-target-coordinate-semantics.md` added in Task 0.

Replace the current important state rule with:

```md
Important state rule: in batch objects, `x`, `y`, and `rotation` define the reconstruction initial pose shown to the participant. For variable objects, the canonical correct answer is `target.relative`: signed movement and rotation steps from that initial pose. `target.absolute` is optional derived/analysis data and is not required in authored source packages.
```

Add this coordinate rule after the unit rule:

```md
Coordinate rule: object `x/y` is the object's anchor pose in the room/world coordinate system. For `anchor: "center"`, this should normally be the object's Rhino/CAD bbox center after projection into the same 2D coordinate system used by `world.viewBox` and the background SVG. SVG `viewBox` is asset-local and does not define object room position.
```

- [ ] **Step 2: Rewrite `protocol/rhino.md` target section**

In `protocol/rhino.md`, replace the "Initial State vs Target State" section with:

```md
## Initial Pose vs Relative Answer

Every object has a reconstruction initial pose:

- `objects[].x`
- `objects[].y`
- `objects[].rotation`

These fields are in the room/world coordinate system declared by `world.viewBox`. For Rhino/CAD exports, use the object's own bbox center in the 2D room coordinate system and ignore Z. Do not write SVG-local coordinates here.

For `role: "fixed"` objects, this initial pose is the displayed context pose. Fixed objects usually have no `target`.

For `role: "variable"` objects, this initial pose is the starting state shown to the participant. The canonical correct answer is `target.relative`, which records the action steps required from the initial pose:

```json
{
  "target": {
    "relative": {
      "dx_steps": -1,
      "dy_steps": 1,
      "rotation_steps": -2
    }
  }
}
```

`target.absolute` is optional derived/analysis data. It may be emitted if the generator already has it, but the Player protocol does not require it for authored answers.
```

- [ ] **Step 3: Rewrite object field target bullet in `protocol/rhino.md`**

Replace:

```md
- `target`: correct answer state for variable objects. Use `target.absolute` for the stimulus pose and `target.relative` for step deltas from the initial pose.
```

with:

```md
- `target`: correct answer state for variable objects. Use `target.relative` as the canonical answer: signed movement/rotation steps from the reconstruction initial pose. `target.absolute` is optional derived/analysis data.
```

- [ ] **Step 4: Rewrite scoring section in `protocol/rhino.md`**

Replace "When possible, export both relative and absolute targets" with:

```md
Export `target.relative` for scored variable objects. This is the canonical answer.
```

Keep the relative JSON example. Move the absolute JSON example under this wording:

```md
Optional derived absolute pose:
```

Then add:

```md
If both are available, analysts can use both. If only `relative` is available, scoring still works and absolute target columns remain blank unless derived later by analysis tooling.
```

- [ ] **Step 5: Update `protocol/player-ingestion.md` State Chain**

Replace the "Correct target state" subsection with:

```md
2. Correct answer:

```json
{
  "target": {
    "relative": { "dx_steps": 4, "dy_steps": 0, "rotation_steps": 1 }
  }
}
```

`relative` is the canonical answer: signed action steps from the initial pose. `absolute` may be present as optional analysis data, but is not required.
```

- [ ] **Step 6: Update `protocol/player-ingestion.md` scoring output text**

Replace:

```md
- target absolute values
```

with:

```md
- target absolute values when explicitly provided
```

Add:

```md
When `target.absolute` is omitted, scoring does not synthesize target absolute columns. Observed absolute values can still be derived from the user's relative answer and the recorded initial pose.
```

- [ ] **Step 7: Update Rhino checklist**

In `protocol/templates/rhino-export-checklist.md`, replace:

```md
- [ ] For every scored variable object, `target.absolute` stores the correct stimulus pose.
- [ ] For every step-based scored variable object, `target.relative` stores signed steps from the initial pose to `target.absolute`.
```

with:

```md
- [ ] For every scored variable object, `target.relative` stores the canonical correct answer as signed movement/rotation steps.
- [ ] `target.absolute` is omitted unless it is intentionally exported as optional derived/analysis data.
```

- [ ] **Step 8: Update asset package template**

Run:

```bash
rg -n "target.absolute|absolute targets|target coordinates|stimulus pose" protocol/templates/rhino-asset-package-template.md
```

For each hit, rewrite the text to say:

```md
Keep trial `x/y/rotation`, `world.viewBox`, `grid.size`, movement `step`, and `target.relative` in the same task-space step model. `target.absolute` is optional analysis data.
```

- [ ] **Step 9: Commit protocol docs**

Run:

```bash
git add protocol/README.md protocol/rhino.md protocol/player-ingestion.md protocol/templates/rhino-export-checklist.md protocol/templates/rhino-asset-package-template.md
git commit -m "docs: define relative targets as canonical answers"
```

---

### Task 6: Example Fixtures

**Files:**
- Modify: `protocol/examples/scoring-example.json`
- Modify: `protocol/examples/full-preview-collision/batch.json`
- Test: `npm run test`

- [ ] **Step 1: Inspect examples with absolute targets**

Run:

```bash
rg -n '"absolute"|target.absolute|rotation_deg' protocol/examples
```

Expected:

```text
List of example files that still include absolute target examples.
```

- [ ] **Step 2: Update `protocol/examples/scoring-example.json`**

For canonical scored variable examples, use:

```json
"target": {
  "relative": {
    "dx_steps": 2,
    "dy_steps": -1,
    "rotation_steps": 1
  }
}
```

Remove sibling `absolute` fields unless the example explicitly labels them as optional analysis data in nearby documentation.

- [ ] **Step 3: Update full preview collision fixture**

For variable object targets in `protocol/examples/full-preview-collision/batch.json`, ensure each scored variable target contains `relative`.

Use this shape:

```json
"target": {
  "relative": {
    "dx_steps": 1,
    "dy_steps": 0,
    "rotation_steps": 1
  }
}
```

Do not leave any `target` object with only `absolute`.

- [ ] **Step 4: Validate example batches**

Run:

```bash
pixi run validate-batch protocol/examples/scoring-example.json
pixi run validate-batch protocol/examples/full-preview-collision/batch.json
```

Expected:

```text
Validation passes for both examples.
```

- [ ] **Step 5: Run full tests**

Run:

```bash
npm run test
```

Expected:

```text
Test Files ... passed
Tests ... passed
```

- [ ] **Step 6: Commit examples**

Run:

```bash
git add protocol/examples/scoring-example.json protocol/examples/full-preview-collision/batch.json
git commit -m "docs: update protocol examples for relative targets"
```

---

### Task 7: Build Verification

**Files:**
- No source edits expected.

- [ ] **Step 1: Run production build**

Run:

```bash
npm run build
```

Expected:

```text
build succeeds
```

- [ ] **Step 2: Run final test suite**

Run:

```bash
npm run test
```

Expected:

```text
all tests pass
```

- [ ] **Step 3: Check working tree**

Run:

```bash
git status --short
```

Expected:

```text
Only intentionally untracked generated demo packages may remain.
Tracked source/doc changes should be committed.
```

- [ ] **Step 4: Final summary**

Report:

```text
Implemented relative-target-primary semantics.
Verified schema/compiler/scoring/docs/examples.
npm run test: passed.
npm run build: passed.
```

---

## Self-Review

- Spec coverage:
  - Independent compact report exists: Task 0.
  - Relative action steps are canonical: Tasks 0, 1, 3, 5, 6.
  - Absolute coordinates are optional derived/analysis data: Tasks 0, 1, 2, 3, 5.
  - Rhino/export coordinate meaning is explicit: Tasks 0 and 5.
  - Adaptor does not synthesize absolute: Task 4.
  - Compiler/scoring stay compatible with relative-only targets: Tasks 2, 3.
  - Examples and docs are updated together: Tasks 5, 6.

- Placeholder scan:
  - No TBD/TODO placeholders remain.
  - Every code change step includes concrete snippets or exact commands.

- Type consistency:
  - `ObjectTargetState.relative` is required in source and scoring reference types.
  - `ObjectTargetState.absolute` remains optional.
  - `target.relative.dx_steps`, `dy_steps`, and `rotation_steps` names match existing code.
