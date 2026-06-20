# Collider SVG Polygons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add long-term collision support where each visual furniture SVG may have a matching collider SVG, and transparent/empty areas are ignored because runtime collision uses polygons extracted from that collider.

**Architecture:** Authoring config may declare object collision as either the current `box` or new `asset_outline`/`polygons`. `asset_outline` is resolved during config loading into runtime-local collision polygons; runtime interaction only transforms and tests polygons, so the static web player remains light. Collider SVGs are analysis assets: simple filled `rect`, `polygon`, and closed straight-line `path` elements in the same local coordinate system and `viewBox` as the visual SVG.

**Tech Stack:** TypeScript, Zod, Vitest, existing config loader/compiler/adaptor, existing polygon SAT collision engine. No browser-time raster or alpha processing.

---

## File Structure

- Modify `src/types/config.ts`: extend authoring collision types with local polygon and collider SVG source variants.
- Modify `src/types/runtime.ts`: make runtime object collision a resolved union that contains either `box` or precomputed `polygons`.
- Modify `src/schemas/config.schema.ts`: validate `box`, `polygons`, and `asset_outline` object collision shapes.
- Modify `src/schemas/batch.schema.ts`: inherits config object schema, but add tests confirming batch accepts new collision shapes.
- Modify `src/core/collision-geometry.ts`: create collision polygons for `box` and transformed local polygons.
- Create `src/core/object-collider-svg.ts`: parse a constrained collider SVG into local polygons.
- Modify `src/core/config-loader.ts`: fetch collider SVGs and resolve `asset_outline` to runtime `polygons`.
- Modify `src/core/batch-compiler.ts`: keep object collision metadata in generated task JSON.
- Modify `protocol/adaptor/assemble-stimuli-csv.ts` and `protocol/adaptor/assemble_protocol_batch_from_stimuli_csv.py`: optionally attach collider SVG paths from asset naming convention or CSV fields.
- Modify `protocol/rhino.md`, `protocol/player-ingestion.md`, `protocol/README.md`, and `protocol/templates/rhino-asset-package-template.md`: document collider SVG requirements and naming.
- Add fixture files under `protocol/examples/full-preview-collision/assets/collision/objects/` for one visual object collider.
- Add tests in `src/core/object-collider-svg.test.ts`, `src/core/collision-geometry.test.ts`, `src/core/config-loader.test.ts`, `src/schemas/config.schema.test.ts`, `src/schemas/batch.schema.test.ts`, and `src/core/batch-compiler.test.ts`.

---

### Task 1: Define Collision Types And Schema

**Files:**
- Modify: `src/types/config.ts`
- Modify: `src/types/runtime.ts`
- Modify: `src/schemas/config.schema.ts`
- Test: `src/schemas/config.schema.test.ts`
- Test: `src/schemas/batch.schema.test.ts`

- [ ] **Step 1: Add failing schema tests for object polygon collision**

Add to `src/schemas/config.schema.test.ts`:

```ts
it("accepts object collision polygons and asset outlines", () => {
  const base = createValidTaskConfig();
  base.objects[0].collision = {
    enabled: true,
    shape: "polygons",
    polygons: [
      {
        id: "seat",
        points: [
          { x: -50, y: -25 },
          { x: 50, y: -25 },
          { x: 50, y: 25 },
          { x: -50, y: 25 },
        ],
      },
    ],
  };
  expect(taskSchema.parse(base).objects[0].collision).toMatchObject({ shape: "polygons" });

  base.objects[0].collision = {
    enabled: true,
    shape: "asset_outline",
    source: {
      type: "svg",
      src: "assets/collision/objects/chair_COLLIDER.svg",
    },
  };
  expect(taskSchema.parse(base).objects[0].collision).toMatchObject({ shape: "asset_outline" });
});
```

Add to `src/schemas/batch.schema.test.ts`:

```ts
it("accepts collider SVG collision declarations in batch objects", () => {
  const batch = createValidBatch();
  batch.trials[0].objects[0].collision = {
    enabled: true,
    shape: "asset_outline",
    source: {
      type: "svg",
      src: "assets/collision/objects/chair_COLLIDER.svg",
    },
  };

  expect(batchSchema.parse(batch).trials[0].objects[0].collision).toMatchObject({
    shape: "asset_outline",
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/schemas/config.schema.test.ts src/schemas/batch.schema.test.ts
```

Expected: FAIL because `shape` only accepts `"box"`.

- [ ] **Step 3: Extend config types**

In `src/types/config.ts`, replace `ObjectCollisionConfig` with:

```ts
export interface ObjectCollisionPolygon {
  id?: string;
  points: CollisionPoint[];
}

export interface ObjectCollisionSourceConfig {
  type: "svg";
  src: string;
}

export interface BoxObjectCollisionConfig {
  enabled?: boolean;
  shape?: "box";
  padding?: number;
}

export interface PolygonObjectCollisionConfig {
  enabled?: boolean;
  shape: "polygons";
  polygons: ObjectCollisionPolygon[];
  padding?: number;
}

export interface AssetOutlineObjectCollisionConfig {
  enabled?: boolean;
  shape: "asset_outline";
  source: ObjectCollisionSourceConfig;
  padding?: number;
}

export type ObjectCollisionConfig =
  | BoxObjectCollisionConfig
  | PolygonObjectCollisionConfig
  | AssetOutlineObjectCollisionConfig;
```

- [ ] **Step 4: Extend runtime types**

In `src/types/runtime.ts`, import `ObjectCollisionPolygon` and define:

```ts
export type RuntimeObjectCollisionConfig =
  | {
      enabled: boolean;
      shape: "box";
      padding: number;
    }
  | {
      enabled: boolean;
      shape: "polygons";
      polygons: ObjectCollisionPolygon[];
      padding: number;
      source?: CollisionSourceConfig & ResolvedAssetPath & { inlineSvgText?: string };
    };
```

Change `RuntimeTaskObject.collision` to:

```ts
collision: RuntimeObjectCollisionConfig;
```

- [ ] **Step 5: Extend Zod schema**

In `src/schemas/config.schema.ts`, replace `objectCollisionSchema` with a discriminated union that preserves the default box behavior:

```ts
const objectCollisionPolygonSchema = z.object({
  id: z.string().min(1).optional(),
  points: z.array(collisionPointSchema).min(3),
});

const boxObjectCollisionSchema = z.object({
  enabled: z.boolean().default(true),
  shape: z.literal("box").default("box"),
  padding: z.number().nonnegative().default(0),
});

const polygonObjectCollisionSchema = z.object({
  enabled: z.boolean().default(true),
  shape: z.literal("polygons"),
  polygons: z.array(objectCollisionPolygonSchema).min(1),
  padding: z.number().nonnegative().default(0),
});

const assetOutlineObjectCollisionSchema = z.object({
  enabled: z.boolean().default(true),
  shape: z.literal("asset_outline"),
  source: collisionSourceSchema,
  padding: z.number().nonnegative().default(0),
});

export const objectCollisionSchema = z.union([
  boxObjectCollisionSchema,
  polygonObjectCollisionSchema,
  assetOutlineObjectCollisionSchema,
]);
```

This keeps omitted `shape` working for legacy config because `boxObjectCollisionSchema` supplies the default.

- [ ] **Step 6: Run schema tests**

Run:

```bash
npm run test -- src/schemas/config.schema.test.ts src/schemas/batch.schema.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types/config.ts src/types/runtime.ts src/schemas/config.schema.ts src/schemas/config.schema.test.ts src/schemas/batch.schema.test.ts
git commit -m "feat: define object polygon collision schema"
```

---

### Task 2: Parse Collider SVG Into Local Polygons

**Files:**
- Create: `src/core/object-collider-svg.ts`
- Test: `src/core/object-collider-svg.test.ts`

- [ ] **Step 1: Write failing parser tests**

Create `src/core/object-collider-svg.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseObjectColliderSvg } from "./object-collider-svg";

describe("parseObjectColliderSvg", () => {
  it("parses rect and polygon collider elements into local polygons", () => {
    const svg = `
      <svg viewBox="0 0 100 80">
        <rect id="seat" x="10" y="20" width="30" height="40" />
        <polygon id="back" points="60,10 90,10 90,30 60,30" />
      </svg>
    `;

    expect(parseObjectColliderSvg(svg)).toEqual([
      {
        id: "seat",
        points: [
          { x: 10, y: 20 },
          { x: 40, y: 20 },
          { x: 40, y: 60 },
          { x: 10, y: 60 },
        ],
      },
      {
        id: "back",
        points: [
          { x: 60, y: 10 },
          { x: 90, y: 10 },
          { x: 90, y: 30 },
          { x: 60, y: 30 },
        ],
      },
    ]);
  });

  it("parses closed straight-line path collider elements", () => {
    const svg = `<svg><path id="top" d="M 0 0 L 10 0 L 10 5 L 0 5 Z" /></svg>`;

    expect(parseObjectColliderSvg(svg)).toEqual([
      {
        id: "top",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 5 },
          { x: 0, y: 5 },
        ],
      },
    ]);
  });

  it("rejects image, mask, clipPath, and curved path collider SVGs", () => {
    expect(() => parseObjectColliderSvg(`<svg><image href="data:image/png;base64,abc" /></svg>`)).toThrow(
      "Collider SVG cannot contain <image>",
    );
    expect(() => parseObjectColliderSvg(`<svg><clipPath id="c"><rect width="1" height="1" /></clipPath></svg>`)).toThrow(
      "Collider SVG cannot contain <clipPath>",
    );
    expect(() => parseObjectColliderSvg(`<svg><path d="M 0 0 C 1 1 2 2 3 3 Z" /></svg>`)).toThrow(
      "Collider path only supports straight-line commands",
    );
  });

  it("ignores transparent or display-none shapes", () => {
    const svg = `
      <svg>
        <rect id="hidden" x="0" y="0" width="10" height="10" fill="none" />
        <rect id="gone" x="0" y="0" width="10" height="10" display="none" />
        <rect id="solid" x="20" y="0" width="10" height="10" fill="#000" />
      </svg>
    `;

    expect(parseObjectColliderSvg(svg)).toEqual([
      {
        id: "solid",
        points: [
          { x: 20, y: 0 },
          { x: 30, y: 0 },
          { x: 30, y: 10 },
          { x: 20, y: 10 },
        ],
      },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/core/object-collider-svg.test.ts
```

Expected: FAIL because `object-collider-svg.ts` does not exist.

- [ ] **Step 3: Create parser implementation**

Create `src/core/object-collider-svg.ts`:

```ts
import type { ObjectCollisionPolygon } from "../types/config";

const elementPattern = /<(?<tag>rect|polygon|path|image|clipPath|mask|filter)\b(?<attrs>[^>]*)\/?>/gi;
const commentPattern = /<!--[\s\S]*?-->/g;

export function parseObjectColliderSvg(svgText: string): ObjectCollisionPolygon[] {
  const uncommented = svgText.replace(commentPattern, "");
  const polygons: ObjectCollisionPolygon[] = [];

  for (const match of uncommented.matchAll(elementPattern)) {
    const tag = match.groups?.tag ?? "";
    const attrs = parseAttributes(match.groups?.attrs ?? "");
    const normalizedTag = tag.toLowerCase();

    if (["image", "clippath", "mask", "filter"].includes(normalizedTag)) {
      throw new Error(`Collider SVG cannot contain <${tag}>`);
    }

    if (isInvisible(attrs)) {
      continue;
    }

    if (normalizedTag === "rect") {
      polygons.push({ id: attrs.id, points: rectToPoints(attrs) });
      continue;
    }

    if (normalizedTag === "polygon") {
      polygons.push({ id: attrs.id, points: parsePoints(attrs.points ?? "") });
      continue;
    }

    if (normalizedTag === "path") {
      polygons.push({ id: attrs.id, points: parseStraightClosedPath(attrs.d ?? "") });
    }
  }

  if (polygons.length === 0) {
    throw new Error("Collider SVG did not contain any supported solid polygons");
  }

  return polygons;
}

function parseAttributes(input: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of input.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function isInvisible(attrs: Record<string, string>): boolean {
  const style = parseStyle(attrs.style ?? "");
  const fill = attrs.fill ?? style.fill;
  const display = attrs.display ?? style.display;
  const visibility = attrs.visibility ?? style.visibility;
  const opacity = attrs.opacity ?? style.opacity;
  const fillOpacity = attrs["fill-opacity"] ?? style["fill-opacity"];

  return (
    fill === "none" ||
    display === "none" ||
    visibility === "hidden" ||
    opacity === "0" ||
    fillOpacity === "0"
  );
}

function parseStyle(style: string): Record<string, string> {
  return Object.fromEntries(
    style
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...rest] = part.split(":");
        return [key.trim(), rest.join(":").trim()];
      }),
  );
}

function numberAttr(attrs: Record<string, string>, key: string): number {
  const value = Number(attrs[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`Collider rect requires numeric ${key}`);
  }
  return value;
}

function rectToPoints(attrs: Record<string, string>): ObjectCollisionPolygon["points"] {
  const x = numberAttr(attrs, "x");
  const y = numberAttr(attrs, "y");
  const width = numberAttr(attrs, "width");
  const height = numberAttr(attrs, "height");
  if (width <= 0 || height <= 0) {
    throw new Error("Collider rect width and height must be positive");
  }
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

function parsePoints(points: string): ObjectCollisionPolygon["points"] {
  const values = points.trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (values.length < 6 || values.length % 2 !== 0 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("Collider polygon points must contain at least three numeric x/y pairs");
  }
  const parsed = [];
  for (let index = 0; index < values.length; index += 2) {
    parsed.push({ x: values[index], y: values[index + 1] });
  }
  return parsed;
}

function parseStraightClosedPath(d: string): ObjectCollisionPolygon["points"] {
  if (/[CQSTA]/i.test(d)) {
    throw new Error("Collider path only supports straight-line commands");
  }
  const tokens = d.match(/[MLHVZmlhvz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const points: ObjectCollisionPolygon["points"] = [];
  let index = 0;
  let current = { x: 0, y: 0 };
  let closed = false;

  while (index < tokens.length) {
    const command = tokens[index++];
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();

    if (upper === "Z") {
      closed = true;
      break;
    }

    if (upper === "M" || upper === "L") {
      const x = Number(tokens[index++]);
      const y = Number(tokens[index++]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error("Collider path has invalid coordinate");
      }
      current = relative ? { x: current.x + x, y: current.y + y } : { x, y };
      points.push({ ...current });
      continue;
    }

    if (upper === "H") {
      const x = Number(tokens[index++]);
      if (!Number.isFinite(x)) {
        throw new Error("Collider path has invalid horizontal coordinate");
      }
      current = { x: relative ? current.x + x : x, y: current.y };
      points.push({ ...current });
      continue;
    }

    if (upper === "V") {
      const y = Number(tokens[index++]);
      if (!Number.isFinite(y)) {
        throw new Error("Collider path has invalid vertical coordinate");
      }
      current = { x: current.x, y: relative ? current.y + y : y };
      points.push({ ...current });
      continue;
    }

    throw new Error(`Unsupported collider path command: ${command}`);
  }

  if (!closed || points.length < 3) {
    throw new Error("Collider path must be closed and contain at least three points");
  }

  return removeDuplicateClosingPoint(points);
}

function removeDuplicateClosingPoint(points: ObjectCollisionPolygon["points"]): ObjectCollisionPolygon["points"] {
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && first.x === last.x && first.y === last.y) {
    return points.slice(0, -1);
  }
  return points;
}
```

- [ ] **Step 4: Run parser tests**

Run:

```bash
npm run test -- src/core/object-collider-svg.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/object-collider-svg.ts src/core/object-collider-svg.test.ts
git commit -m "feat: parse object collider svg polygons"
```

---

### Task 3: Use Polygon Collision At Runtime

**Files:**
- Modify: `src/core/collision-geometry.ts`
- Test: `src/core/collision-geometry.test.ts`

- [ ] **Step 1: Add failing geometry tests**

Add to `src/core/collision-geometry.test.ts`:

```ts
it("creates transformed object collision polygons from local polygons", () => {
  const object = createObject({
    x: 100,
    y: 200,
    width: 100,
    height: 50,
    collision: {
      enabled: true,
      shape: "polygons",
      padding: 0,
      polygons: [
        {
          id: "solid",
          points: [
            { x: 10, y: 10 },
            { x: 30, y: 10 },
            { x: 30, y: 20 },
            { x: 10, y: 20 },
          ],
        },
      ],
    },
  });

  expect(createObjectCollisionPolygons(object, { x: 100, y: 200, r: 0 })).toEqual([
    [
      { x: 60, y: 185 },
      { x: 80, y: 185 },
      { x: 80, y: 195 },
      { x: 60, y: 195 },
    ],
  ]);
});

it("blocks collision when any local polygon overlaps another object", () => {
  const moving = createObject({
    id: "moving",
    width: 100,
    height: 100,
    collision: {
      enabled: true,
      shape: "polygons",
      padding: 0,
      polygons: [
        {
          id: "right_leg",
          points: [
            { x: 75, y: 40 },
            { x: 100, y: 40 },
            { x: 100, y: 60 },
            { x: 75, y: 60 },
          ],
        },
      ],
    },
  });
  const blocker = createObject({ id: "blocker", x: 40, y: 0, width: 20, height: 20 });

  expect(
    evaluateCollision({
      movingObject: moving,
      candidatePose: { x: 0, y: 0, r: 0 },
      objects: [moving, blocker],
      areas: [],
      worldViewBox: { x: -100, y: -100, width: 200, height: 200 },
    }),
  ).toEqual({ ok: false, reason: "object", objectId: "blocker" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/core/collision-geometry.test.ts
```

Expected: FAIL because `createObjectCollisionPolygons` does not exist and `evaluateCollision` only checks one box polygon.

- [ ] **Step 3: Replace single polygon helper with multi-polygon helper**

In `src/core/collision-geometry.ts`:

```ts
export function createObjectCollisionPolygons(
  object: RuntimeTaskObject,
  pose: ObjectPose,
): CollisionPolygon[] {
  if (object.collision.shape === "polygons") {
    return object.collision.polygons.map((polygon) =>
      transformLocalPolygon(object, pose, polygon.points, object.collision.padding),
    );
  }

  return [createObjectCollisionPolygon(object, pose)];
}
```

Add helper:

```ts
function transformLocalPolygon(
  object: RuntimeTaskObject,
  pose: ObjectPose,
  points: CollisionPolygon,
  padding: number,
): CollisionPolygon {
  const originOffset =
    object.anchor === "top_left"
      ? { x: 0, y: 0 }
      : { x: -object.width / 2, y: -object.height / 2 };
  const angle = (normalizeRotation(pose.r) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return points.map((point) => {
    const localX = point.x + originOffset.x + Math.sign(point.x - object.width / 2) * padding;
    const localY = point.y + originOffset.y + Math.sign(point.y - object.height / 2) * padding;
    return {
      x: pose.x + localX * cos - localY * sin,
      y: pose.y + localX * sin + localY * cos,
    };
  });
}
```

Keep `createObjectCollisionPolygon` exported for existing tests and box behavior.

- [ ] **Step 4: Update collision evaluation loops**

In `evaluateCollision`, replace:

```ts
const movingPolygon = createObjectCollisionPolygon(input.movingObject, input.candidatePose);
```

with:

```ts
const movingPolygons = createObjectCollisionPolygons(input.movingObject, input.candidatePose);
```

Then evaluate contain/block/object collisions for every moving polygon:

```ts
for (const movingPolygon of movingPolygons) {
  const containingArea = containPolygons.find((area) => isPolygonInsidePolygon(movingPolygon, area.polygon));
  if (!containingArea) {
    return { ok: false, reason: "outside_contain", areaId: containPolygons[0]?.id ?? "__world_viewBox" };
  }

  for (const area of blockAreas) {
    if (doPolygonsIntersect(movingPolygon, areaToPolygon(area))) {
      return { ok: false, reason: "blocked_area", areaId: area.id };
    }
  }
}
```

For object-object collision:

```ts
const objectPolygons = createObjectCollisionPolygons(object, pose);
if (movingPolygons.some((movingPolygon) => objectPolygons.some((objectPolygon) => doPolygonsIntersect(movingPolygon, objectPolygon)))) {
  return { ok: false, reason: "object", objectId: object.id };
}
```

- [ ] **Step 5: Run geometry tests**

Run:

```bash
npm run test -- src/core/collision-geometry.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/collision-geometry.ts src/core/collision-geometry.test.ts
git commit -m "feat: evaluate object polygon collision"
```

---

### Task 4: Resolve Collider SVG Sources In Config Loader

**Files:**
- Modify: `src/core/config-loader.ts`
- Test: `src/core/config-loader.test.ts`

- [ ] **Step 1: Add failing config loader test**

Add to `src/core/config-loader.test.ts`:

```ts
it("fetches object collider SVG sources and resolves them to runtime polygons", async () => {
  const task = createTaskConfig();
  task.objects[0].collision = {
    enabled: true,
    shape: "asset_outline",
    source: {
      type: "svg",
      src: "assets/collision/objects/chair_COLLIDER.svg",
    },
  };
  const loader = createLoader({
    task,
    files: {
      "/layout-task/assets/collision/objects/chair_COLLIDER.svg":
        '<svg><rect id="seat" x="10" y="20" width="30" height="40" /></svg>',
    },
  });

  const config = await loader.loadRuntimeConfig({ taskId: task.task_id });

  expect(config.objects[0].collision).toEqual({
    enabled: true,
    shape: "polygons",
    padding: 0,
    source: {
      type: "svg",
      src: "assets/collision/objects/chair_COLLIDER.svg",
      srcResolved: "http://example.test/layout-task/assets/collision/objects/chair_COLLIDER.svg",
      inlineSvgText: '<svg><rect id="seat" x="10" y="20" width="30" height="40" /></svg>',
    },
    polygons: [
      {
        id: "seat",
        points: [
          { x: 10, y: 20 },
          { x: 40, y: 20 },
          { x: 40, y: 60 },
          { x: 10, y: 60 },
        ],
      },
    ],
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/core/config-loader.test.ts
```

Expected: FAIL because `asset_outline` is not resolved.

- [ ] **Step 3: Import parser and add resolver**

In `src/core/config-loader.ts`, import:

```ts
import { parseObjectColliderSvg } from "./object-collider-svg";
```

Add helper:

```ts
function resolveObjectCollision(
  objectConfig: TaskConfig["objects"][number],
  assetBaseUrl: string,
): RuntimeTaskConfig["objects"][number]["collision"] {
  const authored = objectConfig.collision ?? DEFAULT_OBJECT_COLLISION;

  if (authored.shape === "polygons") {
    return {
      enabled: authored.enabled ?? true,
      shape: "polygons",
      polygons: authored.polygons,
      padding: authored.padding ?? 0,
    };
  }

  if (authored.shape === "asset_outline") {
    return {
      enabled: authored.enabled ?? true,
      shape: "polygons",
      polygons: [],
      padding: authored.padding ?? 0,
      source: {
        ...authored.source,
        srcResolved: resolveAssetUrl(assetBaseUrl, authored.source.src),
      },
    };
  }

  return {
    enabled: authored.enabled ?? true,
    shape: "box",
    padding: authored.padding ?? 0,
  };
}
```

Use `resolveObjectCollision(objectConfig, assetBaseUrl)` when creating each runtime object.

- [ ] **Step 4: Fetch and parse collider SVGs**

Add method to `ConfigLoader`:

```ts
private async attachObjectColliderSources(config: RuntimeTaskConfig): Promise<void> {
  const svgAssets = new Map<string, Promise<string>>();

  await Promise.all(
    config.objects.map(async (objectConfig) => {
      if (objectConfig.collision.shape !== "polygons" || !objectConfig.collision.source) {
        return;
      }

      let svgText = svgAssets.get(objectConfig.collision.source.srcResolved);
      if (!svgText) {
        svgText = this.fetchText(objectConfig.collision.source.srcResolved);
        svgAssets.set(objectConfig.collision.source.srcResolved, svgText);
      }

      const inlineSvgText = await svgText;
      objectConfig.collision.source.inlineSvgText = inlineSvgText;
      objectConfig.collision.polygons = parseObjectColliderSvg(inlineSvgText);
    }),
  );
}
```

Call it in `loadRuntimeConfig` after `resolveRuntimeConfig` and before `return runtimeConfig`:

```ts
await this.attachObjectColliderSources(runtimeConfig);
```

- [ ] **Step 5: Run loader tests**

Run:

```bash
npm run test -- src/core/config-loader.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/config-loader.ts src/core/config-loader.test.ts
git commit -m "feat: resolve object collider svg sources"
```

---

### Task 5: Preserve Collider Collision Through Compiler And Adaptor

**Files:**
- Modify: `src/core/batch-compiler.test.ts`
- Modify: `protocol/adaptor/assemble-stimuli-csv.ts`
- Modify: `protocol/adaptor/assemble_protocol_batch_from_stimuli_csv.py`
- Test: `src/core/batch-compiler.test.ts`

- [ ] **Step 1: Add compiler regression test**

Add to `src/core/batch-compiler.test.ts`:

```ts
it("emits object asset_outline collision into runtime task config", () => {
  const batch = createBatch();
  batch.trials[0].objects[0].collision = {
    enabled: true,
    shape: "asset_outline",
    source: {
      type: "svg",
      src: "assets/collision/objects/chair_COLLIDER.svg",
    },
    padding: 2,
  };

  const task = compileBatch(batch).tasks[0].config;

  expect(task.objects[0].collision).toEqual({
    enabled: true,
    shape: "asset_outline",
    source: {
      type: "svg",
      src: "assets/collision/objects/chair_COLLIDER.svg",
    },
    padding: 2,
  });
});
```

- [ ] **Step 2: Run compiler test**

Run:

```bash
npm run test -- src/core/batch-compiler.test.ts
```

Expected: PASS if compiler already preserves the object collision object. If it fails due typing, finish Task 1 type updates first.

- [ ] **Step 3: Add optional collider naming convention to TS adaptor**

In `protocol/adaptor/assemble-stimuli-csv.ts`, add CLI option:

```ts
  .option("--collider-suffix <suffix>", "Attach object collider SVGs by asset src basename", "_COLLIDER")
```

Add helper:

```ts
function withColliderSuffix(src: string, suffix: string): string {
  return src.replace(/\.svg$/i, `${suffix}.svg`).replace("/objects/", "/collision/objects/");
}
```

When processing each trial object, if `object.collision?.shape` is missing or `"box"` and the object asset is SVG, attach:

```ts
object.collision = {
  ...(object.collision ?? {}),
  enabled: object.collision?.enabled ?? true,
  shape: "asset_outline",
  source: {
    type: "svg",
    src: withColliderSuffix(asset.src, options.colliderSuffix),
  },
};
```

Guard this behavior behind a boolean flag:

```ts
.option("--attach-collider-svg", "Attach same-name collider SVG sources for object collision", false)
```

Default remains off so existing pipelines do not break.

- [ ] **Step 4: Mirror optional collider naming in Python adaptor**

In `protocol/adaptor/assemble_protocol_batch_from_stimuli_csv.py`, add args:

```py
parser.add_argument("--attach-collider-svg", action="store_true")
parser.add_argument("--collider-suffix", default="_COLLIDER")
```

Add helper:

```py
def collider_src_for_object_src(src, suffix):
    if not src.lower().endswith(".svg"):
        raise ValueError(f"Collider source convention only supports SVG object assets: {src}")
    return src.replace("/objects/", "/collision/objects/")[:-4] + suffix + ".svg"
```

Inside `assemble`, after loading object assets and before appending the trial:

```py
if attach_collider_svg:
    for obj in trial.get("objects") or []:
        asset = object_library.get("objects", {}).get(str(obj.get("asset") or ""))
        if not is_svg_asset(asset):
            continue
        collision = dict(obj.get("collision") or {})
        if collision.get("shape") not in (None, "box"):
            continue
        collision.setdefault("enabled", True)
        collision["shape"] = "asset_outline"
        collision["source"] = {
            "type": "svg",
            "src": collider_src_for_object_src(asset["src"], collider_suffix),
        }
        obj["collision"] = collision
```

Pass `args.attach_collider_svg` and `args.collider_suffix` into `assemble`.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm run test -- src/core/batch-compiler.test.ts
npm run build
```

Expected: tests and TypeScript build pass.

- [ ] **Step 6: Commit**

```bash
git add src/core/batch-compiler.test.ts protocol/adaptor/assemble-stimuli-csv.ts protocol/adaptor/assemble_protocol_batch_from_stimuli_csv.py
git commit -m "feat: support collider svg adaptor convention"
```

---

### Task 6: Add Example Collider Fixture And Visual Test Package

**Files:**
- Create: `protocol/examples/full-preview-collision/assets/collision/objects/full_chair_COLLIDER.svg`
- Modify: `protocol/examples/full-preview-collision/batch.json`
- Test: `src/core/config-loader.test.ts`

- [ ] **Step 1: Create simple collider SVG fixture**

Create `protocol/examples/full-preview-collision/assets/collision/objects/full_chair_COLLIDER.svg`:

```xml
<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <rect id="chair_seat" x="20" y="20" width="40" height="40" fill="#000"/>
</svg>
```

- [ ] **Step 2: Point example object at collider source**

In `protocol/examples/full-preview-collision/batch.json`, update `chair_01.collision`:

```json
"collision": {
  "enabled": true,
  "shape": "asset_outline",
  "source": {
    "type": "svg",
    "src": "assets/collision/objects/full_chair_COLLIDER.svg"
  }
}
```

- [ ] **Step 3: Extend config loader fixture test**

In `src/core/config-loader.test.ts`, update the full preview collision fixture assertion:

```ts
expect(config.objects.find((object) => object.id === "chair_01")?.collision).toMatchObject({
  enabled: true,
  shape: "polygons",
  polygons: [
    {
      id: "chair_seat",
      points: [
        { x: 20, y: 20 },
        { x: 60, y: 20 },
        { x: 60, y: 60 },
        { x: 20, y: 60 },
      ],
    },
  ],
});
```

- [ ] **Step 4: Run fixture tests**

Run:

```bash
npm run test -- src/core/config-loader.test.ts src/core/collision-geometry.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add protocol/examples/full-preview-collision/assets/collision/objects/full_chair_COLLIDER.svg protocol/examples/full-preview-collision/batch.json src/core/config-loader.test.ts
git commit -m "test: add object collider svg fixture"
```

---

### Task 7: Document Rhino Collider SVG Contract

**Files:**
- Modify: `protocol/rhino.md`
- Modify: `protocol/player-ingestion.md`
- Modify: `protocol/README.md`
- Modify: `protocol/templates/rhino-asset-package-template.md`

- [ ] **Step 1: Update Rhino documentation**

Add a subsection to `protocol/rhino.md` under `Collision Protocol`:

```md
### Object Collider SVGs

For long-term object collision, export a collider SVG for every visual furniture SVG that should participate in object-object collision.

Recommended naming:

```text
assets/objects/armchairAndTeatable_FIXED.svg
assets/collision/objects/armchairAndTeatable_FIXED_COLLIDER.svg
assets/objects/armchairAndTeatable_VARIABLE.svg
assets/collision/objects/armchairAndTeatable_VARIABLE_COLLIDER.svg
```

The collider SVG is an analysis asset. It should share the same local coordinate
system and `viewBox` as the visual SVG. The Player ignores color and uses only
solid geometry. Empty/transparent space has no collision.

Allowed collider geometry:

- `rect`
- `polygon`
- closed straight-line `path` using `M`, `L`, `H`, `V`, and `Z`

Do not export collider SVGs with:

- `<image>`
- `mask`
- `clipPath`
- `filter`
- text
- stroke-only lines as collision solids
- curved path commands unless they are polygonized before export

If an object has `shape: "asset_outline"`, the loader converts its collider SVG
into local polygons before runtime interaction starts. Runtime collision stays
light and does not inspect visual PNG transparency.
```

- [ ] **Step 2: Update Player ingestion documentation**

Add to `protocol/player-ingestion.md` under `Collision Consumption`:

```md
Object collision can use three shapes:

- `box`: legacy object bounding box.
- `polygons`: explicit object-local polygons.
- `asset_outline`: authoring convenience that loads a collider SVG and resolves it to `polygons`.

Participant-facing generated task JSON may contain `asset_outline`; runtime
config contains resolved `polygons`. Analysis code should treat polygon points as
object-local coordinates transformed by the object's `x`, `y`, `rotation`, and
`anchor`.
```

- [ ] **Step 3: Update protocol README**

Add to `protocol/README.md`:

```md
Collider rule: visual furniture SVGs are not automatically treated as solid
collision geometry. For precise collision, provide collider SVGs under
`assets/collision/objects/` and reference them with `collision.shape:
"asset_outline"`. Collider SVGs should be simple filled vector geometry in the
same local coordinate system as the visual SVG.
```

- [ ] **Step 4: Update asset package template**

Add to `protocol/templates/rhino-asset-package-template.md`:

```md
Object collision assets:

- Put visual SVGs in `assets/objects/`.
- Put collider SVGs in `assets/collision/objects/`.
- Use matching names with `_COLLIDER` before `.svg`.
- Keep visual and collider `viewBox` values aligned.
- Collider SVGs should contain only filled `rect`, `polygon`, or closed straight-line `path` solids.
```

- [ ] **Step 5: Commit docs**

```bash
git add protocol/rhino.md protocol/player-ingestion.md protocol/README.md protocol/templates/rhino-asset-package-template.md
git commit -m "docs: specify object collider svg contract"
```

---

### Task 8: End-To-End Verification With Generated Package

**Files:**
- No committed generated files unless the user asks to keep a demo package.

- [ ] **Step 1: Create or copy one test collider set**

For the current self-contained package, create matching collider SVGs under:

```text
public/layout-task-generated-sg-output-2-self-contained/assets/collision/objects/
```

Use simple rectangles first, for example `m04_group_COLLIDER.svg`:

```xml
<svg viewBox="0 0 1856 2652" xmlns="http://www.w3.org/2000/svg">
  <rect id="bookcase_solid" x="0" y="0" width="1856" height="290" fill="#000"/>
</svg>
```

This tests the data path, not final Rhino geometry quality.

- [ ] **Step 2: Patch one generated task manually for visual verification**

In `public/layout-task-generated-sg-output-2-self-contained/tasks/scene_afa7ff5e4ecd.json`, set one object:

```json
"collision": {
  "enabled": true,
  "shape": "asset_outline",
  "source": {
    "type": "svg",
    "src": "assets/collision/objects/m04_group_COLLIDER.svg"
  }
}
```

Use the existing object-level collision for variables.

- [ ] **Step 3: Build and serve**

Run:

```bash
npm run test
npm run build
pixi run serve-local
```

Expected:

- All tests pass.
- Build passes.
- Local URL works:

```text
http://127.0.0.1:5173/?base=/layout-task-generated-sg-output-2-self-contained/&task=scene_afa7ff5e4ecd&q=Q_scene_afa7ff5e4ecd
```

- [ ] **Step 4: Manual browser checks**

In the browser:

- Select a variable object.
- Confirm movement into a collider solid is blocked.
- Confirm movement through empty regions outside the collider solid is allowed.
- Confirm fixed/context objects are still not selectable.
- Confirm controls remain positioned around the selected object and are not clipped at the stage edge.

- [ ] **Step 5: Remove or keep generated test files intentionally**

If the generated package was only for local testing:

```bash
git status --short
```

Do not commit `public/layout-task-generated-*` or `output/` unless the user explicitly asks for a demo artifact in the repo.

---

## Self-Review Checklist

- Spec coverage: The plan covers protocol/schema, parser, runtime collision, loader resolution, adaptor convention, documentation, and browser verification.
- Runtime weight: Heavy work is loader/compile-time SVG parsing. Interaction only transforms local polygons and uses existing polygon intersection.
- Current asset reality: Visual SVGs with embedded PNG are not used as collision solids. The plan requires explicit collider SVGs for precise furniture collision.
- Backward compatibility: `shape: "box"` remains the default when collision is omitted or authored as legacy box.
- Rhino contract: Collider SVGs must be simple vector solids in the same local coordinate system as the visual SVG.
