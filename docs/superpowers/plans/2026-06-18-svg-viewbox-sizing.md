# SVG ViewBox Sizing Protocol Upgrade Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or equivalent task-by-task execution. Keep scope tight: this is a protocol/runtime sizing upgrade, not a visual redesign.

## Goal

Support true 1:1 SVG/CAD/Rhino exports without duplicating dimensions in JSON. For SVG objects and SVG backgrounds, the Player should be able to derive size and placement from the SVG `viewBox` when JSON does not explicitly override it.

This fixes the current failure mode where a 1:1 SVG is forced into placeholder JSON dimensions such as `500 x 500`.

## Core Rule

For SVG assets, the SVG `viewBox` is the default source of absolute world dimensions.

Priority order:

```text
object instance width/height
  > object asset default_width/default_height
  > object SVG viewBox width/height

background explicit x/y/width/height
  > background SVG viewBox x/y/width/height
```

Raster assets (`png`, `jpg`, `image`) still require explicit dimensions. Their pixel size is not assumed to equal world units.

## Semantics

### Object SVG Assets

Current required object asset:

```json
{
  "type": "svg",
  "src": "assets/objects/chair.svg",
  "default_width": 500,
  "default_height": 500,
  "anchor": "center"
}
```

New preferred 1:1 SVG asset:

```json
{
  "type": "svg",
  "src": "assets/objects/chair.svg",
  "intrinsic_unit": "mm",
  "anchor": "center"
}
```

If `default_width/default_height` are omitted, the loader reads the SVG `viewBox` and uses `viewBox.width/viewBox.height`.

Object `x/y/rotation` remain task state fields. They are not inferred from the object SVG.

### Background SVG Assets

Current required background placement:

```json
{
  "background": {
    "asset": "room_bg",
    "x": 0,
    "y": 0,
    "width": 35000,
    "height": 14000
  }
}
```

New preferred 1:1 SVG background:

```json
{
  "background": {
    "asset": "room_bg"
  }
}
```

If `x/y/width/height` are omitted and the asset is SVG, the loader reads the background SVG `viewBox` and uses:

```text
x = viewBox.x
y = viewBox.y
width = viewBox.width
height = viewBox.height
```

If some but not all background placement fields are supplied, reject with a clear error. Partial inferred placement is too easy to misunderstand.

### Explicit Overrides

Explicit JSON values remain supported:

- Object instance `width/height` intentionally scales one object instance.
- Object asset `default_width/default_height` intentionally defines a canonical size independent of SVG viewBox.
- Background `x/y/width/height` intentionally places/scales the background.

## Required Code Changes

### Types

Modify `src/types/config.ts`:

- `ObjectAssetConfig.default_width/default_height` become optional.
- `TaskBackgroundConfig.x/y/width/height` become optional.
- Runtime types remain resolved and concrete: runtime background and object dimensions must still be numbers.

### Zod Schemas

Modify `src/schemas/config.schema.ts`:

- For object assets:
  - SVG assets may omit `default_width/default_height`.
  - Non-SVG/raster assets must still include positive `default_width/default_height`.
- For task background:
  - Allow either all `x/y/width/height` or none.
  - Reject partial placement.

Modify batch schema if it wraps these config schemas.

### JSON Schema

Modify `protocol/schemas/layouttask.batch.schema.json`:

- Make object asset dimensions optional for SVG assets.
- Keep object asset dimensions required for raster assets if the JSON Schema structure can express this cleanly.
- Make task background placement optional as an all-or-none group.
- If all-or-none is awkward in JSON Schema, document that `validate-batch` is canonical for semantic validation.

### Loader

Modify `src/core/config-loader.ts`:

- Fetch SVG text for object SVG assets before resolving final object dimensions.
- Parse SVG `viewBox` once per asset and store/cache it.
- Resolve object dimensions with:

```text
object.width/height ?? asset.default_width/default_height ?? svgViewBox.width/height
```

- If no valid dimensions can be resolved, throw a clear error naming the asset/object.
- Fetch background SVG text, parse its `viewBox`, and resolve background placement:

```text
task.background explicit x/y/width/height
  ?? background SVG viewBox x/y/width/height
```

- If background placement cannot be resolved, throw a clear error naming the background asset.

Important implementation note: `compile-batch` should remain a static JSON compiler and should not need to read SVG files. SVG viewBox inference can happen in the runtime config loader.

### Renderer

No major renderer behavior change should be needed. Renderer already consumes resolved runtime dimensions:

- object `width/height`
- background `x/y/width/height`

The renderer should stay dumb and draw the resolved runtime config.

### Adaptor

Modify `protocol/adaptor/assemble-stimuli-csv.ts` and the Python prototype:

- For SVG object assets, remove placeholder `default_width/default_height` when they are `500 x 500`.
- Remove object instance `width/height` when they are `500 x 500` placeholders.
- Do not delete real dimensions that are not placeholder values.
- Keep button movement as default: `button500_rotate45_limited`.
- For SVG background trial placement, optionally remove `background.x/y/width/height` only when the generator explicitly wants full SVG viewBox trust. First implementation can leave background placement untouched unless a flag is added.

Recommended CLI flag:

```text
--trust-svg-viewbox
```

When enabled:

- strips SVG object placeholder dimensions,
- strips object instance placeholder dimensions,
- strips SVG background placement if it exactly matches the shared/world background placeholder pattern and should be inferred.

Default may remain conservative unless the user wants all generated packages to trust SVG viewBox.

## Tests

### Schema Tests

Add tests in `src/schemas/config.schema.test.ts`:

- SVG object asset may omit `default_width/default_height`.
- Raster object asset still requires dimensions.
- Background may omit all placement fields.
- Background rejects partial placement fields.

### Loader Tests

Add tests in `src/core/config-loader.test.ts`:

- Object SVG with no JSON dimensions resolves width/height from `viewBox`.
- Object instance `width/height` overrides SVG viewBox.
- Object asset `default_width/default_height` overrides SVG viewBox.
- SVG object without valid `viewBox` and without dimensions throws a clear error.
- Background SVG with no placement resolves x/y/width/height from `viewBox`.
- Background explicit placement overrides SVG viewBox.
- Background SVG without valid `viewBox` and without placement throws a clear error.

### Adaptor Tests

If adaptor tests exist, add them. If not, add a focused test file or at least validate through fixture generation:

- CSV row with `500 x 500` SVG placeholders outputs asset without dimensions under `--trust-svg-viewbox`.
- CSV row with real non-500 dimensions preserves them.
- Output batch validates.

### Regression

Run:

```bash
pixi run test
pixi run build
```

Also validate and compile:

```bash
pixi run assemble-stimuli-csv -- --csv <sg_output/data.csv> --out <sg_output/processing/layouttask-source> --experiment-id is_picture_enough_v1 --trust-svg-viewbox
pixi run validate-batch <sg_output/processing/layouttask-source/batch.json>
pixi run compile-batch <sg_output/processing/layouttask-source/batch.json> --out <sg_output/processing/layouttask-compiled>
```

## Manual Acceptance

Use a small package with real 1:1 SVG files:

- `D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\layouttask_source_first5`

Acceptance criteria:

- Objects use their SVG `viewBox` dimensions when JSON dimensions are omitted.
- Background can use its SVG `viewBox` placement when JSON placement is omitted.
- No object is forced into `500 x 500` unless explicitly intended.
- Grid, movement step, target states, and collision continue to use world units.
- Old tasks with explicit dimensions still render the same.

## Open Questions

Resolved for this plan:

- Background should use the same viewBox inference logic as objects.
- SVG viewBox is trusted as absolute world dimensions for 1:1 exports.

Remaining implementation choice:

- Whether adaptor `--trust-svg-viewbox` should default to true. Conservative plan: add the flag first, then flip default only after verifying real exports.

## Non-Goals

- No automatic unit conversion.
- No raster natural-size-to-world-size inference.
- No pan/zoom feature.
- No group transform semantics.
- No collision algorithm changes except using resolved object/background dimensions.
