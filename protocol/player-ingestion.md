# Player Ingestion Workflow

This document describes the Player side of the protocol: how a Rhino or external-generator package is validated, compiled, loaded in the browser, saved, and scored.

For generator-facing field definitions, see `rhino.md`.

## Input Package

The Player expects a source package with one canonical batch file and the assets referenced by that file:

```text
layout-task-source/
  batch.json
  assets/
    icons/
    display-images/
    backgrounds/
    collision/
    objects/
  assets/objects.json
  assets/backgrounds.json
  behaviors/behaviors.json
```

`batch.json` is the source of truth for tasks. Asset library files map stable asset keys to SVG/image paths. The Player resolves all paths from the deployed Player `base` root, not from the folder containing the JSON file.

## Intake Pipeline

The intended Player-side sequence is:

```text
batch.json + assets
        |
        v
validate-batch
        |
        v
compile-batch
        |
        v
static Player base
        |
        v
browser task URL
        |
        v
result JSON
        |
        v
decoder / scoring CSV
```

Validate first:

```bash
pixi run validate-batch path/to/batch.json
```

If the source is a StimuliGenerator `data.csv` with embedded protocol metrics, assemble the batch package first:

```bash
pixi run assemble-stimuli-csv -- --csv path/to/data.csv --out path/to/layouttask-source --experiment-id experiment_v1
```

For 1:1 SVG/CAD/Rhino exports where SVG `viewBox` is the source of truth for object size and background placement, add:

```bash
pixi run assemble-stimuli-csv -- --csv path/to/data.csv --out path/to/layouttask-source --experiment-id experiment_v1 --trust-svg-viewbox
```

This strips SVG object dimensions and SVG background placement from the assembled JSON so the Player infers them from the SVG root `viewBox`. Do not use this flag for raster assets or SVGs whose viewBox is not in task-space world units.

Compile next:

```bash
pixi run compile-batch path/to/batch.json --out public/layout-task-generated
```

Open a compiled task with:

```text
/?base=/layout-task-generated/&task=room_generated_001&q=Q001
```

## Compiler Outputs

`compile-batch` writes Player runtime files. Authors should not hand-maintain these generated files for large batches.

Typical outputs include:

- `manifest.json`: task index used by the Player.
- `tasks/*.json`: runtime task configs loaded by the browser.
- `scoring-reference.json`: private analysis reference containing target states and scoring metadata.
- `generation-report.json`: summary of generated files and warnings.

The deployable `base` directory must also contain the referenced assets and Player UI icons under `assets/icons/`.

## Field Interpretation

The Player interprets a trial as one reconstruction task, usually one room scene.

- `world`: numeric task-space coordinate system, unit metadata, viewBox, origin, and grid.
- `background`: reconstruction-stage room/floorplan visual placed in world units.
- `display_image`: preview stimulus image for preview flows. It may include the full correct scene.
- `objects`: furniture instances shown in the reconstruction stage.
- `collision`: invisible rule layer for allowed and blocked placement areas.
- `flow`: runtime sequence, such as direct reconstruction or preview-then-reconstruct.
- `stage`: browser fitting policy for scaling world coordinates to CSS pixels.
- `metadata`: optional study-side labels such as room ID, condition, or generator source.

`world.unit` labels task-space units only. It does not trigger automatic conversion. Task-space coordinates, dimensions, grid sizes, movement steps, collision areas, and optional `target.absolute` coordinates should use that same unit. `target.relative` and saved relative answers use signed step counts.

`intrinsic_unit` on assets describes the internal coordinate system of an SVG/image file. It does not change object size, placement, target, or collision values.

SVG sizing rule:

- Object instance `width/height` overrides everything.
- Object asset `default_width/default_height` overrides SVG `viewBox`.
- If both are omitted for an SVG object, the Player uses the SVG root `viewBox.width/viewBox.height`.
- Background `x/y/width/height` overrides SVG `viewBox`.
- If background placement is omitted for an SVG background, the Player uses the SVG root `viewBox.x/y/width/height`.
- Raster object assets and raster/image backgrounds still need explicit dimensions/placement.

## Object Identity And Roles

Each object has a trial-unique `id`. This ID is the key used for interaction events, final user answers, scoring references, and CSV rows.

```json
{
  "id": "chair_variable_001",
  "role": "variable",
  "group_id": "chairs",
  "asset": "chair_a",
  "x": 100,
  "y": 150,
  "rotation": 0
}
```

Role semantics:

- `variable`: participant should reconstruct this object; it usually has `target`.
- `fixed`: context object; it is usually not scored and usually has movement disabled.

`role` is analysis semantics. It does not by itself control interaction. Interaction is controlled by `behavior`.

`group_id` is an analysis label and same-group collision escape hatch. It does not create a group transform, group position, linked movement, linked rotation, or group-level collider. During object-object collision checks, same-group objects may move out of an authored overlap, but they still block newly-created overlap.

## State Chain

For each variable object, the Player-side data model preserves three states.

1. Reconstruction initial state:

```json
{
  "x": 100,
  "y": 150,
  "rotation": 0
}
```

This is what the participant starts from in the reconstruction stage.

2. Correct answer:

```json
{
  "target": {
    "relative": { "dx_steps": 4, "dy_steps": 0, "rotation_steps": 1 }
  }
}
```

`relative` is the canonical answer: signed action steps from the initial pose. `absolute` may be present as optional analysis data, but is not required.

3. User answer:

```json
{
  "final_state": {
    "chair_variable_001": {
      "dx_steps": 2,
      "dy_steps": -1,
      "rotation_steps": 1
    }
  }
}
```

The scoring tools combine the user answer with the initial state and scoring reference to compute observed absolute positions and errors.

## Runtime Loading

At runtime, the browser:

1. Loads `manifest.json` from `base`.
2. Selects the requested `task` and `q`/`qid`.
3. Loads the compiled task JSON.
4. Loads object/background/behavior libraries and referenced assets.
5. Resolves SVG text for inline object rendering and SVG viewBox sizing when possible.
6. Parses collision SVG sidecars when configured.
7. Creates the stage, grid, background, objects, controls, and flow UI.

The browser scales the SVG stage to fit the available screen area, but object positions, grid size, movement steps, collision geometry, and saved absolute answers remain in world units. Saved relative answers remain signed movement/rotation step counts.

## Result And Scoring

After confirmation, the Player emits a result payload. Depending on output settings, this may be copied as JSON, encoded text, or sent to a data pipe.

Important result fields include:

- `qid`, `task_id`, `session`
- `display.stageScale`
- `context.world`
- `context.objects`
- `events`
- `final_state`
- `flow`

For analysis, use decoder/scoring tools with the result data and the generated `scoring-reference.json`.

The scoring output preserves:

- object ID
- role
- group ID
- world unit
- observed relative answer
- observed absolute answer
- target relative values
- target absolute values when explicitly provided
- relative, distance, and rotation errors

When `target.absolute` is omitted, scoring does not synthesize target absolute columns. Observed absolute values can still be derived from the user's relative answer and the recorded initial pose.

## Collision Consumption

Collision is a rule layer, not a visible room graphic.

Task-level collision is the global switch for one task. If it is omitted or
`enabled: false`, object collision shapes are not evaluated even when objects
declare their own collision settings.

Task-level collision defines room constraints:

- `contain`: allowed placement areas.
- `block`: forbidden areas such as walls, columns, holes, or internal obstacles.

Object-level collision defines whether one object participates and which shape to use:

```json
{
  "collision": { "enabled": true, "shape": "box", "padding": 0 }
}
```

Object collision supports three shapes:

- `box`: legacy bounding box based on object width/height.
- `polygons`: explicit object-local polygons in the same coordinate system as the object asset.
- `asset_outline`: authoring convenience that loads a collider SVG and resolves it to `polygons`.

Example `asset_outline`:

```json
{
  "collision": {
    "enabled": true,
    "shape": "asset_outline",
    "source": {
      "type": "svg",
      "src": "assets/collision/objects/chair_a_COLLISION.svg"
    }
  }
}
```

Compiled task JSON may contain `asset_outline`. During runtime loading, the
browser fetches the SVG once per source, parses its solid vector geometry, and
stores a resolved `polygons` collision shape. Interaction-time collision then
transforms those polygons by the object's `x`, `y`, `rotation`, and `anchor`;
it does not inspect visual SVG transparency or raster pixels.

Collider SVGs are analysis assets. They should live under
`assets/collision/objects/`, use the `_COLLISION.svg` suffix by convention, and
share the visual object's local coordinate system. The parser accepts filled
`rect`, `polygon`, closed `path`, and sized `<use>` solids. It applies supported
transforms and ignores inline `<image>` definitions except when a sized `<use>`
gives them a rectangular footprint. It rejects `mask`, `clipPath`, `filter`, and
rounded rects.

If a candidate move or rotation would violate collision, the Player blocks the action, leaves the object in its previous pose, and can record a blocked event with reason `collision`.

Both levels must allow collision for object-object blocking to happen: the task
must have `collision.enabled: true`, and both the moving object and the other
object must have `collision.enabled: true`.

Same-group objects can escape an authored overlap without freezing movement. If
a fixed/context object is only a visual reference layer for the same furniture
group, give it the same `group_id` as the variable object. New overlaps with the
same group, and all overlaps with different groups, still block movement when
collision is enabled on both objects.

## Current Boundaries

The current Player intentionally keeps these boundaries:

- Standard JSON is canonical input; JSON5 is not required.
- `world.unit` is metadata only; there is no automatic unit conversion.
- Local unit override fields are reserved and not implemented.
- `group_id` is an analysis tag only, not a functional furniture group.
- `fixed` currently means context semantics; it is not a replacement for disabling movement.
- A trial is the task unit. A room can be identified through `task_id`, `qid`, or `metadata`.
- Scoring references can be kept private; they do not need to be deployed as participant-facing stimulus files.

## Minimal Acceptance Check

Before using a Rhino export in a real study:

1. Run `validate-batch`.
2. Run `compile-batch`.
3. Open at least one generated task in the browser.
4. Confirm preview image, background, objects, grid, collision, and movement behavior.
5. Submit one result.
6. Decode/score that result and confirm target errors are sensible.
