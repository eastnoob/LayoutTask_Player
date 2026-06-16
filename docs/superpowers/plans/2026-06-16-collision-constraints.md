# Collision Constraints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional discrete collision constraints so objects cannot move or rotate into walls, blocked regions, or other collision-enabled objects.

**Architecture:** Keep the Player static and lightweight. Collision is a deterministic state rule inside `StateStore`: every movement, drag, or rotation creates a candidate pose, then the collision engine accepts or blocks it. Collision areas are protocol data in world units, either inline JSON areas or a hidden SVG analysis layer containing only `rect` and `polygon` geometry.

**Tech Stack:** TypeScript, Zod, Vitest, existing config loader/runtime config patterns, pure geometry helpers, no physics engine.

---

## File Structure

Create:

- `src/core/collision-geometry.ts`  
  Pure polygon geometry: rect/polygon normalization, object footprint, point-in-convex-polygon, polygon intersection with SAT, and collision scene evaluation.

- `src/core/collision-geometry.test.ts`  
  Unit tests for object footprints, contain/block rules, object-object collisions, rotation collision, and edge-touch policy.

- `src/core/collision-svg.ts`  
  Limited SVG collision-layer parser for `<rect>` and `<polygon>` elements with `data-collision="contain|block"` or `data-layout-collision="contain|block"`.

- `src/core/collision-svg.test.ts`  
  Unit tests for parsing allowed SVG elements and rejecting/ignoring unsupported elements.

- `public/layout-task/assets/collision/room_collision_demo.svg`  
  Hidden collision analysis-layer fixture for manual and loader tests.

- `public/layout-task/assets/backgrounds/collision_demo_bg.svg`  
  Synthetic visual room background matching the collision demo world.

- `public/layout-task/assets/objects/collision_demo_chair.svg`  
  Synthetic movable chair asset with a simple 50x50 centered footprint.

- `public/layout-task/assets/objects/collision_demo_table.svg`  
  Synthetic fixed table asset with a simple 75x75 centered footprint.

- `public/layout-task/tasks/room_collision_demo.json`  
  Demo task that exercises contain + block + object-object collision.

Synthetic test fixtures:

- All collision verification uses synthetic geometry first: a square/rectangular walkable room, one central blocked rectangle, one movable chair box, and one fixed table box.
- The synthetic fixture is intentionally simple enough to compute by hand. This prevents failures from being hidden inside real Rhino export complexity, visual SVG artwork, or background-image scaling.
- Existing room assets are only used for regression after the synthetic collision path passes.
- Rhino-generated collision layers are documented as protocol targets, but the first implementation and tests do not require Rhino.

Modify:

- `public/layout-task/assets/backgrounds.json`  
  Add the synthetic collision demo background asset.

- `public/layout-task/assets/objects.json`  
  Add the synthetic collision demo object assets.

- `src/types/config.ts`  
  Add authoring collision config types at task and object level.

- `src/types/runtime.ts`  
  Add resolved runtime collision config and resolved SVG source text.

- `src/types/events.ts`  
  Add `"collision"` blocked reason.

- `src/schemas/config.schema.ts`  
  Validate collision areas, SVG source, and object collision options.

- `src/schemas/result.schema.ts`  
  Accept `"collision"` in recorded blocked events.

- `src/core/autosave-service.ts`  
  Accept `"collision"` blocked reason when validating draft events.

- `src/core/config-loader.ts`  
  Resolve collision defaults and fetch/parse SVG collision source.

- `src/core/state-store.ts`  
  Integrate candidate-pose collision checks into button movement, rotation, and drag.

- `src/core/interaction-controller.ts`  
  Record and display collision blocking as a normal blocked action.

- `src/core/renderer.ts`  
  Reuse existing limit feedback UI for collision feedback; no visual collision overlay in v1.

- `src/core/state-store.test.ts`  
  Add behavior tests proving collision blocks candidate poses without mutating state.

- `src/core/interaction-controller.test.ts`  
  Add recorded blocked collision event coverage.

- `src/core/config-loader.test.ts`  
  Add runtime resolution tests for inline areas and SVG source areas.

- `src/schemas/config.schema.test.ts`  
  Add schema tests for collision authoring formats.

- `src/schemas/result.schema.test.ts`  
  Add blocked reason schema coverage.

- `protocol/rhino.md`  
  Document collision protocol: contain areas, block areas, SVG analysis layer, convexity requirement, path rules, and common Rhino export guidance.

- `protocol/schemas/layouttask.batch.schema.json`  
  Add language-neutral structural validation for collision config.

- `protocol/templates/rhino-batch-template.json`  
  Add a minimal collision example.

- `protocol/templates/rhino-export-checklist.md`  
  Add collision layer checks.

- `README.md`  
  Add a short pointer to collision protocol and optional demo task.

---

### Task 1: Collision Types And Schemas

**Files:**

- Modify: `src/types/config.ts`
- Modify: `src/types/runtime.ts`
- Modify: `src/schemas/config.schema.ts`
- Modify: `src/schemas/config.schema.test.ts`
- Modify: `src/types/events.ts`
- Modify: `src/schemas/result.schema.ts`
- Modify: `src/schemas/result.schema.test.ts`
- Modify: `src/core/autosave-service.ts`
- Test: `src/schemas/config.schema.test.ts`, `src/schemas/result.schema.test.ts`, `src/core/autosave-service.test.ts`

- [ ] **Step 1: Add failing config schema tests**

Append these tests to `src/schemas/config.schema.test.ts`:

```ts
it("accepts inline collision contain and block areas", () => {
  const task = createMinimalTask();
  task.collision = {
    enabled: true,
    mode: "discrete",
    areas: [
      {
        id: "room_walkable",
        type: "contain",
        shape: "polygon",
        points: [
          { x: 0, y: 0 },
          { x: 1000, y: 0 },
          { x: 1000, y: 1000 },
          { x: 0, y: 1000 },
        ],
      },
      {
        id: "pillar_01",
        type: "block",
        shape: "rect",
        x: 400,
        y: 400,
        width: 100,
        height: 100,
      },
    ],
  };
  task.objects[0].collision = { enabled: true, shape: "box", padding: 0 };

  const parsed = taskSchema.parse(task);

  expect(parsed.collision?.enabled).toBe(true);
  expect(parsed.collision?.areas).toHaveLength(2);
  expect(parsed.objects[0].collision).toEqual({ enabled: true, shape: "box", padding: 0 });
});

it("accepts an SVG collision source", () => {
  const task = createMinimalTask();
  task.collision = {
    enabled: true,
    source: {
      type: "svg",
      src: "assets/collision/room_collision.svg",
    },
  };

  expect(taskSchema.parse(task).collision?.source).toEqual({
    type: "svg",
    src: "assets/collision/room_collision.svg",
  });
});

it("rejects invalid collision polygons", () => {
  const task = createMinimalTask();
  task.collision = {
    enabled: true,
    areas: [
      {
        id: "bad_poly",
        type: "contain",
        shape: "polygon",
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
      },
    ],
  };

  expect(() => taskSchema.parse(task)).toThrow();
});
```

If `createMinimalTask()` does not exist in this test file, add this helper near the existing valid task fixture:

```ts
function createMinimalTask(): any {
  return {
    schema: "layouttask.task.v1",
    task_id: "room01",
    qid: "Q1",
    world: {
      viewBox: { x: 0, y: 0, width: 1000, height: 1000 },
      origin: { x: 0, y: 0 },
      grid: { size: 25, visible: true, snap: true },
    },
    background: { asset: "room_bg", x: 0, y: 0, width: 1000, height: 1000 },
    objects: [
      {
        id: "chair_01",
        asset: "chair_a",
        x: 100,
        y: 100,
        rotation: 0,
        behavior: { template: "drag25_rotate45_limited" },
      },
    ],
  };
}
```

- [ ] **Step 2: Run config schema tests and verify failure**

Run:

```bash
pixi run test src/schemas/config.schema.test.ts
```

Expected: FAIL because `collision` is not in `taskSchema` and `objects[].collision` is not in `taskObjectSchema`.

- [ ] **Step 3: Add authoring collision types**

In `src/types/config.ts`, add these types after `StageConfig`:

```ts
export type CollisionAreaType = "contain" | "block";
export type CollisionShape = "rect" | "polygon";

export interface CollisionPoint {
  x: number;
  y: number;
}

export interface CollisionRectArea {
  id: string;
  type: CollisionAreaType;
  shape: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CollisionPolygonArea {
  id: string;
  type: CollisionAreaType;
  shape: "polygon";
  points: CollisionPoint[];
}

export type CollisionAreaConfig = CollisionRectArea | CollisionPolygonArea;

export interface CollisionSourceConfig {
  type: "svg";
  src: string;
}

export interface TaskCollisionConfig {
  enabled?: boolean;
  mode?: "discrete";
  areas?: CollisionAreaConfig[];
  source?: CollisionSourceConfig;
}

export interface ObjectCollisionConfig {
  enabled?: boolean;
  shape?: "box";
  padding?: number;
}
```

Then add to `TaskObjectConfig`:

```ts
collision?: ObjectCollisionConfig;
```

And add to `TaskConfig`:

```ts
collision?: TaskCollisionConfig;
```

- [ ] **Step 4: Add runtime collision types**

In `src/types/runtime.ts`, import the new collision types:

```ts
  CollisionAreaConfig,
  CollisionSourceConfig,
  ObjectCollisionConfig,
```

Add these runtime interfaces before `RuntimeTaskConfig`:

```ts
export interface RuntimeCollisionSource extends CollisionSourceConfig, ResolvedAssetPath {
  inlineSvgText?: string;
}

export interface RuntimeCollisionConfig {
  enabled: boolean;
  mode: "discrete";
  areas: CollisionAreaConfig[];
  source?: RuntimeCollisionSource;
}
```

Add to `RuntimeTaskObject`:

```ts
collision: Required<ObjectCollisionConfig>;
```

Add to `RuntimeTaskConfig`:

```ts
collision: RuntimeCollisionConfig;
```

- [ ] **Step 5: Add collision schemas**

In `src/schemas/config.schema.ts`, add after `stageSchema`:

```ts
const collisionPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const collisionRectAreaSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["contain", "block"]),
  shape: z.literal("rect"),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive(),
  height: z.number().positive(),
});

const collisionPolygonAreaSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["contain", "block"]),
  shape: z.literal("polygon"),
  points: z.array(collisionPointSchema).min(3),
});

export const collisionAreaSchema = z.discriminatedUnion("shape", [
  collisionRectAreaSchema,
  collisionPolygonAreaSchema,
]);

export const collisionSourceSchema = z.object({
  type: z.literal("svg"),
  src: z.string().min(1),
});

export const taskCollisionSchema = z.object({
  enabled: z.boolean().default(false),
  mode: z.literal("discrete").default("discrete"),
  areas: z.array(collisionAreaSchema).default([]),
  source: collisionSourceSchema.optional(),
});

export const objectCollisionSchema = z.object({
  enabled: z.boolean().default(true),
  shape: z.literal("box").default("box"),
  padding: z.number().nonnegative().default(0),
});
```

Add `collision: objectCollisionSchema.optional()` to `taskObjectSchema`.

Add `collision: taskCollisionSchema.optional()` to `taskSchema`.

- [ ] **Step 6: Add blocked reason schema tests**

Append to `src/schemas/result.schema.test.ts`:

```ts
it("accepts collision as a blocked event reason", () => {
  const result = createMinimalResult();
  result.events = [
    {
      i: 0,
      t: 10,
      object: "chair_01",
      action: "move_right",
      valid: false,
      blocked_reason: "collision",
      before: { x: 100, y: 100, r: 0 },
      after: { x: 100, y: 100, r: 0 },
    },
  ];

  expect(resultSchema.parse(result).events?.[0].blocked_reason).toBe("collision");
});
```

If `createMinimalResult()` does not exist, clone the existing valid result fixture in that test file and only override `events`.

- [ ] **Step 7: Update blocked reason types and validators**

In `src/types/events.ts`, change:

```ts
blocked_reason?: "locked" | "limit_reached" | "movement_disabled" | "rotation_disabled";
```

to:

```ts
blocked_reason?: "locked" | "limit_reached" | "movement_disabled" | "rotation_disabled" | "collision";
```

In `src/schemas/result.schema.ts`, add `"collision"` to the `blocked_reason` enum.

In `src/core/autosave-service.ts`, update `isLayoutTaskEvent()` to accept:

```ts
value.blocked_reason === "collision"
```

- [ ] **Step 8: Run schema and autosave tests**

Run:

```bash
pixi run test src/schemas/config.schema.test.ts src/schemas/result.schema.test.ts src/core/autosave-service.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/types/config.ts src/types/runtime.ts src/schemas/config.schema.ts src/schemas/config.schema.test.ts src/types/events.ts src/schemas/result.schema.ts src/schemas/result.schema.test.ts src/core/autosave-service.ts
git commit -m "feat: add collision config schema"
```

---

### Task 2: Collision Geometry Engine

**Files:**

- Create: `src/core/collision-geometry.ts`
- Create: `src/core/collision-geometry.test.ts`

- [ ] **Step 1: Write failing geometry tests**

Create `src/core/collision-geometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  areaToPolygon,
  createObjectCollisionPolygon,
  doPolygonsIntersect,
  evaluateCollision,
  isPolygonInsidePolygon,
} from "./collision-geometry";
import type { RuntimeTaskObject } from "../types/runtime";

function createObject(overrides: Partial<RuntimeTaskObject>): RuntimeTaskObject {
  return {
    id: "chair_01",
    assetId: "chair_a",
    asset: {
      type: "svg",
      src: "assets/objects/chair.svg",
      srcResolved: "http://example.test/assets/objects/chair.svg",
      default_width: 100,
      default_height: 50,
      anchor: "center",
    },
    x: 0,
    y: 0,
    rotation: 0,
    width: 100,
    height: 50,
    anchor: "center",
    behavior: {
      movement: { mode: "button", step: 25, max_left: 10, max_right: 10, max_up: 10, max_down: 10 },
      rotation: { step: 45, max_cw: 8, max_ccw: 8 },
      free_drag: { enabled: false },
    },
    collision: { enabled: true, shape: "box", padding: 0 },
    ...overrides,
  };
}

describe("collision geometry", () => {
  it("converts rect areas to polygons", () => {
    expect(
      areaToPolygon({
        id: "block",
        type: "block",
        shape: "rect",
        x: 10,
        y: 20,
        width: 30,
        height: 40,
      }),
    ).toEqual([
      { x: 10, y: 20 },
      { x: 40, y: 20 },
      { x: 40, y: 60 },
      { x: 10, y: 60 },
    ]);
  });

  it("creates centered object polygons in world units", () => {
    const polygon = createObjectCollisionPolygon(
      createObject({ x: 100, y: 200, width: 100, height: 50 }),
      { x: 100, y: 200, r: 0 },
    );

    expect(polygon).toEqual([
      { x: 50, y: 175 },
      { x: 150, y: 175 },
      { x: 150, y: 225 },
      { x: 50, y: 225 },
    ]);
  });

  it("detects polygon intersection while allowing edge contact", () => {
    const a = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const touching = [
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
    ];
    const overlapping = [
      { x: 9, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 9, y: 10 },
    ];

    expect(doPolygonsIntersect(a, touching)).toBe(false);
    expect(doPolygonsIntersect(a, overlapping)).toBe(true);
  });

  it("checks that object vertices stay inside a contain polygon", () => {
    const room = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 300 },
      { x: 0, y: 300 },
    ];
    const inside = [
      { x: 50, y: 50 },
      { x: 100, y: 50 },
      { x: 100, y: 100 },
      { x: 50, y: 100 },
    ];
    const outside = [
      { x: -10, y: 50 },
      { x: 100, y: 50 },
      { x: 100, y: 100 },
      { x: -10, y: 100 },
    ];

    expect(isPolygonInsidePolygon(inside, room)).toBe(true);
    expect(isPolygonInsidePolygon(outside, room)).toBe(false);
  });

  it("blocks candidate poses outside contain areas", () => {
    const moving = createObject({ x: 50, y: 50, width: 100, height: 100 });
    const result = evaluateCollision({
      movingObject: moving,
      candidatePose: { x: -10, y: 50, r: 0 },
      objects: [moving],
      areas: [
        {
          id: "room",
          type: "contain",
          shape: "rect",
          x: 0,
          y: 0,
          width: 300,
          height: 300,
        },
      ],
      worldViewBox: { x: 0, y: 0, width: 300, height: 300 },
    });

    expect(result).toEqual({ ok: false, reason: "outside_contain", areaId: "room" });
  });

  it("blocks candidate poses that overlap block areas", () => {
    const moving = createObject({ x: 50, y: 50, width: 50, height: 50 });
    const result = evaluateCollision({
      movingObject: moving,
      candidatePose: { x: 100, y: 100, r: 0 },
      objects: [moving],
      areas: [
        {
          id: "pillar",
          type: "block",
          shape: "rect",
          x: 90,
          y: 90,
          width: 30,
          height: 30,
        },
      ],
      worldViewBox: { x: 0, y: 0, width: 300, height: 300 },
    });

    expect(result).toEqual({ ok: false, reason: "blocked_area", areaId: "pillar" });
  });

  it("blocks candidate poses that overlap another collision-enabled object", () => {
    const moving = createObject({ id: "chair_01", x: 50, y: 50, width: 50, height: 50 });
    const table = createObject({ id: "table_01", x: 100, y: 50, width: 50, height: 50 });
    const result = evaluateCollision({
      movingObject: moving,
      candidatePose: { x: 100, y: 50, r: 0 },
      objects: [moving, table],
      areas: [],
      worldViewBox: { x: 0, y: 0, width: 300, height: 300 },
    });

    expect(result).toEqual({ ok: false, reason: "object", objectId: "table_01" });
  });
});
```

- [ ] **Step 2: Run geometry tests and verify failure**

Run:

```bash
pixi run test src/core/collision-geometry.test.ts
```

Expected: FAIL because `collision-geometry.ts` does not exist.

- [ ] **Step 3: Implement collision geometry**

Create `src/core/collision-geometry.ts`:

```ts
import type { CollisionAreaConfig, ViewBox } from "../types/config";
import type { RuntimeTaskObject } from "../types/runtime";
import type { ObjectPose } from "../types/events";
import { normalizeRotation } from "../utils/geometry";

export interface CollisionPoint {
  x: number;
  y: number;
}

export type CollisionPolygon = CollisionPoint[];

export type CollisionResult =
  | { ok: true }
  | { ok: false; reason: "outside_contain"; areaId: string }
  | { ok: false; reason: "blocked_area"; areaId: string }
  | { ok: false; reason: "object"; objectId: string };

export interface EvaluateCollisionInput {
  movingObject: RuntimeTaskObject;
  candidatePose: ObjectPose;
  objects: RuntimeTaskObject[];
  objectPoses?: Record<string, ObjectPose>;
  areas: CollisionAreaConfig[];
  worldViewBox: ViewBox;
}

const EPSILON = 1e-9;

export function evaluateCollision(input: EvaluateCollisionInput): CollisionResult {
  if (!input.movingObject.collision.enabled) {
    return { ok: true };
  }

  const movingPolygon = createObjectCollisionPolygon(input.movingObject, input.candidatePose);
  const containAreas = input.areas.filter((area) => area.type === "contain");
  const blockAreas = input.areas.filter((area) => area.type === "block");
  const containPolygons =
    containAreas.length > 0
      ? containAreas.map((area) => ({ id: area.id, polygon: areaToPolygon(area) }))
      : [{ id: "__world_viewBox", polygon: viewBoxToPolygon(input.worldViewBox) }];

  const containingArea = containPolygons.find((area) => isPolygonInsidePolygon(movingPolygon, area.polygon));
  if (!containingArea) {
    return { ok: false, reason: "outside_contain", areaId: containPolygons[0]?.id ?? "__world_viewBox" };
  }

  for (const area of blockAreas) {
    if (doPolygonsIntersect(movingPolygon, areaToPolygon(area))) {
      return { ok: false, reason: "blocked_area", areaId: area.id };
    }
  }

  for (const object of input.objects) {
    if (object.id === input.movingObject.id || !object.collision.enabled) {
      continue;
    }

    const pose = input.objectPoses?.[object.id] ?? { x: object.x, y: object.y, r: object.rotation };
    if (doPolygonsIntersect(movingPolygon, createObjectCollisionPolygon(object, pose))) {
      return { ok: false, reason: "object", objectId: object.id };
    }
  }

  return { ok: true };
}

export function createObjectCollisionPolygon(object: RuntimeTaskObject, pose: ObjectPose): CollisionPolygon {
  const padding = object.collision.padding;
  const width = object.width + padding * 2;
  const height = object.height + padding * 2;
  const left = object.anchor === "top_left" ? 0 : -width / 2;
  const top = object.anchor === "top_left" ? 0 : -height / 2;
  const corners = [
    { x: left, y: top },
    { x: left + width, y: top },
    { x: left + width, y: top + height },
    { x: left, y: top + height },
  ];
  const angle = (normalizeRotation(pose.r) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return corners.map((point) => ({
    x: pose.x + point.x * cos - point.y * sin,
    y: pose.y + point.x * sin + point.y * cos,
  }));
}

export function areaToPolygon(area: CollisionAreaConfig): CollisionPolygon {
  if (area.shape === "polygon") {
    return area.points.map((point) => ({ x: point.x, y: point.y }));
  }

  return [
    { x: area.x, y: area.y },
    { x: area.x + area.width, y: area.y },
    { x: area.x + area.width, y: area.y + area.height },
    { x: area.x, y: area.y + area.height },
  ];
}

export function viewBoxToPolygon(viewBox: ViewBox): CollisionPolygon {
  return [
    { x: viewBox.x, y: viewBox.y },
    { x: viewBox.x + viewBox.width, y: viewBox.y },
    { x: viewBox.x + viewBox.width, y: viewBox.y + viewBox.height },
    { x: viewBox.x, y: viewBox.y + viewBox.height },
  ];
}

export function isPolygonInsidePolygon(inner: CollisionPolygon, outer: CollisionPolygon): boolean {
  return inner.every((point) => isPointInsideConvexPolygon(point, outer));
}

export function isPointInsideConvexPolygon(point: CollisionPoint, polygon: CollisionPolygon): boolean {
  let sign = 0;

  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const cross = crossProduct(a, b, point);

    if (Math.abs(cross) <= EPSILON) {
      continue;
    }

    const currentSign = Math.sign(cross);
    if (sign === 0) {
      sign = currentSign;
      continue;
    }

    if (sign !== currentSign) {
      return false;
    }
  }

  return true;
}

export function doPolygonsIntersect(a: CollisionPolygon, b: CollisionPolygon): boolean {
  return !hasSeparatingAxis(a, b) && !hasSeparatingAxis(b, a);
}

function hasSeparatingAxis(a: CollisionPolygon, b: CollisionPolygon): boolean {
  for (let index = 0; index < a.length; index += 1) {
    const p1 = a[index];
    const p2 = a[(index + 1) % a.length];
    const axis = { x: -(p2.y - p1.y), y: p2.x - p1.x };
    const projectionA = projectPolygon(a, axis);
    const projectionB = projectPolygon(b, axis);

    // Edge contact is allowed. Positive overlap is collision.
    if (projectionA.max <= projectionB.min + EPSILON || projectionB.max <= projectionA.min + EPSILON) {
      return true;
    }
  }

  return false;
}

function projectPolygon(polygon: CollisionPolygon, axis: CollisionPoint): { min: number; max: number } {
  const values = polygon.map((point) => point.x * axis.x + point.y * axis.y);
  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function crossProduct(a: CollisionPoint, b: CollisionPoint, point: CollisionPoint): number {
  return (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
}
```

- [ ] **Step 4: Run geometry tests**

Run:

```bash
pixi run test src/core/collision-geometry.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/collision-geometry.ts src/core/collision-geometry.test.ts
git commit -m "feat: add collision geometry engine"
```

---

### Task 3: SVG Collision Layer Parser

**Files:**

- Create: `src/core/collision-svg.ts`
- Create: `src/core/collision-svg.test.ts`

- [ ] **Step 1: Write failing SVG parser tests**

Create `src/core/collision-svg.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseCollisionSvg } from "./collision-svg";

describe("parseCollisionSvg", () => {
  it("parses rect and polygon collision elements", () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <rect id="room" data-collision="contain" x="0" y="0" width="400" height="300" />
        <polygon id="pillar" data-layout-collision="block" points="10,10 30,10 30,30 10,30" />
      </svg>
    `;

    expect(parseCollisionSvg(svg)).toEqual([
      { id: "room", type: "contain", shape: "rect", x: 0, y: 0, width: 400, height: 300 },
      {
        id: "pillar",
        type: "block",
        shape: "polygon",
        points: [
          { x: 10, y: 10 },
          { x: 30, y: 10 },
          { x: 30, y: 30 },
          { x: 10, y: 30 },
        ],
      },
    ]);
  });

  it("ignores visual SVG elements that have no collision marker", () => {
    const svg = `<svg><rect id="visual" x="0" y="0" width="10" height="10" /></svg>`;

    expect(parseCollisionSvg(svg)).toEqual([]);
  });

  it("throws a clear error for unsupported collision path elements", () => {
    const svg = `<svg><path id="wall" data-collision="block" d="M 0 0 L 10 10" /></svg>`;

    expect(() => parseCollisionSvg(svg)).toThrow("Unsupported collision SVG element: path#wall");
  });

  it("throws a clear error for polygons with fewer than three points", () => {
    const svg = `<svg><polygon id="bad" data-collision="block" points="0,0 10,0" /></svg>`;

    expect(() => parseCollisionSvg(svg)).toThrow("Collision polygon bad must contain at least 3 points");
  });
});
```

- [ ] **Step 2: Run SVG parser tests and verify failure**

Run:

```bash
pixi run test src/core/collision-svg.test.ts
```

Expected: FAIL because `collision-svg.ts` does not exist.

- [ ] **Step 3: Implement SVG parser**

Create `src/core/collision-svg.ts`:

```ts
import type { CollisionAreaConfig, CollisionAreaType } from "../types/config";

const collisionElementPattern = /<(?<tag>rect|polygon|path)\b(?<attrs>[^>]*)\/?>/gi;
const attributePattern = /(?<name>[A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*"(?<value>[^"]*)"/g;

export function parseCollisionSvg(svgText: string): CollisionAreaConfig[] {
  const areas: CollisionAreaConfig[] = [];

  for (const match of svgText.matchAll(collisionElementPattern)) {
    const tag = match.groups?.tag?.toLowerCase();
    const attrs = parseAttributes(match.groups?.attrs ?? "");
    const type = readCollisionType(attrs);

    if (!type) {
      continue;
    }

    const id = attrs.id || `${type}_${areas.length + 1}`;

    if (tag === "path") {
      throw new Error(`Unsupported collision SVG element: path#${id}`);
    }

    if (tag === "rect") {
      areas.push({
        id,
        type,
        shape: "rect",
        x: readNumber(attrs, "x", id),
        y: readNumber(attrs, "y", id),
        width: readPositiveNumber(attrs, "width", id),
        height: readPositiveNumber(attrs, "height", id),
      });
      continue;
    }

    if (tag === "polygon") {
      const points = parsePoints(attrs.points ?? "", id);
      areas.push({
        id,
        type,
        shape: "polygon",
        points,
      });
    }
  }

  return areas;
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};

  for (const match of raw.matchAll(attributePattern)) {
    const name = match.groups?.name;
    const value = match.groups?.value;
    if (name && value !== undefined) {
      attrs[name] = value;
    }
  }

  return attrs;
}

function readCollisionType(attrs: Record<string, string>): CollisionAreaType | undefined {
  const value = attrs["data-collision"] ?? attrs["data-layout-collision"];
  if (value === "contain" || value === "block") {
    return value;
  }
  return undefined;
}

function readNumber(attrs: Record<string, string>, name: string, id: string): number {
  const value = Number(attrs[name] ?? "0");
  if (!Number.isFinite(value)) {
    throw new Error(`Collision element ${id} has invalid ${name}`);
  }
  return value;
}

function readPositiveNumber(attrs: Record<string, string>, name: string, id: string): number {
  const value = readNumber(attrs, name, id);
  if (value <= 0) {
    throw new Error(`Collision element ${id} requires positive ${name}`);
  }
  return value;
}

function parsePoints(raw: string, id: string): Array<{ x: number; y: number }> {
  const values = raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error(`Collision polygon ${id} has invalid point '${pair}'`);
      }
      return { x, y };
    });

  if (values.length < 3) {
    throw new Error(`Collision polygon ${id} must contain at least 3 points`);
  }

  return values;
}
```

- [ ] **Step 4: Run SVG parser tests**

Run:

```bash
pixi run test src/core/collision-svg.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/collision-svg.ts src/core/collision-svg.test.ts
git commit -m "feat: parse collision svg layers"
```

---

### Task 4: Config Loader Runtime Resolution

**Files:**

- Modify: `src/core/config-loader.ts`
- Modify: `src/core/config-loader.test.ts`

- [ ] **Step 1: Add failing config loader tests**

Append to `src/core/config-loader.test.ts`:

```ts
it("resolves inline collision areas and object collision defaults", async () => {
  const loader = createLoaderWithFiles({
    "/layout-task/manifest.json": createManifest(),
    "/layout-task/tasks/room01.json": {
      ...createTask(),
      collision: {
        enabled: true,
        areas: [
          {
            id: "room",
            type: "contain",
            shape: "rect",
            x: 0,
            y: 0,
            width: 1000,
            height: 1000,
          },
        ],
      },
    },
    "/layout-task/assets/objects.json": createObjectLibrary(),
    "/layout-task/assets/backgrounds.json": createBackgroundLibrary(),
    "/layout-task/behaviors/behaviors.json": createBehaviorLibrary(),
  });

  const runtime = await loader.loadRuntimeConfig({ taskId: "room01" });

  expect(runtime.collision).toMatchObject({
    enabled: true,
    mode: "discrete",
    areas: [
      {
        id: "room",
        type: "contain",
        shape: "rect",
        x: 0,
        y: 0,
        width: 1000,
        height: 1000,
      },
    ],
  });
  expect(runtime.objects[0].collision).toEqual({ enabled: true, shape: "box", padding: 0 });
});

it("fetches SVG collision source and appends parsed areas", async () => {
  const loader = createLoaderWithFiles({
    "/layout-task/manifest.json": createManifest(),
    "/layout-task/tasks/room01.json": {
      ...createTask(),
      collision: {
        enabled: true,
        source: { type: "svg", src: "assets/collision/room.svg" },
      },
    },
    "/layout-task/assets/objects.json": createObjectLibrary(),
    "/layout-task/assets/backgrounds.json": createBackgroundLibrary(),
    "/layout-task/behaviors/behaviors.json": createBehaviorLibrary(),
    "/layout-task/assets/collision/room.svg": `
      <svg>
        <rect id="room" data-collision="contain" x="0" y="0" width="1000" height="1000" />
      </svg>
    `,
  });

  const runtime = await loader.loadRuntimeConfig({ taskId: "room01" });

  expect(runtime.collision.source?.srcResolved).toBe("http://example.test/layout-task/assets/collision/room.svg");
  expect(runtime.collision.source?.inlineSvgText).toContain("data-collision");
  expect(runtime.collision.areas).toEqual([
    { id: "room", type: "contain", shape: "rect", x: 0, y: 0, width: 1000, height: 1000 },
  ]);
});
```

If this test file uses a different fixture helper pattern, adapt the snippets to its existing helper names while preserving the assertions.

- [ ] **Step 2: Run config loader tests and verify failure**

Run:

```bash
pixi run test src/core/config-loader.test.ts
```

Expected: FAIL because runtime collision is not resolved.

- [ ] **Step 3: Resolve collision config in loader**

In `src/core/config-loader.ts`, import:

```ts
import { parseCollisionSvg } from "./collision-svg";
```

Add defaults near `DEFAULT_STAGE`:

```ts
const DEFAULT_COLLISION = {
  enabled: false,
  mode: "discrete" as const,
  areas: [],
};

const DEFAULT_OBJECT_COLLISION = {
  enabled: true,
  shape: "box" as const,
  padding: 0,
};
```

In `resolveRuntimeConfig()`, add `collision` to each resolved object:

```ts
collision: {
  ...DEFAULT_OBJECT_COLLISION,
  ...objectConfig.collision,
},
```

Also add runtime task collision:

```ts
collision: {
  ...DEFAULT_COLLISION,
  ...input.task.collision,
  areas: input.task.collision?.areas ?? [],
  source: input.task.collision?.source
    ? {
        ...input.task.collision.source,
        srcResolved: resolveAssetUrl(assetBaseUrl, input.task.collision.source.src),
      }
    : undefined,
},
```

Add this method to `ConfigLoader`:

```ts
private async attachCollisionSource(config: RuntimeTaskConfig): Promise<void> {
  const source = config.collision.source;
  if (!config.collision.enabled || !source) {
    return;
  }

  const svgText = await this.fetchText(source.src);
  source.inlineSvgText = svgText;
  config.collision.areas = [...config.collision.areas, ...parseCollisionSvg(svgText)];
}
```

In `loadRuntimeConfig()`, after `await this.attachInlineSvgObjectAssets(runtimeConfig);`, add:

```ts
await this.attachCollisionSource(runtimeConfig);
```

- [ ] **Step 4: Run config loader tests**

Run:

```bash
pixi run test src/core/config-loader.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/config-loader.ts src/core/config-loader.test.ts
git commit -m "feat: resolve collision runtime config"
```

---

### Task 5: StateStore Collision Enforcement

**Files:**

- Modify: `src/core/state-store.ts`
- Modify: `src/core/state-store.test.ts`
- Modify: `src/core/interaction-controller.ts`
- Modify: `src/core/interaction-controller.test.ts`

- [ ] **Step 1: Add failing StateStore tests**

Append to `src/core/state-store.test.ts`:

```ts
it("blocks button movement when the next step would collide with another object", () => {
  const store = new StateStore({
    ...createRuntimeConfig(),
    collision: {
      enabled: true,
      mode: "discrete",
      areas: [],
    },
    objects: [
      {
        ...createRuntimeObject("chair_01"),
        x: 100,
        y: 100,
        width: 50,
        height: 50,
        collision: { enabled: true, shape: "box", padding: 0 },
        behavior: {
          movement: { mode: "button", step: 50, max_left: 2, max_right: 2, max_up: 2, max_down: 2 },
          free_drag: { enabled: false },
        },
      },
      {
        ...createRuntimeObject("table_01"),
        x: 150,
        y: 100,
        width: 50,
        height: 50,
        collision: { enabled: true, shape: "box", padding: 0 },
        behavior: {
          movement: { mode: "none" },
          free_drag: { enabled: false },
        },
      },
    ],
  });

  expect(store.canApplyAction("chair_01", "move_right")).toEqual({ ok: false, reason: "collision" });
  expect(store.getObjectState("chair_01")).toMatchObject({ x: 100, y: 100 });
});

it("blocks rotation when the next rotation would collide", () => {
  const store = new StateStore({
    ...createRuntimeConfig(),
    collision: {
      enabled: true,
      mode: "discrete",
      areas: [],
    },
    objects: [
      {
        ...createRuntimeObject("chair_01"),
        x: 100,
        y: 100,
        width: 100,
        height: 40,
        collision: { enabled: true, shape: "box", padding: 0 },
        behavior: {
          movement: { mode: "button", step: 25, max_left: 2, max_right: 2, max_up: 2, max_down: 2 },
          rotation: { step: 90, max_cw: 2, max_ccw: 2 },
          free_drag: { enabled: false },
        },
      },
      {
        ...createRuntimeObject("table_01"),
        x: 100,
        y: 160,
        width: 50,
        height: 50,
        collision: { enabled: true, shape: "box", padding: 0 },
        behavior: {
          movement: { mode: "none" },
          free_drag: { enabled: false },
        },
      },
    ],
  });

  expect(store.canApplyAction("chair_01", "rotate_cw")).toEqual({ ok: false, reason: "collision" });
  expect(store.getObjectState("chair_01").r).toBe(0);
});

it("keeps the last valid drag position when a dragged candidate collides", () => {
  const store = new StateStore({
    ...createRuntimeConfig(),
    collision: {
      enabled: true,
      mode: "discrete",
      areas: [],
    },
    objects: [
      {
        ...createRuntimeObject("chair_01"),
        x: 100,
        y: 100,
        width: 50,
        height: 50,
        collision: { enabled: true, shape: "box", padding: 0 },
        behavior: {
          movement: { mode: "drag", step: 25, max_left: 10, max_right: 10, max_up: 10, max_down: 10 },
          free_drag: { enabled: true, snap: true },
        },
      },
      {
        ...createRuntimeObject("table_01"),
        x: 150,
        y: 100,
        width: 50,
        height: 50,
        collision: { enabled: true, shape: "box", padding: 0 },
        behavior: {
          movement: { mode: "none" },
          free_drag: { enabled: false },
        },
      },
    ],
  });

  const transition = store.applyDragPosition("chair_01", { x: 150, y: 100 });

  expect(transition.after).toEqual({ x: 100, y: 100, r: 0 });
  expect(transition.limitedAction).toBe("move_right");
});
```

If `createRuntimeConfig()` or `createRuntimeObject()` do not exist, create helpers in the test file that return the same shape currently used by existing `StateStore` tests, plus the new `collision` fields.

- [ ] **Step 2: Run StateStore tests and verify failure**

Run:

```bash
pixi run test src/core/state-store.test.ts
```

Expected: FAIL because collision is not checked.

- [ ] **Step 3: Integrate collision checks into StateStore**

In `src/core/state-store.ts`, import:

```ts
import { evaluateCollision } from "./collision-geometry";
```

Update `CanApplyResult`:

```ts
reason?: "locked" | "limit_reached" | "movement_disabled" | "rotation_disabled" | "collision" | "unsupported_action";
```

Add helper methods inside `StateStore`:

```ts
private getCandidatePose(objectId: string, action: LayoutAction): ObjectPose {
  const state = this.objectStates[objectId];
  if (!state) {
    throw new Error(`Unknown object: ${objectId}`);
  }

  const objectConfig = this.getObjectConfig(objectId);
  const step = getMovementStep(this.config, objectConfig);

  switch (action) {
    case "move_left":
      return { x: state.x - step, y: state.y, r: state.r };
    case "move_right":
      return { x: state.x + step, y: state.y, r: state.r };
    case "move_up":
      return { x: state.x, y: state.y - step, r: state.r };
    case "move_down":
      return { x: state.x, y: state.y + step, r: state.r };
    case "rotate_cw":
      return { x: state.x, y: state.y, r: normalizeRotation(state.r + (objectConfig.behavior.rotation?.step ?? 45)) };
    case "rotate_ccw":
      return { x: state.x, y: state.y, r: normalizeRotation(state.r - (objectConfig.behavior.rotation?.step ?? 45)) };
    default:
      return toPose(state);
  }
}

private getObjectPoses(): Record<string, ObjectPose> {
  return Object.fromEntries(
    Object.entries(this.objectStates).map(([id, state]) => [id, toPose(state)]),
  );
}

private wouldCollide(objectConfig: RuntimeTaskObject, candidatePose: ObjectPose): boolean {
  if (!this.config.collision.enabled || !objectConfig.collision.enabled) {
    return false;
  }

  return !evaluateCollision({
    movingObject: objectConfig,
    candidatePose,
    objects: this.config.objects,
    objectPoses: this.getObjectPoses(),
    areas: this.config.collision.areas,
    worldViewBox: this.config.world.viewBox,
  }).ok;
}
```

In `canApplyAction()`, after step/rotation limit checks and before returning `{ ok: true }`, add for both movement and rotation branches:

```ts
if (this.wouldCollide(objectConfig, this.getCandidatePose(objectId, action))) {
  return { ok: false, reason: "collision" };
}
```

In `applyDragPosition()`, after `const constrained = this.constrainDragPosition(objectConfig, desired);`, add:

```ts
const candidatePose = { x: constrained.x, y: constrained.y, r: state.r };
if (this.config.collision.enabled && this.wouldCollide(objectConfig, candidatePose)) {
  return {
    objectId,
    before,
    after: before,
    counts: { ...state.counts },
    offsets: this.getObjectOffsets(objectId),
    limitedAction: constrained.limitedAction ?? getDragLimitedAction({ x: constrained.x, y: constrained.y }, {
      lowerX: state.x,
      upperX: state.x,
      lowerY: state.y,
      upperY: state.y,
    }) ?? inferDragBlockedAction(before, candidatePose),
  };
}
```

Add this helper at file bottom:

```ts
function inferDragBlockedAction(before: ObjectPose, candidate: ObjectPose): DragTransition["limitedAction"] {
  const dx = candidate.x - before.x;
  const dy = candidate.y - before.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "move_right" : "move_left";
  }

  return dy >= 0 ? "move_down" : "move_up";
}
```

- [ ] **Step 4: Add collision to InteractionController recordable reasons**

In `src/core/interaction-controller.ts`, update `isRecordableBlockedReason()` to include:

```ts
reason === "collision"
```

In `requestAction()`, update feedback logic:

```ts
if (canApply.reason === "limit_reached" || canApply.reason === "collision") {
  this.options.renderer.showLimitFeedback(request.objectId, request.action);
}
```

- [ ] **Step 5: Add interaction blocked event test**

Append to `src/core/interaction-controller.test.ts`:

```ts
it("records collision blocked events when enabled", () => {
  const harness = createInteractionHarness({
    recording: { record_blocked_events: true },
    collision: {
      enabled: true,
      mode: "discrete",
      areas: [],
    },
    objects: [
      {
        ...createRuntimeObject("chair_01"),
        x: 100,
        y: 100,
        width: 50,
        height: 50,
        collision: { enabled: true, shape: "box", padding: 0 },
      },
      {
        ...createRuntimeObject("table_01"),
        x: 125,
        y: 100,
        width: 50,
        height: 50,
        collision: { enabled: true, shape: "box", padding: 0 },
      },
    ],
  });

  harness.controller.selectObject("chair_01");
  const result = harness.controller.requestAction({ objectId: "chair_01", action: "move_right" });

  expect(result).toEqual({ ok: false, reason: "collision" });
  expect(harness.recorder.events[0]).toMatchObject({
    object: "chair_01",
    action: "move_right",
    valid: false,
    blocked_reason: "collision",
  });
});
```

If this file uses different harness names, adapt to the existing helper pattern and keep the same assertions.

- [ ] **Step 6: Run StateStore and interaction tests**

Run:

```bash
pixi run test src/core/state-store.test.ts src/core/interaction-controller.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/state-store.ts src/core/state-store.test.ts src/core/interaction-controller.ts src/core/interaction-controller.test.ts
git commit -m "feat: enforce collision constraints"
```

---

### Task 6: Demo Task And Documentation

**Files:**

- Create: `public/layout-task/assets/collision/room_collision_demo.svg`
- Create: `public/layout-task/assets/backgrounds/collision_demo_bg.svg`
- Create: `public/layout-task/assets/objects/collision_demo_chair.svg`
- Create: `public/layout-task/assets/objects/collision_demo_table.svg`
- Create: `public/layout-task/tasks/room_collision_demo.json`
- Modify: `public/layout-task/assets/backgrounds.json`
- Modify: `public/layout-task/assets/objects.json`
- Modify: `public/layout-task/manifest.json`
- Modify: `protocol/rhino.md`
- Modify: `protocol/templates/rhino-batch-template.json`
- Modify: `protocol/templates/rhino-export-checklist.md`
- Modify: `protocol/schemas/layouttask.batch.schema.json`
- Modify: `README.md`

- [ ] **Step 1: Add collision demo SVG**

Create `public/layout-task/assets/collision/room_collision_demo.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-500 -500 1000 1000">
  <rect id="walkable_room" data-collision="contain" x="-400" y="-300" width="800" height="600" />
  <rect id="center_block" data-collision="block" x="-50" y="-50" width="100" height="100" />
</svg>
```

- [ ] **Step 2: Add synthetic visual assets**

Create `public/layout-task/assets/backgrounds/collision_demo_bg.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-500 -500 1000 1000">
  <rect x="-500" y="-500" width="1000" height="1000" fill="#f5f7fb" />
  <rect x="-400" y="-300" width="800" height="600" fill="#ffffff" stroke="#1f2937" stroke-width="8" />
  <rect x="-50" y="-50" width="100" height="100" fill="#d1d5db" stroke="#6b7280" stroke-width="4" />
  <g stroke="#dbe4f0" stroke-width="1">
    <path d="M -400 -200 H 400" />
    <path d="M -400 -100 H 400" />
    <path d="M -400 0 H 400" />
    <path d="M -400 100 H 400" />
    <path d="M -400 200 H 400" />
    <path d="M -300 -300 V 300" />
    <path d="M -200 -300 V 300" />
    <path d="M -100 -300 V 300" />
    <path d="M 0 -300 V 300" />
    <path d="M 100 -300 V 300" />
    <path d="M 200 -300 V 300" />
    <path d="M 300 -300 V 300" />
  </g>
</svg>
```

Create `public/layout-task/assets/objects/collision_demo_chair.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-25 -25 50 50">
  <rect x="-22" y="-22" width="44" height="44" rx="4" fill="#2563eb" />
  <rect x="-12" y="-12" width="24" height="24" rx="3" fill="#dbeafe" />
</svg>
```

Create `public/layout-task/assets/objects/collision_demo_table.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-37.5 -37.5 75 75">
  <rect x="-35" y="-35" width="70" height="70" rx="5" fill="#92400e" />
  <rect x="-24" y="-24" width="48" height="48" rx="4" fill="#fbbf24" />
</svg>
```

- [ ] **Step 3: Register synthetic assets**

In `public/layout-task/assets/backgrounds.json`, add:

```json
"collision_demo_bg": {
  "type": "svg",
  "src": "assets/backgrounds/collision_demo_bg.svg",
  "intrinsic_unit": "cad_unit"
}
```

In `public/layout-task/assets/objects.json`, add:

```json
"collision_demo_chair": {
  "type": "svg",
  "src": "assets/objects/collision_demo_chair.svg",
  "default_width": 50,
  "default_height": 50,
  "anchor": "center"
},
"collision_demo_table": {
  "type": "svg",
  "src": "assets/objects/collision_demo_table.svg",
  "default_width": 75,
  "default_height": 75,
  "anchor": "center"
}
```

- [ ] **Step 4: Add collision demo task**

Create `public/layout-task/tasks/room_collision_demo.json`:

```json
{
  "schema": "layouttask.task.v1",
  "task_id": "room_collision_demo",
  "qid": "QCOLLISION",
  "title": "Collision demo",
  "world": {
    "viewBox": { "x": -500, "y": -500, "width": 1000, "height": 1000 },
    "origin": { "x": 0, "y": 0 },
    "grid": { "size": 25, "visible": true, "snap": true, "origin": { "x": 0, "y": 0 } }
  },
  "stage": { "fit": "contain", "max_height_ratio": 0.72, "padding": 16 },
  "background": { "asset": "collision_demo_bg", "x": -500, "y": -500, "width": 1000, "height": 1000 },
  "collision": {
    "enabled": true,
    "mode": "discrete",
    "source": { "type": "svg", "src": "assets/collision/room_collision_demo.svg" }
  },
  "objects": [
    {
      "id": "chair_01",
      "asset": "collision_demo_chair",
      "x": -150,
      "y": 0,
      "rotation": 0,
      "behavior": { "template": "drag25_rotate45_limited" },
      "collision": { "enabled": true, "shape": "box", "padding": 0 }
    },
    {
      "id": "table_01",
      "asset": "collision_demo_table",
      "x": 150,
      "y": 0,
      "rotation": 0,
      "behavior": {
        "config": {
          "movement": { "mode": "none" },
          "free_drag": { "enabled": false }
        }
      },
      "collision": { "enabled": true, "shape": "box", "padding": 0 }
    }
  ],
  "recording": { "record_blocked_events": true },
  "output": { "encoding": "plain-json", "detail": "full", "final_state": "relative" }
}
```

- [ ] **Step 5: Add demo manifest entry**

In `public/layout-task/manifest.json`, add:

```json
{
  "qid": "QCOLLISION",
  "task_id": "room_collision_demo",
  "file": "tasks/room_collision_demo.json"
}
```

- [ ] **Step 6: Update protocol docs**

In `protocol/rhino.md`, add a section:

```md
## Collision Protocol

Collision is optional task rule data, not a visual background.

Recommended minimal config:

```json
"collision": {
  "enabled": true,
  "areas": [
    {
      "id": "room_walkable",
      "type": "contain",
      "shape": "polygon",
      "points": [
        { "x": 0, "y": 0 },
        { "x": 4000, "y": 0 },
        { "x": 4000, "y": 3000 },
        { "x": 0, "y": 3000 }
      ]
    }
  ]
}
```

`contain` defines allowed placement areas. If any contain areas exist, an object's collision box must be fully inside at least one of them. If no contain areas exist, `world.viewBox` is used as the default contain area.

`block` defines forbidden areas such as walls, columns, holes, and internal obstacles. Objects cannot overlap block areas. Simple rooms can use contain only and omit block.

SVG analysis layer:

```json
"collision": {
  "enabled": true,
  "source": {
    "type": "svg",
    "src": "assets/collision/room001_collision.svg"
  }
}
```

Only SVG `rect` and `polygon` elements with `data-collision="contain"` or `data-collision="block"` are parsed. Do not use arbitrary SVG paths for collision. Split complex or concave areas into multiple convex rects/polygons.
```

- [ ] **Step 7: Update batch JSON schema**

In `protocol/schemas/layouttask.batch.schema.json`, add `$defs` entries for `collisionPoint`, `collisionArea`, `collisionSource`, `collision`, and `objectCollision`. Use the same field names as `config.schema.ts`. Add:

```json
"collision": { "$ref": "#/$defs/collision" }
```

to the `trial.properties` object and:

```json
"collision": { "$ref": "#/$defs/objectCollision" }
```

to the `object.properties` object.

- [ ] **Step 8: Update README**

In `README.md`, add a concise demo pointer:

```md
Collision demo:

```text
/?task=room_collision_demo&q=QCOLLISION
```

Collision constraints are optional and use world-unit `contain`/`block` areas or a hidden SVG analysis layer. See `protocol/rhino.md`.
```

- [ ] **Step 9: Run docs/demo validation**

Run:

```bash
pixi run test src/core/config-loader.test.ts src/core/state-store.test.ts src/core/collision-svg.test.ts src/core/collision-geometry.test.ts
pixi run build
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add public/layout-task/assets/collision/room_collision_demo.svg public/layout-task/assets/backgrounds/collision_demo_bg.svg public/layout-task/assets/objects/collision_demo_chair.svg public/layout-task/assets/objects/collision_demo_table.svg public/layout-task/tasks/room_collision_demo.json public/layout-task/assets/backgrounds.json public/layout-task/assets/objects.json public/layout-task/manifest.json protocol/rhino.md protocol/templates/rhino-batch-template.json protocol/templates/rhino-export-checklist.md protocol/schemas/layouttask.batch.schema.json README.md
git commit -m "docs: add collision protocol and demo"
```

---

### Task 7: End-To-End Verification

**Files:**

- No required source edits unless verification reveals a bug.

- [ ] **Step 1: Run full tests**

Run:

```bash
pixi run test
```

Expected: all tests pass. If `.worktrees/` causes duplicate test discovery, run this from a clean worktree or remove the completed protocol worktree before final verification.

- [ ] **Step 2: Run build**

Run:

```bash
pixi run build
```

Expected: PASS.

- [ ] **Step 3: Validate existing batch examples**

Run:

```bash
pixi run validate-batch protocol/examples/minimal-batch.json
pixi run validate-batch protocol/examples/scoring-example.json
```

Expected: both print `"valid": true`.

- [ ] **Step 4: Manual demo check**

Start the dev server:

```bash
pixi run dev -- --host 127.0.0.1 --port 5173
```

Open:

```text
http://127.0.0.1:5173/?task=room_collision_demo&q=QCOLLISION
```

Manual acceptance:

- Chair cannot move outside the walkable contain rectangle.
- Chair cannot overlap the central block area.
- Chair cannot overlap the table.
- Rotation is blocked when the candidate rotated box would collide.
- Blocked collision feedback appears using the existing dashed/label feedback style.
- Confirmed result can be copied and blocked collision events are recorded when `record_blocked_events` is true.

- [ ] **Step 5: Commit any verification fixes**

If verification required fixes, commit them:

```bash
git add <changed-files>
git commit -m "fix: stabilize collision constraints"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review Checklist

- [ ] Spec coverage: contain areas, optional block areas, object-object collision, walls, SVG analysis layer, static webpage performance, and existing step limits are all covered.
- [ ] Runtime location: collision enforcement lives in `StateStore`, not renderer.
- [ ] Protocol clarity: `contain` is enough for simple rooms; `block` is optional for obstacles.
- [ ] SVG scope: only `rect` and `polygon` are supported; arbitrary paths and black/white raster masks are intentionally out of scope.
- [ ] Performance: collision is discrete candidate-pose checking, no physics engine and no per-frame global simulation.
- [ ] Testing: pure geometry, SVG parser, config loader, state transitions, event recording, schema, docs/demo are each tested.
- [ ] Backward compatibility: tasks without `collision` behave exactly as before.
