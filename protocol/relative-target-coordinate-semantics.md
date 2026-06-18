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
