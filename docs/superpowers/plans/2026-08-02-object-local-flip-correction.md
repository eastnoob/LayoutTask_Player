# Object Local Flip Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the corrected smallpack room orientation while stopping each furniture SVG from being vertically mirrored around its own center.

**Architecture:** The stage-level `display_flip_y` remains responsible for mapping Rhino/world space to the displayed room orientation. Object world poses stay untouched; only the object visual child receives a local `scale(1 -1)` compensation when the stage is flipped.

**Tech Stack:** TypeScript, SVG transforms, Vitest, existing `pixi` compile/validation commands.

---

## File Structure

- Modify: `src/core/renderer.ts`
  - Add `getObjectVisualDisplayTransform(config)`.
  - Apply that transform to the object visual wrapper created by `createObjectVisual()`.
- Modify: `src/core/renderer.test.ts`
  - Import the new helper.
  - Add focused tests for flip/no-flip visual compensation.
- Create output only during validation:
  - `public/layout-task-smallpack-0802-flipy-objectfix-compiled/`

## Task 1: Add the Failing Renderer Test

**Files:**
- Modify: `src/core/renderer.test.ts`

- [ ] **Step 1: Import the helper**

Change the renderer import near the top of `src/core/renderer.test.ts` to include `getObjectVisualDisplayTransform`:

```ts
import {
  getConfiguredObjectLocalRect,
  getObjectControlLayout,
  getObjectVisualDisplayTransform,
  getRotatedVisualBounds,
  getStageDisplayTransform,
  getStageFitStyle,
  getStageUiMetrics,
  isObjectInteractive,
} from "./renderer";
```

- [ ] **Step 2: Add the focused tests**

Add these tests inside `describe("LayoutTaskRenderer stage fit", () => { ... })`, after the existing `display_flip_y` stage-transform test:

```ts
  it("counter-flips object visuals when the stage display is flipped", () => {
    const config = createRuntimeConfig({
      stage: {
        ...createRuntimeConfig().stage,
        display_flip_y: true,
      },
    });

    expect(getObjectVisualDisplayTransform(config)).toBe("scale(1 -1)");
  });

  it("does not transform object visuals when the stage display is not flipped", () => {
    const config = createRuntimeConfig({
      stage: {
        ...createRuntimeConfig().stage,
        display_flip_y: false,
      },
    });

    expect(getObjectVisualDisplayTransform(config)).toBeUndefined();
  });
```

- [ ] **Step 3: Run the focused test and confirm it fails**

Run:

```powershell
npx vitest run src/core/renderer.test.ts
```

Expected: FAIL because `getObjectVisualDisplayTransform` is not exported yet.

## Task 2: Implement the Minimal Renderer Fix

**Files:**
- Modify: `src/core/renderer.ts`

- [ ] **Step 1: Apply the visual transform after visual creation**

In `src/core/renderer.ts`, immediately after the `const visual = this.createObjectVisual(...)` block and before `group.append(visual);`, add:

```ts
      const visualTransform = getObjectVisualDisplayTransform(this.options.config);
      if (visualTransform) {
        visual.setAttribute("transform", visualTransform);
      }
```

The result should look like:

```ts
      const visual = this.createObjectVisual(
        objectConfig.id,
        objectConfig.asset.srcResolved,
        objectConfig.width,
        objectConfig.height,
        objectConfig.anchor,
        objectConfig.asset.inlineSvgText,
        defs,
      );
      const visualTransform = getObjectVisualDisplayTransform(this.options.config);
      if (visualTransform) {
        visual.setAttribute("transform", visualTransform);
      }
      group.append(visual);
```

- [ ] **Step 2: Add the exported helper**

In `src/core/renderer.ts`, place this function near `getStageDisplayTransform()`:

```ts
export function getObjectVisualDisplayTransform(config: RuntimeTaskConfig): string | undefined {
  return config.stage.display_flip_y ? "scale(1 -1)" : undefined;
}
```

- [ ] **Step 3: Run the renderer test**

Run:

```powershell
npx vitest run src/core/renderer.test.ts
```

Expected: PASS.

## Task 3: Verify Build and Runtime Package

**Files:**
- Read/use: `.tmp/smallpack-0802-flipy-source/batch.json`
- Create: `public/layout-task-smallpack-0802-flipy-objectfix-compiled/`

- [ ] **Step 1: Run production build**

Run:

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 2: Compile a separate comparison package**

Run:

```powershell
pixi run compile-batch .tmp\smallpack-0802-flipy-source\batch.json --out public\layout-task-smallpack-0802-flipy-objectfix-compiled
```

Expected: command completes and writes `manifest.json`.

- [ ] **Step 3: Copy required runtime assets**

Run:

```powershell
Copy-Item "D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\sg_output_260727_smallPack\assets" "public\layout-task-smallpack-0802-flipy-objectfix-compiled" -Recurse -Force
Get-ChildItem ".tmp\smallpack-0802-flipy-source\assets" -Filter "*.json" -File | Copy-Item -Destination "public\layout-task-smallpack-0802-flipy-objectfix-compiled\assets" -Force
Copy-Item ".tmp\smallpack-0802-flipy-source\behaviors" "public\layout-task-smallpack-0802-flipy-objectfix-compiled" -Recurse -Force
```

Expected: `public/layout-task-smallpack-0802-flipy-objectfix-compiled/assets/` contains SVG/image assets plus JSON asset metadata.

- [ ] **Step 4: Validate the runtime package**

Run:

```powershell
pixi run validate-runtime-package --base public\layout-task-smallpack-0802-flipy-objectfix-compiled --check-targets
```

Expected: PASS with no variable target failures.

## Task 4: Visual Check URL

**Files:**
- Read/use: `public/layout-task-smallpack-0802-flipy-objectfix-compiled/manifest.json`

- [ ] **Step 1: Open the comparison scene**

Use:

```text
http://127.0.0.1:5173/?base=/layout-task-smallpack-0802-flipy-objectfix-compiled/&task=scene_8106c07115ae&q=Q_scene_8106c07115ae
```

Expected visual result:

- Room/background stays in the same orientation as `layout-task-smallpack-0802-flipy-compiled`.
- Five furniture group centers stay in the same displayed slots.
- Each furniture asset is no longer upside-down inside its own group.
- The 45-degree furniture group remains rotated.
- Variables begin at `variable_initial_pose`; user interactions remain unapplied at compile time.

## Self-Review

- Spec coverage: covered renderer-only fix, no CSV/adaptor/Rhino edits, preserved world poses and runtime movement semantics.
- Placeholder scan: no placeholder steps.
- Type consistency: new helper uses existing `RuntimeTaskConfig` and mirrors `getStageDisplayTransform(config)` style.
