# Rhino / External Generator Protocol

This document is a data contract for Rhino or any other stimulus generator. It does not require a Rhino plugin, Grasshopper definition, or script in this repository. The generator only needs to emit standard JSON plus SVG/image assets that follow these conventions.

## Output Package

Recommended source package:

```text
layout-task-source/
  batch.json
  assets/
    icons/
      arrow-up.svg
      arrow-down.svg
      arrow-left.svg
      arrow-right.svg
      rotate-cw.svg
      rotate-ccw.svg
      info.svg
      hand.svg
      ...
    display-images/
      room_generated_001.svg
    backgrounds/
      room_generated_001.svg
    objects/
      chair_a.svg
      table_a.svg
  assets/objects.json
  assets/backgrounds.json
  behaviors/behaviors.json
```

`compile-batch` consumes `batch.json` and writes runtime task JSON files. A deployable Player `base` directory must also contain the referenced assets, behavior library, and Player UI icons under `assets/icons/`.

## Path Rules

All paths in JSON are resolved relative to the Player `base` root, not relative to the JSON file that contains the path.

Correct:

```json
{ "src": "assets/objects/chair_a.svg" }
```

Incorrect:

```json
{ "src": "objects/chair_a.svg" }
```

The second form only works if the deployed base root also has an `objects/` directory. The recommended layout uses `assets/objects/`.

## Canonical Batch JSON

Canonical input is standard JSON with schema:

```json
{
  "schema": "layouttask.batch.v1",
  "experiment_id": "floorplan_coherence_v1",
  "shared": {},
  "trials": []
}
```

Top-level fields:

- `schema`: must be `"layouttask.batch.v1"`.
- `experiment_id`: stable experiment identifier.
- `title`: optional human-readable batch title.
- `config_version`: optional protocol/config version label.
- `shared`: settings reused by all trials.
- `trials`: one or more generated tasks.

## Shared Fields

Required shared library paths:

```json
{
  "asset_library": "assets/objects.json",
  "background_library": "assets/backgrounds.json",
  "behavior_library": "behaviors/behaviors.json"
}
```

Recommended shared world:

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

If `shared.world` is omitted, every trial must define its own `world`.

## World Units

The Player treats coordinates as numeric world units. `world.unit` is metadata for the task-space coordinate system. It does not trigger automatic conversion. If omitted, consumers should treat the unit as unknown.

Allowed values are:

- `mm`
- `cm`
- `m`
- `px`
- `cad_unit`
- `unknown`

The following fields inherit `world.unit`:

- `world.viewBox`
- `world.origin`
- `world.grid.size`
- `background.x/y/width/height`
- `objects[].x/y`
- object asset `default_width/default_height`
- movement behavior `step`
- `objects[].target.absolute.x/y`
- collision `areas`

If Rhino exports a 1:1 drawing in millimeters, keep all fields in millimeters. The Player scales the whole world to fit the screen; it does not change the stored coordinates or grid step.

### Local Unit Overrides

Local task-space unit overrides are reserved but not implemented in v1. Do not emit fields such as `object.unit`, `background.unit`, `movement.unit`, or `collision.unit`.

If future conversion support is added, local unit fields will override `world.unit` only for their own object/section. Until then, every task-space coordinate should use `world.unit`.

## Initial State vs Target State

Every object can have two different poses:

- Reconstruction initial pose: `objects[].x`, `objects[].y`, and `objects[].rotation`.
- Correct target pose: `objects[].target.absolute`, usually exported from the stimulus scene.

For `role: "fixed"` objects, the reconstruction initial pose usually already equals the correct target pose. Fixed objects are displayed as context and normally do not need a separate `target`.

For `role: "variable"` objects, the reconstruction initial pose is usually a displaced or rotated starting pose for the participant. The correct pose shown in the stimulus should be written to `target.absolute`. If the task uses step-based movement, also write `target.relative` as the signed step delta from the initial pose to the correct pose.

Rhino exporters should treat the designed stimulus scene as the source of truth for `target.absolute`. The generator may then derive each variable object's reconstruction initial pose by applying the planned offset/rotation perturbation, and write that perturbed pose into `x`, `y`, and `rotation`.

## Asset Libraries

Object library:

```json
{
  "schema": "layouttask.assets.objects.v1",
  "objects": {
    "chair_a": {
      "type": "svg",
      "src": "assets/objects/chair_a.svg",
      "intrinsic_unit": "px",
      "default_width": 500,
      "default_height": 500,
      "anchor": "center"
    }
  }
}
```

Background library:

```json
{
  "schema": "layouttask.assets.backgrounds.v1",
  "backgrounds": {
    "room_001_bg": {
      "type": "svg",
      "src": "assets/backgrounds/room_001.svg",
      "intrinsic_unit": "cad_unit"
    }
  }
}
```

Rules:

- Library keys such as `chair_a` and `room_001_bg` are what trials reference.
- SVG files should be self-contained.
- `default_width` and `default_height` are in world units.
- `intrinsic_unit` describes the asset file's internal coordinate system only. It does not change the task-space size or placement values.
- `anchor` is usually `"center"` for furniture.

## Trial Fields

Each trial must have:

```json
{
  "qid": "Q001",
  "task_id": "room_generated_001",
  "background": {
    "asset": "room_001_bg",
    "x": 0,
    "y": 0,
    "width": 1000,
    "height": 1000
  },
  "objects": []
}
```

Rules:

- `task_id` must be filename-safe: letters, numbers, `_`, and `-`; lowercase is recommended.
- `qid` should match the survey/question identifier used by the study.
- `background.asset` references `assets/backgrounds.json`.
- `background.x/y/width/height` place the background in world units.
- `display_image` is optional for direct reconstruction but required for preview flows.

Reference image:

```json
{
  "display_image": {
    "enabled": true,
    "src": "assets/display-images/room_generated_001.svg",
    "alt": "Reference image"
  }
}
```

## Object Fields

Object example:

```json
{
  "id": "chair_variable_001",
  "role": "variable",
  "group_id": "chairs",
  "asset": "chair_a",
  "x": 100,
  "y": 150,
  "rotation": 0,
  "behavior": { "template": "drag25_rotate45_limited" }
}
```

Required:

- `id`: unique within the trial.
- `asset`: key from `assets/objects.json`.
- `x`, `y`: reconstruction initial anchor position in world units.
- `behavior`: movement/rotation behavior.

Recommended:

- `rotation`: reconstruction initial clockwise rotation in degrees; defaults to `0` if omitted.
- `role`: `"fixed"` or `"variable"` for analysis/scoring. Fixed objects are context objects; variable objects are restored by the participant.
- `group_id`: optional grouping label such as `"chairs"`.
- `initial_state_label`: optional authoring label for the reconstruction initial pose.
- `target`: correct answer state for variable objects. Use `target.absolute` for the stimulus pose and `target.relative` for step deltas from the initial pose.

## Behavior

Use a reusable template:

```json
{ "behavior": { "template": "drag25_rotate45_limited" } }
```

Use a template with local overrides:

```json
{
  "behavior": {
    "template": "drag25_rotate45_limited",
    "config": {
      "movement": { "max_left": 1, "max_right": 1 }
    }
  }
}
```

Use a full inline config:

```json
{
  "behavior": {
    "config": {
      "movement": { "mode": "none" },
      "free_drag": { "enabled": false }
    }
  }
}
```

For fixed objects, either set `role: "fixed"` for analysis or set movement behavior to `"none"` to prevent interaction. In most generated tasks, fixed objects should do both.

## Collision Protocol

Collision is optional task rule data, not a visual background. It is expressed in the same world units as `world.viewBox`, object positions, background placement, and movement steps.

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

`block` defines optional forbidden areas such as walls, columns, holes, and internal obstacles. Objects cannot overlap block areas. Simple rooms can use contain only and omit block.

Objects participate in collision with an object-level box:

```json
{
  "id": "chair_variable_001",
  "asset": "chair_a",
  "x": 100,
  "y": 150,
  "rotation": 0,
  "behavior": { "template": "drag25_rotate45_limited" },
  "collision": { "enabled": true, "shape": "box", "padding": 0 }
}
```

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

Only SVG `rect` and `polygon` elements with `data-collision="contain"` or `data-collision="block"` are parsed. `data-layout-collision` is accepted as an equivalent marker for exporters that reserve `data-collision`.

Do not use arbitrary SVG paths, masks, raster images, strokes, or visual-only artwork for collision. Split concave rooms, curved walls, or complex blocked regions into multiple convex rects or polygons before export. The collision SVG should be a hidden analysis layer or sidecar asset: it may share the same `viewBox` as the visual room SVG, but it should contain only the marked collision geometry.

## Flow

Default behavior is direct reconstruction:

```json
{ "flow": { "mode": "direct_reconstruction" } }
```

Preview-then-reconstruct:

```json
{
  "flow": {
    "mode": "preview_then_reconstruct",
    "config": {
      "preview_duration_sec": 10,
      "stage_during_preview": "hidden",
      "show_countdown": true
    }
  }
}
```

Preview mode requires an enabled `display_image`.

## Scoring Targets

When possible, export both relative and absolute targets. Analysts can choose either model later.

```json
{
  "target": {
    "relative": {
      "dx_steps": 1,
      "dy_steps": -2,
      "rotation_steps": 1
    },
    "absolute": {
      "x": 125,
      "y": 100,
      "rotation_deg": 45
    }
  }
}
```

Relative targets are expressed in movement/rotation steps from the reconstruction initial object pose (`x`, `y`, `rotation`) to the correct target pose. Absolute targets are correct final world coordinates and final rotation degrees, usually copied from the stimulus scene.

If both are available, export both. Relative targets make step-based scoring simple; absolute targets preserve the stimulus geometry and let analysts compute distance/angle errors later.

Optional tolerance:

```json
{
  "scoring": {
    "enabled": true,
    "tolerance": {
      "dx_steps": 0,
      "dy_steps": 0,
      "rotation_steps": 0,
      "distance_world": 12.5,
      "rotation_deg": 5
    }
  }
}
```

## Validation And Compilation

Validate before compiling:

```bash
pixi run validate-batch path/to/batch.json
```

Compile to a static Player base:

```bash
pixi run compile-batch path/to/batch.json --out public/layout-task-generated
```

Serve with:

```text
/?base=/layout-task-generated/&task=room_generated_001&q=Q001
```

The JSON Schema in `protocol/schemas/layouttask.batch.schema.json` is useful for generator-side structural preflight. `validate-batch` is the canonical semantic validator; it catches defaults and cross-record rules such as duplicate `task_id` values and duplicate object IDs.

## Common Mistakes

- Writing asset paths relative to `assets/objects.json` instead of the Player `base` root.
- Forgetting to include `assets/icons/` in an alternate standalone base.
- Mixing units, for example object positions in millimeters but grid size in pixels.
- Exporting duplicate object IDs within one trial.
- Using preview flow without `display_image.enabled=true`.
- Treating generated scoring reference files as public stimulus files; scoring references are for analysis and can be kept private.
