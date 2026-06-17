# Initial/Target State Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clarify and lock the protocol semantics that `objects[].x/y/rotation` are the reconstruction initial state, while `target.absolute` is the correct stimulus state and `target.relative` is the step delta from initial to target.

**Architecture:** This is a small authoring/protocol change, not a runtime data-shape migration. The existing JSON structure remains canonical: runtime objects keep `x/y/rotation`; authoring/scoring metadata keeps `target`. Documentation, schema descriptions, examples, and tests are updated so Rhino/exporter authors do not confuse the stimulus-correct pose with the reconstruction-start pose.

**Tech Stack:** TypeScript, Zod schemas, JSON Schema, protocol Markdown docs, JSON protocol examples, Vitest, Pixi tasks.

---

## File Structure

- Modify `src/types/config.ts`: add comments to `TaskObjectConfig.x/y/rotation` explaining they are the reconstruction initial pose.
- Modify `src/types/batch.ts`: add comments to `BatchObjectConfig.target`, `RelativeTargetState`, and `AbsoluteTargetState` explaining target semantics.
- Modify `src/schemas/batch.schema.test.ts`: add a schema-level test proving a variable object may have an initial pose that differs from `target.absolute`, and that `target.relative` expresses the step delta from that initial pose.
- Modify `protocol/schemas/layouttask.batch.schema.json`: add `description` text for `object.x/y/rotation`, `target`, `relativeTarget`, and `absoluteTarget`. Do not change validation shape.
- Modify `protocol/rhino.md`: add a dedicated “Initial State vs Target State” section and update Object Fields and Scoring Targets wording.
- Modify `protocol/README.md`: mention the initial/target semantics as a key protocol rule.
- Modify `protocol/templates/rhino-batch-template.json`: make the variable object template use a nonzero initial-to-target example so the semantics are visible.
- Modify `protocol/templates/rhino-export-checklist.md`: add explicit checks for variable initial pose, target absolute pose, and target relative delta.
- Modify `protocol/templates/rhino-asset-package-template.md`: add one short note that 1:1 asset dimensions must match the same world units used by initial and target poses.
- Modify `protocol/examples/scoring-example.json`: add `initial_state_label` and keep the nonzero target example explicit.
- Modify `protocol/examples/full-preview-collision/batch.json`: add `role: "variable"` and `initial_state_label` to the movable object so full demos model the same semantics.

## Task 1: Lock Existing Semantics In Type Comments And Tests

**Files:**
- Modify: `src/types/config.ts`
- Modify: `src/types/batch.ts`
- Test: `src/schemas/batch.schema.test.ts`

- [ ] **Step 1: Add an explicit schema test for initial/target separation**

Add this test inside the existing `describe("batchSchema", ...)` block in `src/schemas/batch.schema.test.ts`, near the current target tests:

```ts
  it("treats object x/y/rotation as reconstruction initial pose and target as correct pose", () => {
    const batch = cloneMinimalBatch();
    batch.trials[0].objects[0] = {
      ...batch.trials[0].objects[0],
      x: 100,
      y: 150,
      rotation: 0,
      target: {
        relative: { dx_steps: 1, dy_steps: -2, rotation_steps: 1 },
        absolute: { x: 125, y: 100, rotation_deg: 45 },
      },
    };

    const object = batchSchema.parse(batch).trials[0].objects[0];

    expect(object.x).toBe(100);
    expect(object.y).toBe(150);
    expect(object.rotation).toBe(0);
    expect(object.target).toEqual({
      relative: { dx_steps: 1, dy_steps: -2, rotation_steps: 1 },
      absolute: { x: 125, y: 100, rotation_deg: 45 },
    });
  });
```

- [ ] **Step 2: Run the targeted test and verify it passes**

Run:

```bash
pixi run test src/schemas/batch.schema.test.ts
```

Expected: PASS. This test should pass before implementation because it documents existing behavior.

- [ ] **Step 3: Add TypeScript comments to authoring/runtime types**

In `src/types/config.ts`, update `TaskObjectConfig` with comments:

```ts
export interface TaskObjectConfig {
  id: string;
  asset: string;
  /** Reconstruction initial anchor x in world units. */
  x: number;
  /** Reconstruction initial anchor y in world units. */
  y: number;
  /** Reconstruction initial clockwise rotation in degrees. */
  rotation?: number;
  width?: number;
  height?: number;
  anchor?: Anchor;
  behavior: TaskObjectBehaviorConfig;
  collision?: ObjectCollisionConfig;
}
```

In `src/types/batch.ts`, update the scoring-related interfaces with comments:

```ts
export interface BatchObjectConfig extends TaskObjectConfig {
  role?: ObjectRole;
  group_id?: string;
  /** Optional authoring label for the reconstruction initial pose stored in x/y/rotation. */
  initial_state_label?: string;
  /** Correct answer pose for analysis; usually the pose shown in the memory stimulus. */
  target?: ObjectTargetState;
  scoring?: ObjectScoringConfig;
}

export interface RelativeTargetState {
  /** Signed movement steps from the reconstruction initial x to the correct target x. */
  dx_steps: number;
  /** Signed movement steps from the reconstruction initial y to the correct target y. */
  dy_steps: number;
  /** Signed rotation steps from the reconstruction initial rotation to the correct target rotation. */
  rotation_steps: number;
}

export interface AbsoluteTargetState {
  /** Correct target anchor x in world units, usually exported from the stimulus scene. */
  x: number;
  /** Correct target anchor y in world units, usually exported from the stimulus scene. */
  y: number;
  /** Correct target clockwise rotation in degrees, usually exported from the stimulus scene. */
  rotation_deg: number;
}
```

- [ ] **Step 4: Run the targeted test again**

Run:

```bash
pixi run test src/schemas/batch.schema.test.ts
```

Expected: PASS.

## Task 2: Add Schema Descriptions Without Changing Validation

**Files:**
- Modify: `protocol/schemas/layouttask.batch.schema.json`
- Test: `src/schemas/batch.schema.test.ts`

- [ ] **Step 1: Add JSON Schema descriptions for target semantics**

In `protocol/schemas/layouttask.batch.schema.json`, add descriptions to the existing definitions. Keep every `type`, `required`, `oneOf`, and `properties` rule unchanged.

For `relativeTarget`, use:

```json
"relativeTarget": {
  "description": "Correct answer expressed as signed movement/rotation steps from the reconstruction initial pose stored in object x/y/rotation.",
  "type": "object",
  "required": ["dx_steps", "dy_steps", "rotation_steps"],
```

For `absoluteTarget`, use:

```json
"absoluteTarget": {
  "description": "Correct answer pose in world units/degrees, usually the object pose shown in the memory stimulus.",
  "type": "object",
  "required": ["x", "y", "rotation_deg"],
```

For `objectTarget`, use:

```json
"objectTarget": {
  "description": "Correct answer state for scoring. It is separate from object x/y/rotation, which define the reconstruction initial pose.",
  "type": "object",
```

For `object.properties.x/y/rotation`, add:

```json
"x": {
  "description": "Reconstruction initial anchor x in world units.",
  "type": "number"
},
"y": {
  "description": "Reconstruction initial anchor y in world units.",
  "type": "number"
},
"rotation": {
  "description": "Reconstruction initial clockwise rotation in degrees.",
  "type": "number"
},
```

For `object.properties.initial_state_label`, add:

```json
"initial_state_label": {
  "description": "Optional authoring label for the reconstruction initial pose stored in x/y/rotation.",
  "$ref": "#/$defs/nonEmptyString"
},
```

For `object.properties.target`, add:

```json
"target": {
  "description": "Correct answer state for variable objects; fixed objects usually have no separate target because their initial pose already matches the stimulus.",
  "$ref": "#/$defs/objectTarget"
},
```

- [ ] **Step 2: Validate the JSON Schema file still parses**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('protocol/schemas/layouttask.batch.schema.json','utf8')); console.log('schema json ok')"
```

Expected output includes:

```text
schema json ok
```

- [ ] **Step 3: Run batch schema tests**

Run:

```bash
pixi run test src/schemas/batch.schema.test.ts
```

Expected: PASS.

## Task 3: Update Rhino Protocol Documentation

**Files:**
- Modify: `protocol/rhino.md`
- Modify: `protocol/README.md`

- [ ] **Step 1: Add “Initial State vs Target State” to `protocol/rhino.md`**

Insert this section after `## World Units`:

```md
## Initial State vs Target State

Every object can have two different poses:

- Reconstruction initial pose: `objects[].x`, `objects[].y`, and `objects[].rotation`.
- Correct target pose: `objects[].target.absolute`, usually exported from the stimulus scene.

For `role: "fixed"` objects, the reconstruction initial pose usually already equals the correct target pose. Fixed objects are displayed as context and normally do not need a separate `target`.

For `role: "variable"` objects, the reconstruction initial pose is usually a displaced or rotated starting pose for the participant. The correct pose shown in the stimulus should be written to `target.absolute`. If the task uses step-based movement, also write `target.relative` as the signed step delta from the initial pose to the correct pose.

Rhino exporters should treat the designed stimulus scene as the source of truth for `target.absolute`. The generator may then derive each variable object's reconstruction initial pose by applying the planned offset/rotation perturbation, and write that perturbed pose into `x`, `y`, and `rotation`.
```

- [ ] **Step 2: Update Object Fields wording in `protocol/rhino.md`**

Replace the required/recommended bullets for position and rotation with:

```md
- `x`, `y`: reconstruction initial anchor position in world units.
- `behavior`: movement/rotation behavior.

Recommended:

- `rotation`: reconstruction initial clockwise rotation in degrees; defaults to `0` if omitted.
- `role`: `"fixed"` or `"variable"` for analysis/scoring. Fixed objects are context objects; variable objects are restored by the participant.
- `group_id`: optional grouping label such as `"chairs"`.
- `initial_state_label`: optional authoring label for the reconstruction initial pose.
- `target`: correct answer state for variable objects. Use `target.absolute` for the stimulus pose and `target.relative` for step deltas from the initial pose.
```

- [ ] **Step 3: Update Scoring Targets wording in `protocol/rhino.md`**

Replace the paragraph after the scoring target JSON with:

```md
Relative targets are expressed in movement/rotation steps from the reconstruction initial object pose (`x`, `y`, `rotation`) to the correct target pose. Absolute targets are correct final world coordinates and final rotation degrees, usually copied from the stimulus scene.

If both are available, export both. Relative targets make step-based scoring simple; absolute targets preserve the stimulus geometry and let analysts compute distance/angle errors later.
```

- [ ] **Step 4: Update `protocol/README.md`**

Add this short paragraph after the main file list:

```md
Important state rule: in batch objects, `x`, `y`, and `rotation` define the reconstruction initial pose shown to the participant. Correct answers belong in `target.absolute` and, for step tasks, `target.relative`.
```

- [ ] **Step 5: Review the docs for old ambiguous wording**

Run:

```bash
rg -n "initial anchor|final world|stimulus|target.absolute|target.relative|x`, `y`|x/y/rotation" protocol/rhino.md protocol/README.md
```

Expected: occurrences describe `x/y/rotation` as reconstruction initial pose and `target` as correct answer state.

## Task 4: Update Templates And Examples

**Files:**
- Modify: `protocol/templates/rhino-batch-template.json`
- Modify: `protocol/templates/rhino-export-checklist.md`
- Modify: `protocol/templates/rhino-asset-package-template.md`
- Modify: `protocol/examples/scoring-example.json`
- Modify: `protocol/examples/full-preview-collision/batch.json`

- [ ] **Step 1: Make the Rhino batch template show a nonzero initial-to-target delta**

In `protocol/templates/rhino-batch-template.json`, update the variable object so `x/y/rotation` are initial state and `target` is visibly different:

```json
          "x": 100,
          "y": 150,
          "rotation": 0,
          "initial_state_label": "reconstruction_start",
          "behavior": { "template": "drag25_rotate45_limited" },
          "collision": { "enabled": true, "shape": "box", "padding": 0 },
          "target": {
            "relative": { "dx_steps": 1, "dy_steps": -2, "rotation_steps": 1 },
            "absolute": { "x": 125, "y": 100, "rotation_deg": 45 }
          }
```

- [ ] **Step 2: Update the export checklist**

In `protocol/templates/rhino-export-checklist.md`, replace the current scoring/role bullets with these explicit checks:

```md
- [ ] Variable objects have `role: "variable"`.
- [ ] Fixed context objects have `role: "fixed"` or movement behavior set to `none`.
- [ ] For every variable object, `x`, `y`, and `rotation` are the reconstruction initial pose, not the stimulus-correct pose.
- [ ] For every scored variable object, `target.absolute` stores the correct stimulus pose.
- [ ] For every step-based scored variable object, `target.relative` stores signed steps from the initial pose to `target.absolute`.
```

- [ ] **Step 3: Add the 1:1 world-unit note to asset package template**

In `protocol/templates/rhino-asset-package-template.md`, add this rule:

```md
- For 1:1 Rhino/CAD exports, keep object `default_width/default_height`, trial `x/y/rotation`, `target.absolute`, `world.viewBox`, `grid.size`, and movement `step` in the same world units.
```

- [ ] **Step 4: Annotate scoring example initial state**

In `protocol/examples/scoring-example.json`, add `initial_state_label` to `chair_variable_01`:

```json
          "initial_state_label": "reconstruction_start",
```

Place it beside `group_id` or before `asset`.

- [ ] **Step 5: Annotate the full preview collision movable object**

In `protocol/examples/full-preview-collision/batch.json`, update `chair_01`:

```json
          "id": "chair_01",
          "role": "variable",
          "initial_state_label": "reconstruction_start",
          "asset": "full_chair",
```

- [ ] **Step 6: Validate the edited JSON files**

Run:

```bash
node -e "for (const f of ['protocol/templates/rhino-batch-template.json','protocol/examples/scoring-example.json','protocol/examples/full-preview-collision/batch.json']) { JSON.parse(require('fs').readFileSync(f,'utf8')); console.log(f, 'ok'); }"
```

Expected output includes `ok` for all three files.

## Task 5: Validate Compiler And Protocol Fixtures

**Files:**
- Test existing generated protocol fixtures.

- [ ] **Step 1: Run schema tests**

Run:

```bash
pixi run test src/schemas/batch.schema.test.ts src/core/batch-compiler.test.ts
```

Expected: PASS.

- [ ] **Step 2: Validate protocol examples**

Run:

```bash
pixi run validate-batch protocol/examples/minimal-batch.json
pixi run validate-batch protocol/examples/scoring-example.json
pixi run validate-batch protocol/examples/full-preview-collision/batch.json
```

Expected: each command exits 0.

- [ ] **Step 3: Compile the full preview collision example**

Run:

```bash
pixi run compile-batch protocol/examples/full-preview-collision/batch.json --out .tmp/full-preview-collision-compiled
```

Expected: exits 0 and writes `manifest.json`, `tasks/full_preview_collision_001.json`, `scoring/scoring-reference.json`, and `generation-report.json`.

- [ ] **Step 4: Run full regression**

Run:

```bash
pixi run test
pixi run build
```

Expected: both commands pass.

## Task 6: Commit The Protocol Semantics Update

**Files:**
- All modified files from Tasks 1-5.

- [ ] **Step 1: Review the diff**

Run:

```bash
git diff -- src/types/config.ts src/types/batch.ts src/schemas/batch.schema.test.ts protocol/schemas/layouttask.batch.schema.json protocol/rhino.md protocol/README.md protocol/templates/rhino-batch-template.json protocol/templates/rhino-export-checklist.md protocol/templates/rhino-asset-package-template.md protocol/examples/scoring-example.json protocol/examples/full-preview-collision/batch.json
```

Expected: diff contains only semantic comments, schema descriptions, docs, and example clarifications. No runtime task JSON or generated output should be committed.

- [ ] **Step 2: Check status**

Run:

```bash
git status --short
```

Expected: only intended source/docs/protocol files are modified plus this plan file.

- [ ] **Step 3: Commit**

Run:

```bash
git add docs/superpowers/plans/2026-06-18-initial-target-semantics.md src/types/config.ts src/types/batch.ts src/schemas/batch.schema.test.ts protocol/schemas/layouttask.batch.schema.json protocol/rhino.md protocol/README.md protocol/templates/rhino-batch-template.json protocol/templates/rhino-export-checklist.md protocol/templates/rhino-asset-package-template.md protocol/examples/scoring-example.json protocol/examples/full-preview-collision/batch.json
git commit -m "docs: clarify initial and target state semantics"
```

Expected: commit succeeds.

## Self-Review

- Spec coverage: The plan covers the requested semantic clarification, all affected docs, schema descriptions, templates, examples, type comments, tests, and validation.
- Placeholder scan: No TBD/TODO placeholders remain.
- Type consistency: The plan uses existing field names only: `x`, `y`, `rotation`, `initial_state_label`, `target.relative`, and `target.absolute`.
- Scope check: No new `initial` object is introduced. That keeps the change small and avoids migration risk.
