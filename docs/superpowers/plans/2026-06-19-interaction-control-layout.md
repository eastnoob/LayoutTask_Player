# Interaction Control Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make static context objects non-selectable and place object controls with size-aware, edge-clamped positions.

**Architecture:** Add small pure interaction/layout helpers to `src/core/renderer.ts`, reuse them from renderer DOM setup and `InteractionController`, and cover the behavior with focused unit tests. Keep this as a player-level change with no protocol, Rhino adaptor, scoring, or collision schema changes.

**Tech Stack:** TypeScript, Vitest, existing SVG renderer, existing `RuntimeTaskConfig` / `RuntimeTaskObject` types.

---

## File Structure

- Modify: `src/core/renderer.ts`
  - Export `isObjectInteractive`, `getObjectControlLayout`, and `clampControlPoint`.
  - Add `ControlButtonAction` as the subset of `LayoutAction` that has SVG controls.
  - Use `isObjectInteractive` when creating object DOM affordances.
  - Use `getObjectControlLayout` in `updateControlsLayout`.
- Modify: `src/core/interaction-controller.ts`
  - Import `isObjectInteractive`.
  - Gate `selectObject` so static context objects cannot become active.
- Modify: `src/core/renderer.test.ts`
  - Add pure helper tests for interactivity, size-aware gaps, and edge clamping.
- Modify: `src/core/interaction-controller.test.ts`
  - Add controller tests proving static context selection is ignored and variable selection still works.
- Modify: `README.md`
  - Add a short player behavior note: objects without movement or rotation are passive context; controls are auto-placed and clamped.

---

### Task 1: Renderer Helper Tests

**Files:**
- Modify: `src/core/renderer.test.ts`

- [ ] **Step 1: Import the new helpers before implementation**

Change the import block at the top of `src/core/renderer.test.ts` from:

```ts
import { getConfiguredObjectLocalRect, getRotatedVisualBounds, getStageFitStyle, getStageUiMetrics } from "./renderer";
```

to:

```ts
import {
  clampControlPoint,
  getConfiguredObjectLocalRect,
  getObjectControlLayout,
  getRotatedVisualBounds,
  getStageFitStyle,
  getStageUiMetrics,
  isObjectInteractive,
} from "./renderer";
```

- [ ] **Step 2: Add failing tests for static and interactive objects**

Append this test block to `src/core/renderer.test.ts`:

```ts
describe("LayoutTaskRenderer object interactivity", () => {
  it("treats objects without movement or rotation as static context", () => {
    const config = createRuntimeConfig();
    const staticObject = {
      ...config.objects[0],
      behavior: {
        movement: { mode: "none" as const },
        free_drag: { enabled: false },
      },
    };

    expect(isObjectInteractive(staticObject)).toBe(false);
  });

  it("treats button, drag, and rotation-only objects as interactive", () => {
    const config = createRuntimeConfig();
    const baseObject = config.objects[0];

    expect(isObjectInteractive(baseObject)).toBe(true);

    expect(
      isObjectInteractive({
        ...baseObject,
        behavior: {
          movement: { mode: "drag", step: 25 },
          free_drag: { enabled: true },
        },
      }),
    ).toBe(true);

    expect(
      isObjectInteractive({
        ...baseObject,
        behavior: {
          movement: { mode: "none" },
          rotation: { step: 90 },
          free_drag: { enabled: false },
        },
      }),
    ).toBe(true);
  });
});
```

- [ ] **Step 3: Add failing tests for size-aware control layout and edge clamping**

Append this test block to `src/core/renderer.test.ts`:

```ts
describe("LayoutTaskRenderer control layout", () => {
  it("keeps controls closer to small objects than the legacy fixed gap", () => {
    const config = createRuntimeConfig();
    const ui = getStageUiMetrics(config);
    const bounds = { minX: -10, maxX: 10, minY: -10, maxY: 10 };

    const layout = getObjectControlLayout({
      bounds,
      ui,
      viewBox: config.world.viewBox,
    });

    expect(layout.move_right.x - bounds.maxX).toBeLessThan(ui.controlGap);
    expect(layout.move_right.x - bounds.maxX).toBeGreaterThanOrEqual(20 * ui.scale);
  });

  it("places rotation controls farther from the object than movement controls", () => {
    const config = createRuntimeConfig();
    const ui = getStageUiMetrics(config);
    const bounds = { minX: -50, maxX: 50, minY: -40, maxY: 40 };

    const layout = getObjectControlLayout({
      bounds,
      ui,
      viewBox: config.world.viewBox,
    });

    expect(bounds.minY - layout.rotate_ccw.y).toBeGreaterThan(bounds.minY - layout.move_up.y);
    expect(layout.rotate_cw.x - bounds.maxX).toBeGreaterThan(layout.move_right.x - bounds.maxX);
  });

  it("clamps controls inside the stage viewBox near edges", () => {
    const config = createRuntimeConfig();
    const ui = getStageUiMetrics(config);
    const bounds = { minX: 470, maxX: 500, minY: -10, maxY: 10 };

    const layout = getObjectControlLayout({
      bounds,
      ui,
      viewBox: config.world.viewBox,
    });

    const maxControlX = config.world.viewBox.x + config.world.viewBox.width - ui.controlRadius - 8 * ui.scale;
    expect(layout.move_right.x).toBe(maxControlX);
    expect(layout.rotate_cw.x).toBe(maxControlX);
  });

  it("does not move controls away from their expected positions when far from edges", () => {
    const config = createRuntimeConfig();
    const ui = getStageUiMetrics(config);
    const bounds = { minX: -50, maxX: 50, minY: -40, maxY: 40 };

    const layout = getObjectControlLayout({
      bounds,
      ui,
      viewBox: config.world.viewBox,
    });

    expect(layout.move_up.x).toBe(0);
    expect(layout.move_down.x).toBe(0);
    expect(layout.move_left.y).toBe(0);
    expect(layout.move_right.y).toBe(0);
  });

  it("returns the original point when clamping has no valid finite viewBox", () => {
    expect(
      clampControlPoint(
        { x: 999, y: 999 },
        { x: 0, y: 0, width: 0, height: 0 },
        10,
      ),
    ).toEqual({ x: 999, y: 999 });
  });
});
```

- [ ] **Step 4: Run renderer tests and verify the expected failure**

Run:

```bash
npm run test -- src/core/renderer.test.ts
```

Expected: FAIL because `clampControlPoint`, `getObjectControlLayout`, and `isObjectInteractive` are not exported yet.

---

### Task 2: Renderer Helpers and DOM Affordance Gate

**Files:**
- Modify: `src/core/renderer.ts`
- Test: `src/core/renderer.test.ts`

- [ ] **Step 1: Add `RuntimeTaskObject` to renderer type imports**

Change the first import in `src/core/renderer.ts` from:

```ts
import type { RuntimeTaskConfig } from "../types/runtime";
```

to:

```ts
import type { RuntimeTaskConfig, RuntimeTaskObject } from "../types/runtime";
```

- [ ] **Step 2: Add helper interfaces near `LocalRect`**

After the existing `interface LocalRect` block, add:

```ts
interface VisualBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface ControlLayoutInput {
  bounds: VisualBounds;
  ui: ReturnType<typeof getStageUiMetrics>;
  viewBox?: { x: number; y: number; width: number; height: number };
}

type ControlButtonAction = Exclude<LayoutAction, "drag_start" | "drag_move" | "drag_end">;
```

If `VisualBounds` already exists after implementation work starts, reuse the existing type and do not duplicate it.

- [ ] **Step 3: Export `isObjectInteractive` near the other exported pure helpers**

Add this function before `getStageFitStyle`:

```ts
export function isObjectInteractive(objectConfig: RuntimeTaskObject): boolean {
  const movement = objectConfig.behavior.movement;
  const hasButtonMovement = movement.mode === "button";
  const hasDragMovement = movement.mode === "drag" && objectConfig.behavior.free_drag.enabled;
  const hasRotation = objectConfig.behavior.rotation?.step !== undefined;
  return hasButtonMovement || hasDragMovement || hasRotation;
}
```

- [ ] **Step 4: Export `clampControlPoint` and `getObjectControlLayout`**

Add these functions before `getStageFitStyle`:

```ts
export function clampControlPoint(
  point: { x: number; y: number },
  viewBox: { x: number; y: number; width: number; height: number } | undefined,
  inset: number,
): { x: number; y: number } {
  if (
    !viewBox ||
    !Number.isFinite(viewBox.x) ||
    !Number.isFinite(viewBox.y) ||
    !Number.isFinite(viewBox.width) ||
    !Number.isFinite(viewBox.height) ||
    viewBox.width <= inset * 2 ||
    viewBox.height <= inset * 2
  ) {
    return point;
  }

  const minX = viewBox.x + inset;
  const maxX = viewBox.x + viewBox.width - inset;
  const minY = viewBox.y + inset;
  const maxY = viewBox.y + viewBox.height - inset;

  return {
    x: Math.min(Math.max(point.x, minX), maxX),
    y: Math.min(Math.max(point.y, minY), maxY),
  };
}

export function getObjectControlLayout(input: ControlLayoutInput): Record<ControlButtonAction, { x: number; y: number }> {
  const { bounds, ui, viewBox } = input;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const width = Math.max(bounds.maxX - bounds.minX, 0);
  const height = Math.max(bounds.maxY - bounds.minY, 0);
  const shortSide = Math.min(width, height);

  const moveGap = clamp(shortSide * 0.22, 20 * ui.scale, 44 * ui.scale);
  const rotateGap = clamp(shortSide * 0.28, 28 * ui.scale, 56 * ui.scale);
  const inset = ui.controlRadius + 8 * ui.scale;

  const positions: Record<ControlButtonAction, { x: number; y: number }> = {
    move_up: { x: centerX, y: bounds.minY - moveGap },
    move_down: { x: centerX, y: bounds.maxY + moveGap },
    move_left: { x: bounds.minX - moveGap, y: centerY },
    move_right: { x: bounds.maxX + moveGap, y: centerY },
    rotate_ccw: { x: bounds.minX - rotateGap, y: bounds.minY - rotateGap },
    rotate_cw: { x: bounds.maxX + rotateGap, y: bounds.minY - rotateGap },
  };

  return {
    move_up: clampControlPoint(positions.move_up, viewBox, inset),
    move_down: clampControlPoint(positions.move_down, viewBox, inset),
    move_left: clampControlPoint(positions.move_left, viewBox, inset),
    move_right: clampControlPoint(positions.move_right, viewBox, inset),
    rotate_ccw: clampControlPoint(positions.rotate_ccw, viewBox, inset),
    rotate_cw: clampControlPoint(positions.rotate_cw, viewBox, inset),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
```

- [ ] **Step 5: Gate object DOM affordances in `renderAll`**

Inside the object loop in `renderAll`, after `group.classList.add("layout-task-object");`, add:

```ts
const interactive = isObjectInteractive(objectConfig);
```

Replace the unconditional affordance block:

```ts
group.classList.toggle("is-draggable", objectConfig.behavior.movement.mode === "drag");
group.setAttribute("tabindex", "0");
group.setAttribute("role", "button");
group.setAttribute("aria-label", `${objectConfig.id} edit mode`);
group.addEventListener("click", (event) => {
  event.stopPropagation();
  this.options.onObjectSelect?.(objectConfig.id);
});
group.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  this.options.onObjectSelect?.(objectConfig.id);
});
group.addEventListener("pointerenter", () => {
  this.setObjectVisualHighlight(objectConfig.id, true);
});
group.addEventListener("pointerleave", () => {
  this.setObjectVisualHighlight(objectConfig.id, this.activeObjectId === objectConfig.id);
});
group.addEventListener("focus", () => {
  this.setObjectVisualHighlight(objectConfig.id, true);
});
group.addEventListener("blur", () => {
  this.setObjectVisualHighlight(objectConfig.id, this.activeObjectId === objectConfig.id);
});
this.bindObjectPointerEvents(group, objectConfig.id);
```

with:

```ts
group.classList.toggle("is-draggable", interactive && objectConfig.behavior.movement.mode === "drag");
group.classList.toggle("is-static-context", !interactive);

if (interactive) {
  group.setAttribute("tabindex", "0");
  group.setAttribute("role", "button");
  group.setAttribute("aria-label", `${objectConfig.id} edit mode`);
  group.addEventListener("click", (event) => {
    event.stopPropagation();
    this.options.onObjectSelect?.(objectConfig.id);
  });
  group.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.options.onObjectSelect?.(objectConfig.id);
  });
  group.addEventListener("pointerenter", () => {
    this.setObjectVisualHighlight(objectConfig.id, true);
  });
  group.addEventListener("pointerleave", () => {
    this.setObjectVisualHighlight(objectConfig.id, this.activeObjectId === objectConfig.id);
  });
  group.addEventListener("focus", () => {
    this.setObjectVisualHighlight(objectConfig.id, true);
  });
  group.addEventListener("blur", () => {
    this.setObjectVisualHighlight(objectConfig.id, this.activeObjectId === objectConfig.id);
  });
  this.bindObjectPointerEvents(group, objectConfig.id);
}
```

- [ ] **Step 6: Use `getObjectControlLayout` in `updateControlsLayout`**

Replace the local `centerX`, `centerY`, and `positions` construction inside `updateControlsLayout` with:

```ts
const positions = getObjectControlLayout({
  bounds,
  ui,
  viewBox: this.options.config.world.viewBox,
});
```

Keep the existing loop that applies transforms to available buttons.

- [ ] **Step 7: Run renderer tests**

Run:

```bash
npm run test -- src/core/renderer.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit renderer helpers**

Run:

```bash
git add src/core/renderer.ts src/core/renderer.test.ts
git commit -m "feat: place object controls adaptively"
```

---

### Task 3: Interaction Controller Selection Gate

**Files:**
- Modify: `src/core/interaction-controller.ts`
- Modify: `src/core/interaction-controller.test.ts`

- [ ] **Step 1: Add failing controller tests**

In `src/core/interaction-controller.test.ts`, after the `"applies actions only for the active object"` test, add:

```ts
  it("does not select static context objects", () => {
    const base = createRuntimeConfig();
    const config = createRuntimeConfig({
      objects: [
        {
          ...base.objects[0],
          behavior: {
            movement: { mode: "none" },
            free_drag: { enabled: false },
          },
        },
      ],
    });
    const store = new StateStore(config);
    const renderer = createRendererStub();
    const recorder = createRecorderStub();
    const controller = new InteractionController({
      config,
      store,
      renderer,
      recorder,
    });

    controller.bind();
    controller.selectObject("chair_01");

    expect(controller.getActiveObjectId()).toBeUndefined();
    expect(renderer.activateObject).not.toHaveBeenCalled();
    expect(renderer.updateControlsDisabled).not.toHaveBeenCalled();
  });

  it("still selects rotation-only objects", () => {
    const base = createRuntimeConfig();
    const config = createRuntimeConfig({
      objects: [
        {
          ...base.objects[0],
          behavior: {
            movement: { mode: "none" },
            rotation: { step: 90 },
            free_drag: { enabled: false },
          },
        },
      ],
    });
    const store = new StateStore(config);
    const renderer = createRendererStub();
    const recorder = createRecorderStub();
    const controller = new InteractionController({
      config,
      store,
      renderer,
      recorder,
    });

    controller.bind();
    controller.selectObject("chair_01");

    expect(controller.getActiveObjectId()).toBe("chair_01");
    expect(renderer.activateObject).toHaveBeenCalledWith("chair_01");
  });
```

- [ ] **Step 2: Run controller tests and verify the expected failure**

Run:

```bash
npm run test -- src/core/interaction-controller.test.ts
```

Expected: FAIL because static context objects can still be selected.

- [ ] **Step 3: Import helper in `interaction-controller.ts`**

Change:

```ts
import type { LayoutTaskRenderer, RendererPointer } from "./renderer";
```

to:

```ts
import { isObjectInteractive, type LayoutTaskRenderer, type RendererPointer } from "./renderer";
```

- [ ] **Step 4: Gate `selectObject`**

In `selectObject`, after the locked/bound guard:

```ts
    if (!this.bound || this.options.store.isLocked()) {
      return;
    }
```

add:

```ts
    const objectConfig = this.options.config.objects.find((item) => item.id === objectId);
    if (!objectConfig || !isObjectInteractive(objectConfig)) {
      return;
    }
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm run test -- src/core/interaction-controller.test.ts src/core/renderer.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit controller gate**

Run:

```bash
git add src/core/interaction-controller.ts src/core/interaction-controller.test.ts
git commit -m "feat: ignore static context selection"
```

---

### Task 4: Documentation Note

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Find the best existing section**

Run:

```bash
rg -n "Flow Modes|Protocol|interaction|controls|object" README.md
```

Expected: identify a nearby section about task/player behavior. Prefer adding the note near existing flow or protocol notes rather than creating a large new section.

- [ ] **Step 2: Add a concise behavior note**

Add this Markdown block to `README.md` near the relevant player behavior section:

```md
### Object interaction behavior

The player treats object interactivity as a behavior-level rule. Objects with no button movement, no enabled drag movement, and no rotation step are rendered as passive context: they stay visible and can still participate in collision checks, but they are not selectable and do not show controls.

Movement and rotation controls are placed from the object's rendered bounds. The gap scales with object size and control centers are clamped inside the stage viewBox, so small objects keep reachable controls and edge objects do not lose controls outside the visible stage.
```

- [ ] **Step 3: Commit docs**

Run:

```bash
git add README.md
git commit -m "docs: describe object interaction controls"
```

---

### Task 5: Full Verification

**Files:**
- No file edits expected.

- [ ] **Step 1: Run focused test set**

Run:

```bash
npm run test -- src/core/renderer.test.ts src/core/interaction-controller.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm run test
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Check git status**

Run:

```bash
git status --short
```

Expected: only pre-existing generated directories such as `output/` and `public/layout-task-generated-*` remain untracked.

- [ ] **Step 5: Optional manual preview**

If a browser check is needed, run:

```bash
pixi run serve-local
```

Open:

```text
http://127.0.0.1:5173/?base=/layout-task-generated-sg-output-2-self-contained/&task=scene_afa7ff5e4ecd&q=Q_scene_afa7ff5e4ecd
```

Expected:

- Fixed/context objects do not select or show controls.
- Variable objects still select normally.
- Small-object controls sit closer to the object.
- Controls near stage edges remain visible and clickable.
